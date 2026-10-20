// The three-valued evaluator (Kleene logic): an unknown attribute is null, and a rule's result is the set of
// outcomes still possible, not a guess. Rules may read other rules' results, so a rule set is evaluated in
// dependency order. Every node also gets its "support": the attributes that explain its value, which the UI uses
// to link attribute chips with the branches they cause.
// Adapted from vlk-engine (packages/core/src/ir/oracle.ts), Apache-2.0, same author: the same and3/or3/not3 and
// atLeast semantics; the leaves and the outcome resolution are new.
import type { Profile } from "../attributes.ts";
import { type DeviceIr, type IrNode, isGate, NO_OUTCOME } from "./schema.ts";

export type Truth = boolean | null;

export interface RuleResult {
  ruleId: string;
  /** The rule applies on the as-of date (a hypothetical rule never does). */
  inForce: boolean;
  /** Whether the rule applies to this device at all (its scope node); true without one. */
  scope: Truth;
  nodes: Record<string, Truth>;
  outcomes: Record<string, Truth>;
  /** Outcomes still possible (strictest / first first), assuming the rule applies. Empty when it does not. */
  possible: string[];
  /** The single outcome, when the rule surely applies and only one outcome is possible. */
  value: string | null;
  status: "determined" | "undetermined" | "not-applicable" | "conflict";
  /** Attributes that explain the result, in reading order of the rule. */
  support: string[];
  nodeSupport: Record<string, string[]>;
}

export type Results = Readonly<Record<string, RuleResult>>;

export const and3 = (a: Truth, b: Truth): Truth =>
  a === false || b === false ? false : a === null || b === null ? null : true;
export const or3 = (a: Truth, b: Truth): Truth =>
  a === true || b === true ? true : a === null || b === null ? null : false;
export const not3 = (a: Truth): Truth => (a === null ? null : !a);

/** The outcome ids a result may stand for, with NO_OUTCOME when the rule may not apply. */
export function possibleWithScope(result: RuleResult): string[] {
  if (result.scope === false) return [NO_OUTCOME];
  return result.scope === null ? [...result.possible, NO_OUTCOME] : result.possible;
}

/** Is the result surely in `set` (true), surely not (false), or unknown (null)? */
export function resultIn(result: RuleResult, set: readonly string[]): Truth {
  const possible = possibleWithScope(result);
  if (possible.length === 0) return null;
  const inside = possible.filter((p) => set.includes(p)).length;
  return inside === possible.length ? true : inside === 0 ? false : null;
}

export function isInForce(ir: DeviceIr, asOf?: string): boolean {
  if (ir.role === "hypothetical") return false;
  if (!ir.effective || asOf === undefined) return true;
  return asOf >= ir.effective.from && (ir.effective.until === undefined || asOf < ir.effective.until);
}

/** Evaluates one rule; `results` must hold every rule it reads. Assumes a valid IR (validateIr). */
export function evaluateRule(ir: DeviceIr, profile: Profile, results: Results = {}, asOf?: string): RuleResult {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const truth = new Map<string, Truth>();
  const node = (id: string): IrNode => {
    const n = byId.get(id);
    if (!n) throw new Error(`${ir.id}: unknown node ${id}`);
    return n;
  };
  const value = (id: string): Truth => {
    const known = truth.get(id);
    if (known !== undefined) return known;
    const t = leafOrGate(node(id));
    truth.set(id, t);
    return t;
  };
  const leafOrGate = (n: IrNode): Truth => {
    switch (n.kind) {
      case "all":
        return n.childIds.map(value).reduce<Truth>(and3, true);
      case "any":
        return n.childIds.map(value).reduce<Truth>(or3, false);
      case "not":
        return not3(value(n.childIds[0] ?? ""));
      case "atLeast": {
        const states = n.childIds.map(value);
        const yes = states.filter((s) => s === true).length;
        const unknown = states.filter((s) => s === null).length;
        return yes >= n.n ? true : yes + unknown < n.n ? false : null;
      }
      case "attr": {
        const v = profile[n.attr];
        if (v === null || v === undefined) return null;
        if (n.op === "isTrue") return v === true;
        if (n.op === "equals") return v === n.values[0];
        return n.values.includes(v);
      }
      case "result": {
        const r = results[n.rule];
        if (!r) throw new Error(`${ir.id}: rule ${n.rule} must be evaluated first`);
        return resultIn(r, n.in);
      }
    }
  };

  for (const n of ir.nodes) value(n.id);
  const scope = ir.scopeId ? value(ir.scopeId) : true;
  const outcomes = Object.fromEntries(ir.outcomes.map((o) => [o.id, value(o.rootId)]));
  const ranked = [...ir.outcomes].sort((a, b) => b.rank - a.rank);
  const trues = ranked.filter((o) => outcomes[o.id] === true);
  const nulls = ranked.filter((o) => outcomes[o.id] === null);
  let possible: string[];
  let conflict = false;
  if (ir.resolution === "highest-rank") {
    const best = trues[0];
    possible = best ? [...nulls.filter((o) => o.rank > best.rank), best].map((o) => o.id) : nulls.map((o) => o.id);
  } else {
    conflict = trues.length > 1;
    possible = trues.length > 0 ? trues.map((o) => o.id) : nulls.map((o) => o.id);
  }
  if (scope === false) possible = [];
  const status: RuleResult["status"] =
    scope === false
      ? "not-applicable"
      : conflict || possible.length === 0
        ? "conflict"
        : possible.length === 1 && scope === true
          ? "determined"
          : "undetermined";

  const nodeSupport = supports(ir, node, truth, results);
  const support = new Set<string>();
  const add = (id: string | undefined) => {
    for (const a of (id && nodeSupport[id]) || []) support.add(a);
  };
  if (scope !== true) add(ir.scopeId);
  if (scope !== false) {
    const rootOf = (id: string) => ir.outcomes.find((o) => o.id === id)?.rootId;
    for (const id of possible) add(rootOf(id));
    // Why not stricter: the higher outcomes that are false.
    const top = ranked.find((o) => o.id === possible.at(-1));
    if (ir.resolution === "highest-rank" && top) {
      for (const o of ranked) if (o.rank > top.rank && outcomes[o.id] === false) add(o.rootId);
    }
  }
  const order = attributeOrder(ir, results);
  return {
    ruleId: ir.id,
    inForce: false,
    scope,
    nodes: Object.fromEntries(truth),
    outcomes,
    possible,
    value: status === "determined" ? (possible[0] ?? null) : null,
    status,
    support: [...support].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    nodeSupport,
  };
}

/** For every node, the attributes that explain its truth value (witnesses). */
function supports(
  ir: DeviceIr,
  node: (id: string) => IrNode,
  truth: Map<string, Truth>,
  results: Results,
): Record<string, string[]> {
  const memo = new Map<string, Set<string>>();
  const t = (id: string) => truth.get(id) ?? null;
  const union = (ids: readonly string[]) => new Set(ids.flatMap((id) => [...of(id)]));
  const of = (id: string): Set<string> => {
    const known = memo.get(id);
    if (known) return known;
    const n = node(id);
    let s: Set<string>;
    if (n.kind === "attr") s = new Set([n.attr]);
    else if (n.kind === "result") s = new Set(results[n.rule]?.support ?? []);
    else {
      const v = t(id);
      const kids = n.childIds;
      const withState = (state: Truth) => kids.filter((k) => t(k) === state);
      if (n.kind === "not") s = union(kids);
      else if (v === null) s = union(withState(null));
      else if (n.kind === "all") s = v ? union(kids) : union(withState(false).slice(0, 1));
      else if (n.kind === "any") s = v ? union(withState(true).slice(0, 1)) : union(kids);
      else s = v ? union(withState(true).slice(0, n.n)) : union(withState(false));
    }
    memo.set(id, s);
    return s;
  };
  return Object.fromEntries(ir.nodes.map((n) => [n.id, [...of(n.id)]]));
}

/** First position of each attribute when the rule is read node by node (attributes of read rules first). */
function attributeOrder(ir: DeviceIr, results: Results): Map<string, number> {
  const order = new Map<string, number>();
  const add = (a: string) => {
    if (!order.has(a)) order.set(a, order.size);
  };
  for (const n of ir.nodes) {
    if (n.kind === "result") for (const a of results[n.rule]?.support ?? []) add(a);
    if (n.kind === "attr") add(n.attr);
  }
  return order;
}

/** Rules in dependency order (a rule after every rule it reads). Throws on a cycle or an unknown rule. */
export function ruleOrder(rules: readonly DeviceIr[]): DeviceIr[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: DeviceIr[] = [];
  const visit = (r: DeviceIr) => {
    if (done.has(r.id)) return;
    if (visiting.has(r.id)) throw new Error(`rule cycle through ${r.id}`);
    visiting.add(r.id);
    for (const n of r.nodes) {
      if (n.kind !== "result") continue;
      const dep = byId.get(n.rule);
      if (!dep) throw new Error(`${r.id} reads unknown rule ${n.rule}`);
      visit(dep);
    }
    visiting.delete(r.id);
    done.add(r.id);
    out.push(r);
  };
  for (const r of rules) visit(r);
  return out;
}

/** Evaluates a rule set in dependency order. */
export function evaluateRules(rules: readonly DeviceIr[], profile: Profile, asOf?: string): Record<string, RuleResult> {
  const results: Record<string, RuleResult> = {};
  for (const ir of ruleOrder(rules)) {
    results[ir.id] = { ...evaluateRule(ir, profile, results, asOf), inForce: isInForce(ir, asOf) };
  }
  return results;
}

/**
 * The rule set with a hypothetical revision in place of the rule it revises (under the revised rule's id, so the
 * rules that read it read the revision).
 */
export function withRevision(rules: readonly DeviceIr[], revision: DeviceIr): DeviceIr[] {
  if (!revision.revises) throw new Error(`${revision.id} revises no rule`);
  return rules.map((r) => (r.id === revision.revises ? { ...revision, id: revision.revises, role: "primary" } : r));
}

/** Every node id reachable from `rootId` (the node itself included). */
export function descendants(ir: DeviceIr, rootId: string): Set<string> {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (n && isGate(n)) for (const child of n.childIds) visit(child);
  };
  visit(rootId);
  return seen;
}
