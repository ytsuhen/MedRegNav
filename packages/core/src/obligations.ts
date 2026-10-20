// The obligations catalogue (`data/obligations/*.json`) and the standards it points to (`data/standards.json`).
// An obligation is data: the requirement in our words, a condition over attributes and rule results (the same
// three-valued logic as the rules), the dates it applies between, how to comply (document or evidence, helpful
// standards, who), and verbatim citations for both the requirement and its dates.
import { z } from "zod";
import type { AttributeRegistry, AttributeValue, Profile } from "./attributes.ts";
import { domain } from "./attributes.ts";
import { and3, not3, or3, type Results, resultIn, type Truth } from "./ir/evaluate.ts";
import type { DeviceIr } from "./ir/schema.ts";
import { IdSchema, IsoDateSchema, TextSchema } from "./model/text.ts";
import { CitationSchema } from "./source/citation.ts";

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { attr: string; isTrue: true }
  | { attr: string; equals: AttributeValue }
  | { attr: string; in: AttributeValue[] }
  | { result: string; in: string[] }
  | { always: true };

const AttrValue = z.union([z.boolean(), z.string()]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionSchema).min(2) }),
    z.strictObject({ any: z.array(ConditionSchema).min(2) }),
    z.strictObject({ not: ConditionSchema }),
    z.strictObject({ attr: z.string(), isTrue: z.literal(true) }),
    z.strictObject({ attr: z.string(), equals: AttrValue }),
    z.strictObject({ attr: z.string(), in: z.array(AttrValue).min(2) }),
    z.strictObject({ result: IdSchema, in: z.array(z.string()).min(1) }),
    z.strictObject({ always: z.literal(true) }),
  ]),
);

/** The six first-level branches around the device on the main screen. */
export const BRANCHES = ["class", "market", "qms", "clinical", "cyber", "ai"] as const;
export type Branch = (typeof BRANCHES)[number];

export const ObligationSchema = z.strictObject({
  id: IdSchema,
  branch: z.enum(BRANCHES),
  title: TextSchema.describe("The requirement, in our words"),
  summary: TextSchema.describe("What it means for medical device software, in our words"),
  when: ConditionSchema.describe("When it applies to a device"),
  effective: z.strictObject({
    from: IsoDateSchema,
    until: IsoDateSchema.optional(),
    citations: z.array(CitationSchema).min(1).describe("Where the date comes from"),
  }),
  how: z.strictObject({
    deliverable: TextSchema.describe("The document or evidence that shows compliance"),
    standards: z.array(IdSchema).describe("Standards that help (metadata in data/standards.json)"),
    who: TextSchema,
  }),
  citations: z.array(CitationSchema).min(1).describe("The legal basis, verbatim"),
  guidance: z.array(CitationSchema).optional().describe("Guidance on how to comply, verbatim"),
});

export type Obligation = z.infer<typeof ObligationSchema>;

export const ObligationsFileSchema = z.strictObject({
  market: z.enum(["EU", "US"]),
  obligations: z.array(ObligationSchema).min(1),
});

export const StandardSchema = z.strictObject({
  id: IdSchema,
  number: z.string().min(1),
  edition: z.string().min(1),
  title: z.string().min(1).describe("The official title (catalogue metadata)"),
  purpose: TextSchema.describe("What it helps with, in our words; no text of the standard"),
  link: z.url().describe("The publisher's catalogue page"),
  checkedAt: IsoDateSchema,
  note: TextSchema.optional(),
});

export type Standard = z.infer<typeof StandardSchema>;

export const StandardsFileSchema = z.strictObject({ standards: z.array(StandardSchema).min(1) });

export interface ConditionResult {
  truth: Truth;
  /** Attributes that explain the truth value (as for rule nodes). */
  support: string[];
}

/** Three-valued evaluation of a condition, with the attributes that explain it. */
export function evaluateCondition(c: Condition, profile: Profile, results: Results): ConditionResult {
  if ("always" in c) return { truth: true, support: [] };
  if ("result" in c) {
    const r = results[c.result];
    if (!r) throw new Error(`condition reads unknown rule ${c.result}`);
    return { truth: resultIn(r, c.in), support: r.support };
  }
  if ("attr" in c) {
    const v = profile[c.attr];
    const truth: Truth =
      v === null || v === undefined
        ? null
        : "isTrue" in c
          ? v === true
          : "equals" in c
            ? v === c.equals
            : c.in.includes(v);
    return { truth, support: [c.attr] };
  }
  if ("not" in c) {
    const inner = evaluateCondition(c.not, profile, results);
    return { truth: not3(inner.truth), support: inner.support };
  }
  const parts = ("all" in c ? c.all : c.any).map((p) => evaluateCondition(p, profile, results));
  const isAll = "all" in c;
  const truth = parts.map((p) => p.truth).reduce<Truth>(isAll ? and3 : or3, isAll ? true : false);
  const pick =
    truth === null
      ? parts.filter((p) => p.truth === null)
      : truth === isAll
        ? parts
        : parts.filter((p) => p.truth === !isAll).slice(0, 1);
  return { truth, support: [...new Set(pick.flatMap((p) => p.support))] };
}

export interface ObligationResult {
  id: string;
  branch: Branch;
  /** Does it apply to this device (null: depends on an unknown answer)? */
  applies: Truth;
  /** Relative to the as-of date. */
  timing: "in-force" | "upcoming" | "expired";
  support: string[];
}

export function timingOf(effective: Obligation["effective"], asOf: string): ObligationResult["timing"] {
  if (asOf < effective.from) return "upcoming";
  return effective.until !== undefined && asOf >= effective.until ? "expired" : "in-force";
}

export function evaluateObligations(
  obligations: readonly Obligation[],
  profile: Profile,
  results: Results,
  asOf: string,
): ObligationResult[] {
  return obligations.map((o) => {
    const { truth, support } = evaluateCondition(o.when, profile, results);
    return { id: o.id, branch: o.branch, applies: truth, timing: timingOf(o.effective, asOf), support };
  });
}

/** Attributes a condition reads directly (not through rule results). */
export function conditionAttributes(c: Condition): string[] {
  if ("attr" in c) return [c.attr];
  if ("not" in c) return conditionAttributes(c.not);
  if ("all" in c || "any" in c) return [...new Set(("all" in c ? c.all : c.any).flatMap(conditionAttributes))];
  return [];
}

/** Problems with the catalogue: unknown attributes or values, unknown rules or outcomes, unknown standards, ids. */
export function obligationIssues(
  obligations: readonly Obligation[],
  registry: AttributeRegistry,
  rules: readonly DeviceIr[],
  standards: readonly Standard[],
): string[] {
  const issues: string[] = [];
  const attrs = new Map(registry.attributes.map((a) => [a.id, a]));
  const byRule = new Map(rules.map((r) => [r.id, r]));
  const std = new Set(standards.map((s) => s.id));
  const ids = obligations.map((o) => o.id);
  for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) issues.push(`${id}: duplicate obligation id`);
  const visit = (id: string, c: Condition) => {
    if ("attr" in c) {
      const a = attrs.get(c.attr);
      if (!a) return issues.push(`${id}: unknown attribute ${c.attr}`);
      const values = "equals" in c ? [c.equals] : "in" in c ? c.in : [];
      if ("isTrue" in c && a.type !== "boolean") issues.push(`${id}: isTrue on non-boolean ${c.attr}`);
      for (const v of values)
        if (!domain(a).includes(v)) issues.push(`${id}: ${JSON.stringify(v)} is not a value of ${c.attr}`);
    } else if ("result" in c) {
      const r = byRule.get(c.result);
      if (!r) return issues.push(`${id}: unknown rule ${c.result}`);
      for (const o of c.in)
        if (!r.outcomes.some((x) => x.id === o)) issues.push(`${id}: ${c.result} has no outcome ${o}`);
    } else if ("not" in c) visit(id, c.not);
    else if ("all" in c || "any" in c) for (const p of "all" in c ? c.all : c.any) visit(id, p);
    return undefined;
  };
  for (const o of obligations) {
    visit(o.id, o.when);
    for (const s of o.how.standards) if (!std.has(s)) issues.push(`${o.id}: unknown standard ${s}`);
    if (o.effective.until !== undefined && o.effective.until <= o.effective.from) issues.push(`${o.id}: until ≤ from`);
  }
  return issues;
}
