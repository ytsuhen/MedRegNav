// The guided run (DECISIONS U13): the navigator walked step by step from a blank sheet towards a description of the
// software (the target). Every step is the question `navigate` would ask first — the first decisive unknown in the
// rules' reading order — that the run has not passed yet. The target's answer fills it; when the target leaves it open,
// the step waits for an answer given during the run, and "don't know" keeps the attribute unknown while the run goes
// on to the next question. So no step asks what is already known, and each question is asked once.
// One more step closes the run only when it is needed: under three-valued logic two answers can matter together while
// neither does alone (e.g. the decision's impact and the class of the driven device rule out IIb only together, when
// "don't know" left the way between them open). No single one of them is a decisive unknown, so no question asks
// them; the closing step sets the description's remaining answers at once, so the run ends where `navigate` on the
// description is. Pure: the web app plays the steps; the tests check the run against `navigate` on the target.
import type { AttributeValue, Profile } from "./attributes.ts";
import type { RuleResult, Truth } from "./ir/evaluate.ts";
import type { DeviceIr } from "./ir/schema.ts";
import { type NavigatorModel, nextQuestion, outcomeKey, type Scenario } from "./navigator.ts";

/**
 * target: from the description; answer: given during the run; unknown: "don't know"; pending: waits for an answer;
 * rest: the closing step, the description's remaining answers that matter only together.
 */
export type StepSource = "target" | "answer" | "unknown" | "pending" | "rest";

export interface GuidedStep {
  /** The question's attribute ("" for the closing step). */
  attr: string;
  /** The answer the step gives; null: the attribute stays unknown ("don't know", or not answered yet). */
  value: AttributeValue | null;
  source: StepSource;
  /** The closing step: the attributes it sets (empty for a question). */
  rest: string[];
  /** The profile the question is asked on, and the profile after the answer. */
  before: Profile;
  after: Profile;
}

export interface GuidedRun {
  steps: GuidedStep[];
  /** The first step that waits for an answer, or -1. The steps after it assume "don't know" until it is answered. */
  pending: number;
  /** Where the run ends: the target with the answers given during the run. */
  final: Profile;
}

/** Answers given during the run to questions the target leaves open: a value, or null for "don't know". */
export type RunAnswers = Readonly<Record<string, AttributeValue | null>>;

const isKnown = (v: AttributeValue | null | undefined): v is AttributeValue => v !== null && v !== undefined;

/** The run's steps from a blank sheet towards `target`, on the date `asOf`. */
export function guidedRun(
  model: NavigatorModel,
  target: Profile,
  options: { asOf: string; answers?: RunAnswers },
): GuidedRun {
  const answers = options.answers ?? {};
  const passed = new Set<string>();
  const steps: GuidedStep[] = [];
  let profile: Record<string, AttributeValue> = {};
  for (;;) {
    const q = nextQuestion(model, profile, { asOf: options.asOf, skip: passed });
    if (!q) break;
    const fromTarget = target[q.attr];
    const given = Object.hasOwn(answers, q.attr) ? (answers[q.attr] ?? null) : undefined;
    const value = isKnown(fromTarget) ? fromTarget : (given ?? null);
    const source: StepSource = isKnown(fromTarget)
      ? "target"
      : given === undefined
        ? "pending"
        : given === null
          ? "unknown"
          : "answer";
    const before = profile;
    if (value === null) passed.add(q.attr);
    else profile = { ...profile, [q.attr]: value };
    steps.push({ attr: q.attr, value, source, rest: [], before, after: profile });
  }
  const final: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(answers)) if (isKnown(v)) final[k] = v;
  for (const [k, v] of Object.entries(target)) if (isKnown(v)) final[k] = v;
  if (outcomeKey(model, profile, options.asOf) !== outcomeKey(model, final, options.asOf)) {
    const rest = Object.keys(final).filter((k) => !isKnown(profile[k]));
    steps.push({ attr: "", value: null, source: "rest", rest, before: profile, after: final });
  }
  return { steps, pending: steps.findIndex((s) => s.source === "pending"), final };
}

const resultKey = (r: RuleResult | undefined) => (r ? `${String(r.scope)}|${r.possible.join(",")}` : "");

export interface StepChanges {
  /** Rules whose scope or possible outcomes changed. */
  rules: string[];
  /** Obligations whose applicability changed. */
  obligations: string[];
  /** Obligations that apply, and that depend on an answer: before and after. */
  applies: [number, number];
  open: [number, number];
}

/** What a step changed: from the navigation before it to the one after it. */
export function stepChanges(before: Scenario, after: Scenario): StepChanges {
  const rules = Object.keys(after.results).filter(
    (id) => resultKey(before.results[id]) !== resultKey(after.results[id]),
  );
  const was = new Map(before.obligations.map((o) => [o.id, o.applies]));
  const count = (n: Scenario, applies: Truth) => n.obligations.filter((o) => o.applies === applies).length;
  return {
    rules,
    obligations: after.obligations.filter((o) => was.get(o.id) !== o.applies).map((o) => o.id),
    applies: [count(before, true), count(after, true)],
    open: [count(before, null), count(after, null)],
  };
}

/**
 * The leaves of a rule that a step settled — unknown before it, true or false after — true ones first, in file order:
 * the nodes that decided the change, each with the criteria it cites.
 */
export function settledLeaves(rule: DeviceIr, before: RuleResult, after: RuleResult): string[] {
  const leaves = rule.nodes.filter((n) => (n.kind === "attr" || n.kind === "result") && before.nodes[n.id] === null);
  const settled = (truth: boolean) => leaves.filter((n) => after.nodes[n.id] === truth).map((n) => n.id);
  return [...settled(true), ...settled(false)];
}
