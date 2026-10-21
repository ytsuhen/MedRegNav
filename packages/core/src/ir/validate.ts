// Structural validation of a rule set: what the schema cannot say. Every check returns issues instead of throwing,
// so the CLI and the tests can list them all. Adapted from vlk-engine (packages/core/src/ir/validate.ts),
// Apache-2.0, same author: duplicate ids, missing children, cycles, orphans, child counts, lifecycle.
import { type AttributeRegistry, domain } from "../attributes.ts";
import { canonicalJson, sha256Hex } from "../hash.ts";
import { type DeviceIr, DeviceIrSchema, isGate, NO_OUTCOME } from "./schema.ts";

export type IrIssueCode =
  | "schema"
  | "duplicate-id"
  | "missing-node"
  | "cycle"
  | "orphan"
  | "child-count"
  | "unknown-attribute"
  | "bad-op"
  | "bad-value"
  | "unknown-rule"
  | "unknown-outcome"
  | "unknown-criterion"
  | "uncited"
  | "unused-criterion"
  | "rank"
  | "cross-check"
  | "lifecycle"
  | "irhash";

export interface IrIssue {
  rule: string;
  nodeId?: string;
  code: IrIssueCode;
  message: string;
}

/** sha256 of the canonical JSON of the IR with `metadata.irHash` blanked: what a revision is. */
export function irHash(ir: DeviceIr): string {
  return sha256Hex(canonicalJson({ ...ir, metadata: { ...ir.metadata, irHash: "" } }));
}

/** Validates every rule of a set against the schema, each other and the attribute registry. */
export function validateRules(inputs: readonly unknown[], registry: AttributeRegistry): IrIssue[] {
  const issues: IrIssue[] = [];
  const rules: DeviceIr[] = [];
  inputs.forEach((input, i) => {
    const parsed = DeviceIrSchema.safeParse(input);
    if (parsed.success) rules.push(parsed.data);
    else {
      const rule = (input as { id?: string })?.id ?? `#${i}`;
      for (const e of parsed.error.issues)
        issues.push({ rule, code: "schema", message: `${e.path.join(".")}: ${e.message}` });
    }
  });
  const ruleIds = rules.map((r) => r.id);
  for (const id of ruleIds.filter((x, i) => ruleIds.indexOf(x) !== i)) {
    issues.push({ rule: id, code: "duplicate-id", message: "duplicate rule id" });
  }
  const byRule = new Map(rules.map((r) => [r.id, r]));
  for (const ir of rules) issues.push(...validateRule(ir, registry, byRule));
  issues.push(...ruleCycles(rules));
  return issues;
}

function validateRule(ir: DeviceIr, registry: AttributeRegistry, rules: Map<string, DeviceIr>): IrIssue[] {
  const issues: IrIssue[] = [];
  const add = (code: IrIssueCode, message: string, nodeId?: string) =>
    issues.push({ rule: ir.id, code, message, ...(nodeId !== undefined && { nodeId }) });
  const attributes = new Map(registry.attributes.map((a) => [a.id, a]));
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const criteria = new Set(ir.criteria.map((c) => c.id));

  const nodeIds = ir.nodes.map((n) => n.id);
  for (const id of nodeIds.filter((x, i) => nodeIds.indexOf(x) !== i)) add("duplicate-id", "duplicate node id", id);
  const criterionIds = ir.criteria.map((c) => c.id);
  for (const id of criterionIds.filter((x, i) => criterionIds.indexOf(x) !== i))
    add("duplicate-id", `duplicate criterion ${id}`);
  const outcomeIds = ir.outcomes.map((o) => o.id);
  for (const id of outcomeIds.filter((x, i) => outcomeIds.indexOf(x) !== i))
    add("duplicate-id", `duplicate outcome ${id}`);

  const usedCriteria = new Set<string>();
  const cite = (ids: readonly string[], where: string, nodeId?: string) => {
    for (const c of ids) {
      if (!criteria.has(c)) add("unknown-criterion", `${where}: unknown criterion ${c}`, nodeId);
      usedCriteria.add(c);
    }
  };

  for (const n of ir.nodes) {
    cite(n.prov.criterionIds, "node", n.id);
    if (n.prov.basis === "explicit" && n.prov.criterionIds.length === 0) {
      add("uncited", "an explicit node needs at least one criterion", n.id);
    }
    if (isGate(n)) {
      for (const c of n.childIds) if (!byId.has(c)) add("missing-node", `unknown child ${c}`, n.id);
      if (new Set(n.childIds).size !== n.childIds.length) add("child-count", "duplicate child", n.id);
      if (n.kind === "not" && n.childIds.length !== 1) add("child-count", "not takes exactly one child", n.id);
      if ((n.kind === "all" || n.kind === "any") && n.childIds.length < 2)
        add("child-count", `${n.kind} takes ≥ 2 children`, n.id);
      if (n.kind === "atLeast" && (n.n < 1 || n.n > n.childIds.length))
        add("child-count", "atLeast n outside [1, children]", n.id);
    } else if (n.kind === "attr") {
      const a = attributes.get(n.attr);
      if (!a) {
        add("unknown-attribute", `attribute ${n.attr} is not in data/attributes.json`, n.id);
        continue;
      }
      const values = domain(a);
      if (n.op === "isTrue" && (a.type !== "boolean" || n.values.length > 0))
        add("bad-op", "isTrue: boolean attribute, no values", n.id);
      if (n.op === "equals" && n.values.length !== 1) add("bad-op", "equals takes exactly one value", n.id);
      if (n.op === "in" && n.values.length < 2) add("bad-op", "in takes ≥ 2 values (use equals)", n.id);
      for (const v of n.values)
        if (!values.includes(v)) add("bad-value", `${JSON.stringify(v)} is not a value of ${n.attr}`, n.id);
    } else {
      const other = rules.get(n.rule);
      if (!other) add("unknown-rule", `unknown rule ${n.rule}`, n.id);
      else
        for (const o of n.in) {
          if (o === NO_OUTCOME || !other.outcomes.some((x) => x.id === o))
            add("unknown-outcome", `${n.rule} has no outcome ${o}`, n.id);
        }
    }
  }

  for (const o of ir.outcomes) {
    if (!byId.has(o.rootId)) add("missing-node", `outcome ${o.id}: unknown root ${o.rootId}`);
    cite(o.criterionIds, `outcome ${o.id}`);
  }
  if (ir.resolution === "highest-rank") {
    const ranks = ir.outcomes.map((o) => o.rank);
    if (new Set(ranks).size !== ranks.length) add("rank", "highest-rank needs distinct ranks");
    if (ir.resolutionCriterionIds.length === 0) add("uncited", "highest-rank resolution needs a criterion");
  }
  cite(ir.resolutionCriterionIds, "resolution");
  if (ir.effective) cite(ir.effective.criterionIds, "effective");
  if (ir.scopeId && !byId.has(ir.scopeId)) add("missing-node", `unknown scope node ${ir.scopeId}`);
  if (ir.role === "hypothetical" && !ir.revises) add("schema", "a hypothetical rule names the rule it revises");
  if (ir.revises) {
    const revised = rules.get(ir.revises);
    if (!revised) add("unknown-rule", `revises unknown rule ${ir.revises}`);
    else
      for (const o of revised.outcomes)
        if (!ir.outcomes.some((x) => x.id === o.id))
          add(
            "unknown-outcome",
            `a revision keeps the outcomes of ${ir.revises} (rules read them): ${o.id} is missing`,
          );
  }
  if (ir.role === "primary" && !ir.effective) add("schema", "a primary rule needs effective dates");
  if (ir.crossCheck) {
    cite(ir.crossCheck.criterionIds, "crossCheck");
    const a = attributes.get(ir.crossCheck.attr);
    if (!a) add("cross-check", `unknown attribute ${ir.crossCheck.attr}`);
    for (const [value, outcome] of Object.entries(ir.crossCheck.map)) {
      if (a && !domain(a).map(String).includes(value)) add("cross-check", `${value} is not a value of ${a.id}`);
      if (!ir.outcomes.some((o) => o.id === outcome)) add("cross-check", `unknown outcome ${outcome}`);
    }
  }
  for (const c of ir.criteria) if (!usedCriteria.has(c.id)) add("unused-criterion", `criterion ${c.id} is never cited`);

  // Reachability and cycles from the outcome roots and the scope.
  const roots = [...ir.outcomes.map((o) => o.rootId), ...(ir.scopeId ? [ir.scopeId] : [])];
  const seen = new Set<string>();
  const stack = new Set<string>();
  const visit = (id: string) => {
    if (stack.has(id)) {
      add("cycle", "cycle", id);
      return;
    }
    if (seen.has(id)) return;
    const n = byId.get(id);
    if (!n) return;
    seen.add(id);
    stack.add(id);
    if (isGate(n)) for (const c of n.childIds) visit(c);
    stack.delete(id);
  };
  for (const r of roots) visit(r);
  for (const n of ir.nodes) if (!seen.has(n.id)) add("orphan", "not reachable from any outcome or the scope", n.id);

  const m = ir.metadata;
  if (m.status !== "draft" && ir.nodes.some((n) => n.review.status !== "reviewed")) {
    add("lifecycle", `${m.status} needs every node reviewed`);
  }
  if (m.status === "approved" && (!m.approval.by || !m.approval.at))
    add("lifecycle", "approved needs approval.by and .at");
  if (m.irHash !== irHash(ir)) add("irhash", "metadata.irHash is stale: run pnpm mrn rules --rehash");
  return issues;
}

function ruleCycles(rules: readonly DeviceIr[]): IrIssue[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const issues: IrIssue[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (r: DeviceIr) => {
    if (state.get(r.id) === "done") return;
    if (state.get(r.id) === "visiting") {
      issues.push({ rule: r.id, code: "cycle", message: "rules read each other in a cycle" });
      return;
    }
    state.set(r.id, "visiting");
    for (const n of r.nodes) {
      const dep = n.kind === "result" ? byId.get(n.rule) : undefined;
      if (dep) visit(dep);
    }
    state.set(r.id, "done");
  };
  for (const r of rules) visit(r);
  return issues;
}
