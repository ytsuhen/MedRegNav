// The guided run (DECISIONS U13) on the real rules and obligations: on every MDCG example, on the three descriptions
// the demo is shown with (the heartbeat app, a blank sheet, a wearable recorder with most answers unknown) and on
// random descriptions, each step is the first question navigate() asks, no step asks what is known, each question
// comes once, and the run ends where navigate() on the description is.
import { type AttributeValue, domain, guidedRun, type NavigatorModel, navigate, type Profile } from "@mrn/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readExamples, readModel } from "../src/data.ts";

const model: NavigatorModel = readModel();
const examples = readExamples();
const asOf = "2026-10-21";

// What the steps settle: the primary rules and the obligations. The MDCG cross-check is optional (U5) and never a
// step; its answers reach the end with the rest of the description (`final`).
const primary = new Set(model.rules.filter((r) => r.role === "primary").map((r) => r.id));
const outcomeOf = (p: Profile) => {
  const n = navigate(model, p, { asOf });
  return {
    results: Object.fromEntries(
      Object.values(n.results)
        .filter((r) => primary.has(r.ruleId))
        .map((r) => [r.ruleId, [r.scope, r.status, r.possible]]),
    ),
    obligations: n.obligations.map((o) => [o.id, o.applies, o.timing]),
  };
};

/** Plays the run, answering every question the description leaves open with `pick` (null: "don't know"). */
function play(target: Profile, pick: (attr: string) => AttributeValue | null = () => null) {
  const answers: Record<string, AttributeValue | null> = {};
  for (;;) {
    const run = guidedRun(model, target, { asOf, answers });
    const waiting = run.steps[run.pending];
    if (!waiting) {
      // The end is the description with the answers given during the run.
      const known = (p: Profile) => Object.entries(p).filter((e) => e[1] !== null && e[1] !== undefined);
      expect(run.final).toEqual(Object.fromEntries([...known(answers), ...known(target)]));
      return run;
    }
    answers[waiting.attr] = pick(waiting.attr);
  }
}

/**
 * The run's own promises: first question each time, never a known one, each once, and the end is the target's — with
 * the closing step, when there is one, last and only when the remaining answers change something together.
 */
function checkRun(run: ReturnType<typeof play>) {
  const passed = new Set<string>();
  const seen = new Set<string>();
  const closing = run.steps.findIndex((s) => s.source === "rest");
  if (closing >= 0) {
    const step = run.steps[closing];
    expect(closing).toBe(run.steps.length - 1);
    expect(step?.after).toEqual(run.final);
    expect(outcomeOf(step?.before ?? {})).not.toEqual(outcomeOf(run.final));
  }
  for (const step of run.steps) {
    if (step.source === "rest") continue;
    expect(seen.has(step.attr), `${step.attr} asked twice`).toBe(false);
    seen.add(step.attr);
    expect(step.before[step.attr] ?? null, `${step.attr} was known`).toBeNull();
    const first = navigate(model, step.before, { asOf }).questions.find((q) => !passed.has(q.attr));
    expect(first?.attr).toBe(step.attr);
    if (step.value === null) passed.add(step.attr);
  }
  const last = run.steps.at(-1)?.after ?? {};
  const asked = run.steps.filter((s) => s.source !== "rest").at(-1)?.after ?? {};
  expect(navigate(model, asked, { asOf }).questions.every((q) => passed.has(q.attr))).toBe(true);
  expect(outcomeOf(last)).toEqual(outcomeOf(run.final));
}

const resultOf = (p: Profile, rule: string) => navigate(model, p, { asOf }).results[rule];

describe("the guided run on the real rules", () => {
  it("walks every MDCG example to the result the guidance gives", { timeout: 60_000 }, () => {
    for (const e of examples) {
      const run = play(e.profile);
      checkRun(run);
      for (const x of e.expected) expect(resultOf(run.final, x.rule)?.value, `${e.id}: ${x.rule}`).toBe(x.outcome);
    }
  });

  it("takes the heartbeat app to class IIb, from the description alone", () => {
    const heartbeat = examples.find((e) => e.id === "heartbeat-app");
    if (!heartbeat) throw new Error("no heartbeat-app");
    const run = play(heartbeat.profile);
    checkRun(run);
    const decided = run.steps.findIndex((s) => resultOf(s.after, "eu-mdr-classification")?.value === "IIb");
    expect(decided).toBeGreaterThan(0);
    // Every step up to the class comes from the description; the class stays IIb to the end.
    expect(run.steps.slice(0, decided + 1).every((s) => s.source === "target")).toBe(true);
    for (const s of run.steps.slice(decided)) expect(resultOf(s.after, "eu-mdr-classification")?.value).toBe("IIb");
    expect(resultOf(run.final, "eu-mdr-classification")?.value).toBe("IIb");
  });

  it("asks every question on a blank sheet, each once, and keeps all classes open on 'don't know'", () => {
    const pending = guidedRun(model, {}, { asOf });
    expect(pending.pending).toBe(0);
    expect(pending.steps[0]?.source).toBe("pending");
    const run = play({});
    checkRun(run);
    expect(run.steps.every((s) => s.source === "unknown")).toBe(true);
    expect(new Set(run.steps.map((s) => s.attr)).size).toBe(run.steps.length);
    expect(resultOf(run.final, "eu-mdr-classification")?.possible).toEqual(["III", "IIb", "IIa", "I"]);
  });

  it("walks the wearable recorder's link: four answers from it, the rest asked and left unknown", () => {
    const target = { isSoftware: true, actsOnData: true, individualPatients: true, isAiSystem: true };
    const run = play(target);
    checkRun(run);
    const fromTarget = run.steps.filter((s) => s.source === "target").map((s) => s.attr);
    expect(new Set(fromTarget)).toEqual(new Set(["isSoftware", "actsOnData", "individualPatients", "isAiSystem"]));
    expect(run.steps.filter((s) => s.source === "unknown").length).toBeGreaterThan(fromTarget.length);
    expect(run.final).toEqual(target);
    expect(resultOf(run.final, "eu-mdr-qualification")?.status).toBe("undetermined");
  });

  it("keeps its promises for any description and any answers (property)", { timeout: 60_000 }, () => {
    const value = (a: (typeof model.registry.attributes)[number]) =>
      fc.constantFrom<AttributeValue | null>(...domain(a), null, null);
    const profile = fc.record(Object.fromEntries(model.registry.attributes.map((a) => [a.id, value(a)])));
    fc.assert(
      fc.property(profile, profile, (target, choices) => {
        checkRun(play(target, (a) => choices[a] ?? null));
      }),
      { numRuns: 20 },
    );
  });
});
