// Cross-checks: a guidance rule (e.g. the IMDRF table of MDCG 2019-11, Annex III) must agree with what the law's
// rule gives for the same device. The rule's `crossCheck` maps an attribute that the law's rule reads to the outcome
// the guidance should then give; disagreement points at an inconsistent answer.
import type { Profile } from "../attributes.ts";
import type { RuleResult } from "./evaluate.ts";
import type { DeviceIr } from "./schema.ts";

export interface CrossCheckResult {
  ruleId: string;
  status: "consistent" | "inconsistent" | "incomplete" | "not-applicable";
  /** What the mapped attribute says the outcome should be. */
  expected: string | null;
  /** What the guidance rule gives. */
  actual: string | null;
}

export function crossCheck(ir: DeviceIr, result: RuleResult, profile: Profile): CrossCheckResult | null {
  if (!ir.crossCheck) return null;
  const value = profile[ir.crossCheck.attr];
  const expected = value === null || value === undefined ? null : (ir.crossCheck.map[String(value)] ?? null);
  const actual = result.value;
  const status: CrossCheckResult["status"] =
    result.status === "not-applicable"
      ? "not-applicable"
      : expected === null || actual === null
        ? "incomplete"
        : expected === actual
          ? "consistent"
          : "inconsistent";
  return { ruleId: ir.id, status, expected, actual };
}
