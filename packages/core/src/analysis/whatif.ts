// "What if" a proposed revision were adopted: the revision in place of the rule it revises, compared on a synthetic
// cohort and on the reference examples. The cohort (`data/whatif.json`) is every complete combination of the answers
// either version reads, starting from a reference example's other answers, keeping those that no guidance
// cross-check contradicts and that meet the stated coherence constraints (each cited). A situation is the pair of
// results together with the answers that decide them (the support of each result: what the card shows as "what
// decided it" and "why not stricter"); combinations that differ only in other answers are one situation. The
// transition matrix counts situations: per class under the rule in force, the class under the proposal.
import { z } from "zod";
import type { AttributeRegistry, AttributeValue, Profile } from "../attributes.ts";
import type { Example } from "../examples.ts";
import { crossCheck } from "../ir/crosscheck.ts";
import { evaluateRules, type RuleResult, withRevision } from "../ir/evaluate.ts";
import { type DeviceIr, NO_OUTCOME } from "../ir/schema.ts";
import { IdSchema, TextSchema } from "../model/text.ts";
import { ConditionSchema, evaluateCondition } from "../obligations.ts";
import { CitationSchema } from "../source/citation.ts";
import { diffRules, type IrDiff } from "./diff.ts";
import { directAttributes, product, valuesOf } from "./space.ts";

export const WhatIfFileSchema = z.strictObject({
  proposals: z
    .array(
      z.strictObject({
        revision: IdSchema.describe("A hypothetical rule (role hypothetical, `revises` the rule in force)"),
        base: IdSchema.describe("Reference example whose other answers the cohort keeps; the rules must cover it"),
        constraints: z
          .array(
            z.strictObject({
              when: ConditionSchema,
              require: ConditionSchema,
              why: TextSchema.describe("Why a combination breaking it is not a real device; our reading"),
              citations: z.array(CitationSchema).min(1),
            }),
          )
          .describe("Coherence: combinations of answers that cannot describe one device"),
      }),
    )
    .min(1),
});

export type WhatIfFile = z.infer<typeof WhatIfFileSchema>;
export type WhatIfProposal = WhatIfFile["proposals"][number];

export interface TransitionMatrix {
  /** Outcome ids in rank order, strictest last, with NO_OUTCOME first when it occurs. */
  outcomes: string[];
  /** from (rule in force) → to (proposal) → count. */
  cells: Record<string, Record<string, number>>;
  cohort: number;
  changed: number;
  /** Combinations whose class would rise / fall in rank. */
  up: number;
  down: number;
}

export interface ExampleTransition {
  example: string;
  from: string[];
  /** Under the proposal, with the answers the constraints imply filled in. */
  to: string[];
  /** Attributes the constraints filled in for the proposal. */
  implied: string[];
}

export interface WhatIfResult {
  revision: string;
  revises: string;
  diff: IrDiff;
  /** Attributes the cohort varies. */
  attributes: string[];
  matrix: TransitionMatrix;
  examples: ExampleTransition[];
}

/**
 * The answers the constraints imply: when a constraint's `when` holds and its `require` names one attribute value
 * (`isTrue` or `equals`) that is still unknown, that value is filled in (repeated until nothing changes).
 */
export function impliedAnswers(
  constraints: WhatIfProposal["constraints"],
  profile: Profile,
  rules: readonly DeviceIr[],
): Profile {
  const out: Record<string, AttributeValue | null | undefined> = { ...profile };
  for (let changed = true; changed; ) {
    changed = false;
    const results = evaluateRules(rules, out);
    for (const c of constraints) {
      const need = c.require;
      if (!("attr" in need) || (out[need.attr] !== null && out[need.attr] !== undefined)) continue;
      const value = "isTrue" in need ? true : "equals" in need ? need.equals : undefined;
      if (value === undefined || evaluateCondition(c.when, out, results).truth !== true) continue;
      out[need.attr] = value;
      changed = true;
    }
  }
  return out;
}

const keyOf = (r: RuleResult | undefined): string =>
  !r || r.scope === false ? NO_OUTCOME : r.possible.length === 1 ? (r.possible[0] as string) : r.possible.join("|");

const possibleOf = (r: RuleResult | undefined): string[] =>
  !r ? [] : r.scope === false ? [NO_OUTCOME] : r.scope === null ? [...r.possible, NO_OUTCOME] : [...r.possible];

/** Problems: unknown or non-hypothetical revision, unknown base example, a base the revised rule does not cover. */
export function whatIfIssues(file: WhatIfFile, rules: readonly DeviceIr[], examples: readonly Example[]): string[] {
  const issues: string[] = [];
  for (const p of file.proposals) {
    const revision = rules.find((r) => r.id === p.revision);
    if (!revision) issues.push(`${p.revision}: unknown rule`);
    else if (revision.role !== "hypothetical" || !revision.revises)
      issues.push(`${p.revision}: not a hypothetical revision`);
    const base = examples.find((e) => e.id === p.base);
    if (!base) issues.push(`${p.revision}: unknown base example ${p.base}`);
    else if (revision?.revises) {
      const results = evaluateRules(
        rules.filter((r) => r.role !== "hypothetical"),
        base.profile as Profile,
      );
      if (results[revision.revises]?.scope !== true)
        issues.push(`${p.revision}: base example ${p.base} is not covered by ${revision.revises}`);
    }
  }
  return issues;
}

export function whatIf(
  rules: readonly DeviceIr[],
  registry: AttributeRegistry,
  proposal: WhatIfProposal,
  examples: readonly Example[],
): WhatIfResult {
  const revision = rules.find((r) => r.id === proposal.revision);
  if (!revision?.revises) throw new Error(`${proposal.revision}: not a hypothetical revision`);
  const revisedId = revision.revises;
  const revised = rules.find((r) => r.id === revisedId);
  if (!revised) throw new Error(`${revisedId}: unknown rule`);
  const inForce = rules.filter((r) => r.role !== "hypothetical");
  const proposed = withRevision(inForce, revision);
  const base = examples.find((e) => e.id === proposal.base);
  if (!base) throw new Error(`unknown example ${proposal.base}`);

  const dims = [...new Set([...directAttributes(revised), ...directAttributes(revision)])];
  const domains = dims.map((a) => valuesOf(registry, a, false) as AttributeValue[]);
  const rest = Object.fromEntries(Object.entries(base.profile).filter(([k]) => !dims.includes(k)));

  interface Point {
    valid: boolean;
    from: string;
    to: string;
    /** The situation: both results and the answers that decide them (the attributes behind either result). */
    situation: string;
  }
  const points = new Map<string, Point>();
  const keyOfCombo = (combo: readonly AttributeValue[]) => JSON.stringify(combo);
  for (const combo of product<AttributeValue>(domains)) {
    const profile: Profile = { ...rest, ...Object.fromEntries(dims.map((a, i) => [a, combo[i]])) };
    const now = evaluateRules(inForce, profile);
    const contradicted = inForce.some((r) => {
      const res = now[r.id];
      return res ? crossCheck(r, res, profile)?.status === "inconsistent" : false;
    });
    const incoherent = proposal.constraints.some(
      (c) =>
        evaluateCondition(c.when, profile, now).truth === true &&
        evaluateCondition(c.require, profile, now).truth !== true,
    );
    const then = evaluateRules(proposed, profile);
    const from = keyOf(now[revisedId]);
    const to = keyOf(then[revisedId]);
    // The support of a result is a certificate: changing answers outside it cannot change that result.
    const decisive = [...new Set([...(now[revisedId]?.support ?? []), ...(then[revisedId]?.support ?? [])])]
      .filter((a) => dims.includes(a))
      .sort();
    points.set(keyOfCombo(combo), {
      valid: !contradicted && !incoherent,
      from,
      to,
      situation: JSON.stringify([from, to, decisive.map((a) => [a, profile[a] ?? null])]),
    });
  }

  // Combinations that differ only in answers neither result depends on are one situation.
  const cells: Record<string, Record<string, number>> = {};
  const counted = new Set<string>();
  for (const point of points.values()) {
    if (!point.valid || counted.has(point.situation)) continue;
    counted.add(point.situation);
    const row = cells[point.from] ?? {};
    cells[point.from] = row;
    row[point.to] = (row[point.to] ?? 0) + 1;
  }
  const cohort = counted.size;

  const ranked = [...revised.outcomes].sort((a, b) => a.rank - b.rank).map((o) => o.id);
  const seen = new Set(Object.entries(cells).flatMap(([from, row]) => [from, ...Object.keys(row)]));
  const outcomes = [...(seen.has(NO_OUTCOME) ? [NO_OUTCOME] : []), ...ranked];
  const rank = (id: string) => (id === NO_OUTCOME ? 0 : ranked.indexOf(id) + 1);
  let changed = 0;
  let up = 0;
  let down = 0;
  for (const [from, row] of Object.entries(cells)) {
    for (const [to, n] of Object.entries(row)) {
      if (from === to) continue;
      changed += n;
      if (rank(to) > rank(from)) up += n;
      else down += n;
    }
  }

  return {
    revision: revision.id,
    revises: revisedId,
    diff: diffRules(revised, revision),
    attributes: dims,
    matrix: { outcomes, cells, cohort, changed, up, down },
    examples: examples.map((e) => {
      const profile = e.profile as Profile;
      const implied = impliedAnswers(proposal.constraints, profile, inForce);
      return {
        example: e.id,
        from: possibleOf(evaluateRules(inForce, profile)[revisedId]),
        to: possibleOf(evaluateRules(proposed, implied)[revisedId]),
        implied: Object.keys(implied).filter((k) => !(k in profile) || profile[k] === null),
      };
    }),
  };
}
