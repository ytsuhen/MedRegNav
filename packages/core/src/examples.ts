// Reference examples (`data/examples/*.json`): devices described in MDCG guidance, with the outcome the guidance
// states. The example text and the stated outcome are verbatim citations; the attribute values are our reading of
// the example (`interpretation`). They are the reference tests of the rules and the presets of the UI.
import { z } from "zod";
import type { Profile } from "./attributes.ts";
import { evaluateRules, type RuleResult } from "./ir/evaluate.ts";
import type { DeviceIr } from "./ir/schema.ts";
import { IdSchema, TextSchema } from "./model/text.ts";
import { CitationSchema } from "./source/citation.ts";

export const ExampleSchema = z.strictObject({
  id: IdSchema,
  title: TextSchema,
  source: CitationSchema.describe("The example as the guidance writes it, including the stated outcome"),
  also: z.array(CitationSchema).optional().describe("Further citations, e.g. the table row that states the outcome"),
  profile: z.record(z.string(), z.union([z.boolean(), z.string()])),
  expected: z.array(z.strictObject({ rule: IdSchema, outcome: z.string() })).min(1),
  interpretation: TextSchema.describe("How the example was read into attribute values"),
  preset: z.boolean().describe("Offered in the UI as a ready-made device"),
});

export type Example = z.infer<typeof ExampleSchema>;

export const ExamplesFileSchema = z.strictObject({ examples: z.array(ExampleSchema).min(1) });

export interface ExampleRun {
  example: Example;
  results: Record<string, RuleResult>;
  failures: { rule: string; expected: string; actual: string[]; status: RuleResult["status"] | "missing" }[];
}

/** Evaluates an example and compares every expected outcome with the determined result. */
export function runExample(rules: readonly DeviceIr[], example: Example, asOf?: string): ExampleRun {
  const results = evaluateRules(rules, example.profile as Profile, asOf);
  const failures: ExampleRun["failures"] = [];
  for (const e of example.expected) {
    const r = results[e.rule];
    if (!r) failures.push({ rule: e.rule, expected: e.outcome, actual: [], status: "missing" });
    else if (r.value !== e.outcome)
      failures.push({ rule: e.rule, expected: e.outcome, actual: r.possible, status: r.status });
  }
  return { example, results, failures };
}
