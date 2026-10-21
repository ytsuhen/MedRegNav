// MC/DC (modified condition/decision coverage) of every rule: for each leaf — a condition on an attribute or on
// another rule's result — a pair of complete inputs that differ only in what that leaf reads (and in the results of
// the rules that are derived from it, which cannot stay put), where the leaf flips and the rule's outcome changes.
// "unique": no other leaf changes (unique-cause MC/DC); "masking": other leaves change too (one enum value replacing
// another, a derived result), but the leaf is part of the explanation of both outcomes; "none": no such pair exists,
// so the leaf never decides the outcome on its own (e.g. it is dominated by a stricter outcome). Inputs are only
// those a real profile can produce (space.ts `jointInputs`).
// Idea from vlk-engine (packages/core/src/analysis/mcdc.ts), Apache-2.0, same author: a pair per leaf, reported as it
// is (never forced to 100 %); the search is new — the input space here is small and discrete, so it is exhaustive.
import type { AttributeRegistry, AttributeValue } from "../attributes.ts";
import type { RuleResult } from "../ir/evaluate.ts";
import { type DeviceIr, NO_OUTCOME } from "../ir/schema.ts";
import {
  analysisOrder,
  closure,
  dependencies,
  directAttributes,
  evaluateOn,
  explanationNodes,
  jointInputs,
  type ResultShape,
  shapeKey,
} from "./space.ts";

export interface McdcPair {
  /** The two values of what the leaf reads (an attribute value, or the other rule's outcome). */
  values: [string, string];
  outcomes: [string, string];
  /** The rest of the input, shared by both runs. */
  profile: Record<string, AttributeValue>;
  dependencies: Record<string, string>;
}

export interface McdcLeaf {
  nodeId: string;
  kind: "attr" | "result";
  /** The attribute or rule the leaf reads. */
  reads: string;
  status: "unique" | "masking" | "none";
  pair: McdcPair | null;
}

export interface RuleMcdc {
  ruleId: string;
  role: DeviceIr["role"];
  /** Distinct complete inputs (attribute values × dependency outcomes) a real profile can produce. */
  inputs: number;
  leaves: McdcLeaf[];
  achieved: number;
  total: number;
}

const outcomeOf = (r: RuleResult) => (r.scope === false ? NO_OUTCOME : (r.value ?? r.possible.join("|")));
const shapeOutcome = (s: ResultShape) => (s.scope === false ? NO_OUTCOME : s.possible.join("|"));

export function mcdcPairs(rules: readonly DeviceIr[], registry: AttributeRegistry): RuleMcdc[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  return analysisOrder(rules).map((ir) => {
    const { inputs } = jointInputs(ir, byId, registry, false);
    const runs = inputs.map((input) => {
      const result = evaluateOn(ir, input.profile, input.shapes);
      return { input, result, outcome: outcomeOf(result), explains: explanationNodes(ir, result) };
    });
    const own = directAttributes(ir);
    const deps = dependencies(ir);
    // The rules this rule reads that are derived from a variable (they read it, directly or through other rules).
    const derived = (variable: string, kind: "attr" | "result") =>
      new Set(
        deps.filter((d) => {
          const chain = closure(byId, [d]);
          return kind === "attr"
            ? chain.some((r) => directAttributes(r).includes(variable))
            : d !== variable && chain.some((r) => r.id === variable);
        }),
      );
    const leafNodes = ir.nodes.filter((n) => n.kind === "attr" || n.kind === "result");
    const valueAt = (run: (typeof runs)[number], variable: string, kind: "attr" | "result") =>
      kind === "attr" ? String(run.input.profile[variable]) : shapeOutcome(run.input.shapes[variable] as ResultShape);
    const leaves = leafNodes.map((node): McdcLeaf => {
      const kind = node.kind === "attr" ? "attr" : "result";
      const reads = node.kind === "attr" ? node.attr : node.kind === "result" ? node.rule : "";
      const coupled = derived(reads, kind);
      const fixed = deps.filter((d) => !(kind === "result" && d === reads) && !coupled.has(d));
      const rest = (run: (typeof runs)[number]) =>
        JSON.stringify([
          own.filter((a) => !(kind === "attr" && a === reads)).map((a) => run.input.profile[a]),
          fixed.map((d) => shapeKey(run.input.shapes[d] as ResultShape)),
        ]);
      const groups = new Map<string, typeof runs>();
      for (const run of runs) {
        const k = rest(run);
        const g = groups.get(k);
        if (g) g.push(run);
        else groups.set(k, [run]);
      }
      let masking: McdcPair | null = null;
      for (const group of groups.values()) {
        for (const [i, a] of group.entries()) {
          for (const b of group.slice(i + 1)) {
            const ta = a.result.nodes[node.id] ?? null;
            const tb = b.result.nodes[node.id] ?? null;
            if (ta === tb || ta === null || tb === null || a.outcome === b.outcome) continue;
            const pair: McdcPair = {
              values: [valueAt(a, reads, kind), valueAt(b, reads, kind)],
              outcomes: [a.outcome, b.outcome],
              profile: Object.fromEntries(
                own
                  .filter((x) => !(kind === "attr" && x === reads))
                  .map((x) => [x, a.input.profile[x] as AttributeValue]),
              ),
              dependencies: Object.fromEntries(fixed.map((d) => [d, shapeOutcome(a.input.shapes[d] as ResultShape)])),
            };
            const othersSame = leafNodes.every(
              (l) => l.id === node.id || (a.result.nodes[l.id] ?? null) === (b.result.nodes[l.id] ?? null),
            );
            if (othersSame) return { nodeId: node.id, kind, reads, status: "unique", pair };
            if (!masking && a.explains.has(node.id) && b.explains.has(node.id)) masking = pair;
          }
        }
      }
      return masking
        ? { nodeId: node.id, kind, reads, status: "masking", pair: masking }
        : { nodeId: node.id, kind, reads, status: "none", pair: null };
    });
    return {
      ruleId: ir.id,
      role: ir.role,
      inputs: inputs.length,
      leaves,
      achieved: leaves.filter((l) => l.status !== "none").length,
      total: leaves.length,
    };
  });
}
