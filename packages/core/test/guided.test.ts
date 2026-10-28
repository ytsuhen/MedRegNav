// The guided run on a small synthetic model: every step is the first question navigate() would ask, the target fills
// what it knows, an open question waits for an answer ("don't know" goes on to the next one), no step asks what is
// known, each question comes once, and the run ends where navigate() on the target is. The real rules are run in
// apps/cli/test/guided.test.ts.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AttributeValue,
  domain,
  guidedRun,
  type NavigatorModel,
  navigate,
  nextQuestion,
  type Obligation,
  type Profile,
  type RunAnswers,
  settledLeaves,
  stepChanges,
} from "../src/index.ts";
import { attr, gate, registry, rule } from "./ir/build.ts";

const T = (s: string) => ({ uk: s, en: s });
const cite = { source: "s", section: "x", quote: "q", sha256: "0".repeat(64), start: 0, end: 1 };
const obligation = (id: string, when: Obligation["when"]): Obligation => ({
  id,
  branch: "class",
  title: T(id),
  summary: T(id),
  when,
  effective: { from: "2021-05-26", citations: [cite] },
  how: { deliverable: T(id), standards: [], who: T(id) },
  citations: [cite],
});

// HIGH when a and b, else LOW; obligations on c, on the level and on the class.
const model: NavigatorModel = {
  registry,
  rules: [
    rule(
      "cls",
      [attr("na", "a"), attr("nb", "b"), gate("hi", "all", ["na", "nb"]), gate("lo", "not", ["hi"])],
      [
        ["HIGH", 2, "hi"],
        ["LOW", 1, "lo"],
      ],
    ),
  ],
  obligations: [
    obligation("for-c", { attr: "c", isTrue: true }),
    obligation("for-high-level", { attr: "level", equals: "high" }),
    obligation("for-high-class", { result: "cls", in: ["HIGH"] }),
  ],
  standards: [],
};
const asOf = "2026-10-28";

// What the steps settle: the primary rules (all of this model's) and the obligations.
const outcomeOf = (p: Profile) => {
  const n = navigate(model, p, { asOf });
  return {
    results: Object.fromEntries(Object.values(n.results).map((r) => [r.ruleId, [r.scope, r.status, r.possible]])),
    obligations: n.obligations.map((o) => [o.id, o.applies, o.timing]),
  };
};

/** Answers every question the target leaves open with `pick` (null: "don't know"), replaying until nothing waits. */
function play(target: Profile, pick: (attr: string) => AttributeValue | null) {
  const answers: Record<string, AttributeValue | null> = {};
  for (;;) {
    const run = guidedRun(model, target, { asOf, answers });
    const waiting = run.steps[run.pending];
    if (!waiting) return { run, answers };
    answers[waiting.attr] = pick(waiting.attr);
  }
}

describe("the guided run", () => {
  it("fills every step from a complete description and ends where navigate() on it is", () => {
    const target = { a: true, b: true, c: false, level: "low" };
    const run = guidedRun(model, target, { asOf });
    expect(run.steps.map((s) => [s.attr, s.value, s.source])).toEqual([
      ["a", true, "target"],
      ["b", true, "target"],
      ["c", false, "target"],
      ["level", "low", "target"],
    ]);
    expect(run.pending).toBe(-1);
    expect(run.final).toEqual(target);
    expect(outcomeOf(run.steps.at(-1)?.after ?? {})).toEqual(outcomeOf(target));
  });

  it("skips what the answers already make irrelevant", () => {
    // With a = no, b decides nothing any more: the run never asks it, though the description knows it.
    const run = guidedRun(model, { a: false, b: true, c: true, level: "mid" }, { asOf });
    expect(run.steps.map((s) => s.attr)).toEqual(["a", "c", "level"]);
    expect(run.final).toEqual({ a: false, b: true, c: true, level: "mid" });
    expect(outcomeOf(run.steps.at(-1)?.after ?? {})).toEqual(outcomeOf(run.final));
  });

  it("waits at a question the description leaves open; the steps after it assume 'don't know'", () => {
    const run = guidedRun(model, { a: true, c: true }, { asOf });
    expect(run.steps.map((s) => [s.attr, s.source])).toEqual([
      ["a", "target"],
      ["b", "pending"],
      ["c", "target"],
      ["level", "pending"],
    ]);
    expect(run.pending).toBe(1);
    expect(run.steps[1]?.after).toEqual({ a: true });
    // An answer during the run is used like the description's; "don't know" goes on to the next question.
    const answered = guidedRun(model, { a: true, c: true }, { asOf, answers: { b: true, level: null } });
    expect(answered.steps.map((s) => [s.attr, s.value, s.source])).toEqual([
      ["a", true, "target"],
      ["b", true, "answer"],
      ["c", true, "target"],
      ["level", null, "unknown"],
    ]);
    expect(answered.pending).toBe(-1);
    expect(answered.final).toEqual({ a: true, b: true, c: true });
  });

  it("asks everything from a blank sheet, each question once", () => {
    const { run } = play({}, () => null);
    expect(run.steps.map((s) => [s.attr, s.source])).toEqual([
      ["a", "unknown"],
      ["b", "unknown"],
      ["c", "unknown"],
      ["level", "unknown"],
    ]);
    expect(run.final).toEqual({});
  });

  it("holds for any description and any answers (property)", () => {
    const value = (id: string) => {
      const a = registry.attributes.find((x) => x.id === id);
      return fc.constantFrom<AttributeValue | null>(...(a ? domain(a) : []), null);
    };
    const profile = fc.record(Object.fromEntries(registry.attributes.map((a) => [a.id, value(a.id)])));
    fc.assert(
      fc.property(profile, profile, (target, choices) => {
        const { run, answers } = play(target, (a) => choices[a] ?? null);
        const seen = new Set<string>();
        const passed = new Set<string>();
        for (const step of run.steps) {
          expect(step.source).not.toBe("rest"); // no two answers here matter only together
          // Each question once, never about what is known, and the one navigate() asks first.
          expect(seen.has(step.attr)).toBe(false);
          seen.add(step.attr);
          expect(step.before[step.attr] ?? null).toBeNull();
          expect(nextQuestion(model, step.before, { asOf, skip: passed })?.attr).toBe(step.attr);
          const first = navigate(model, step.before, { asOf }).questions.find((q) => !passed.has(q.attr));
          expect(first?.attr).toBe(step.attr);
          if (step.value === null) passed.add(step.attr);
          else expect(step.after).toEqual({ ...step.before, [step.attr]: step.value });
        }
        // Nothing decisive is left but what was not known, and the end is navigate() on the target.
        const last = run.steps.at(-1)?.after ?? {};
        expect(navigate(model, last, { asOf }).questions.every((q) => passed.has(q.attr))).toBe(true);
        expect(outcomeOf(last)).toEqual(outcomeOf(run.final));
        const known = (p: Profile) => Object.entries(p).filter((e) => e[1] !== null && e[1] !== undefined);
        expect(run.final).toEqual(Object.fromEntries([...known(answers), ...known(target)]));
      }),
      { numRuns: 300 },
    );
  });

  it("closes with the description's remaining answers when they matter only together", () => {
    // TOP when (a and b) or (c and the level is high): with a and c unknown, neither "b: no" nor "level: low" is a
    // decisive unknown alone — so no question asks them — but together they rule TOP out.
    const pair: NavigatorModel = {
      ...model,
      rules: [
        rule(
          "cls",
          [
            attr("na", "a"),
            attr("nb", "b"),
            attr("nc", "c"),
            attr("nh", "level", "equals", ["high"]),
            gate("ab", "all", ["na", "nb"]),
            gate("ch", "all", ["nc", "nh"]),
            gate("top", "any", ["ab", "ch"]),
            gate("base", "not", ["top"]),
          ],
          [
            ["TOP", 2, "top"],
            ["BASE", 1, "base"],
          ],
        ),
      ],
      obligations: [],
    };
    const run = guidedRun(pair, { b: false, level: "low" }, { asOf });
    expect(run.steps.map((s) => [s.source, s.rest])).toEqual([["rest", ["b", "level"]]]);
    expect(run.steps[0]?.after).toEqual(run.final);
    expect(navigate(pair, {}, { asOf }).results.cls?.possible).toEqual(["TOP", "BASE"]);
    expect(navigate(pair, run.final, { asOf }).results.cls?.possible).toEqual(["BASE"]);
    // Nothing to close when the description changes nothing.
    expect(guidedRun(pair, {}, { asOf }).steps).toEqual([]);
  });

  it("says what a step changed and which leaves decided it", () => {
    const run = guidedRun(
      model,
      { a: true, b: true },
      { asOf, answers: { c: null, level: null } satisfies RunAnswers },
    );
    const step = run.steps[1];
    if (!step) throw new Error("no second step");
    const before = navigate(model, step.before, { asOf });
    const after = navigate(model, step.after, { asOf });
    const changes = stepChanges(before, after);
    expect(changes.rules).toEqual(["cls"]);
    expect(changes.obligations).toEqual(["for-high-class"]);
    expect(changes.applies).toEqual([0, 1]);
    expect(changes.open).toEqual([3, 2]);
    const cls = model.rules[0];
    const [b, a] = [before.results.cls, after.results.cls];
    if (!cls || !b || !a) throw new Error("no rule");
    expect(settledLeaves(cls, b, a)).toEqual(["nb"]);
  });
});
