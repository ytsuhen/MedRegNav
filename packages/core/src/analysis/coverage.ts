// Coverage of the attribute space: every rule evaluated on every distinct input a profile can give it — each
// attribute it reads over its domain and "unknown", each rule it reads over the results that rule can give jointly
// with them (space.ts `jointInputs`, exact). The property that matters: a rule never ends with no possible outcome
// (or two exclusive ones) — every combination of answers gives an outcome or an explicit set of possible outcomes.
// Each input stands for many profiles; `profiles` says how many profiles of the attributes involved are covered.
import type { AttributeRegistry, AttributeValue } from "../attributes.ts";
import type { RuleResult, Truth } from "../ir/evaluate.ts";
import type { DeviceIr } from "../ir/schema.ts";
import {
  analysisOrder,
  dependencies,
  directAttributes,
  evaluateOn,
  jointInputs,
  type ResultShape,
  shapeKey,
  shapeOf,
} from "./space.ts";

export interface CoverageResult {
  scope: Truth;
  possible: string[];
  status: RuleResult["status"];
  count: number;
}

export interface CoverageFailure {
  profile: Record<string, AttributeValue | null>;
  dependencies: Record<string, ResultShape>;
  status: RuleResult["status"];
}

export interface RuleCoverage {
  ruleId: string;
  role: DeviceIr["role"];
  attributes: string[];
  dependencies: string[];
  /** Distinct inputs evaluated. */
  inputs: number;
  /** Profiles over every attribute involved (with "unknown") that the inputs stand for. */
  profiles: number;
  /** Distinct results reached, most frequent first. */
  results: CoverageResult[];
  /** Inputs that end in no possible outcome or a conflict between exclusive outcomes (first 20). */
  failures: CoverageFailure[];
  failureCount: number;
  /** How often each leaf (attribute or result node) was true, false and unknown. */
  leaves: { nodeId: string; true: number; false: number; unknown: number }[];
}

/** Coverage of every rule (hypothetical ones too). */
export function ruleCoverage(rules: readonly DeviceIr[], registry: AttributeRegistry): RuleCoverage[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  return analysisOrder(rules).map((ir) => {
    const { inputs, profiles } = jointInputs(ir, byId, registry, true);
    const leafIds = ir.nodes.filter((n) => n.kind === "attr" || n.kind === "result").map((n) => n.id);
    const leaves = new Map(leafIds.map((id) => [id, { nodeId: id, true: 0, false: 0, unknown: 0 }]));
    const results = new Map<string, CoverageResult>();
    const failures: CoverageFailure[] = [];
    let failureCount = 0;
    for (const input of inputs) {
      const r = evaluateOn(ir, input.profile, input.shapes);
      const key = `${r.status}|${shapeKey(shapeOf(r))}`;
      const seen = results.get(key);
      if (seen) seen.count++;
      else results.set(key, { scope: r.scope, possible: r.possible, status: r.status, count: 1 });
      if (r.status === "conflict") {
        failureCount++;
        if (failures.length < 20)
          failures.push({ profile: input.profile, dependencies: input.shapes, status: r.status });
      }
      for (const [id, counts] of leaves) {
        const t = r.nodes[id] ?? null;
        if (t === true) counts.true++;
        else if (t === false) counts.false++;
        else counts.unknown++;
      }
    }
    return {
      ruleId: ir.id,
      role: ir.role,
      attributes: directAttributes(ir),
      dependencies: dependencies(ir),
      inputs: inputs.length,
      profiles,
      results: [...results.values()].sort((a, b) => b.count - a.count),
      failures,
      failureCount,
      leaves: [...leaves.values()],
    };
  });
}
