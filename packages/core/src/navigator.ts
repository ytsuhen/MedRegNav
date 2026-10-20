// The navigator: everything the main screen shows for one device profile on one date — rule results, cross-checks,
// obligations and the questions that would settle what is still open; optionally the same under proposed revisions
// ("what if"). Pure; the web app and the CLI both call it.
import type { AttributeRegistry, Profile } from "./attributes.ts";
import { type CrossCheckResult, crossCheck } from "./ir/crosscheck.ts";
import { attributesRead, type DecisiveUnknown, decisiveUnknowns, type Signature } from "./ir/decisive.ts";
import { evaluateRules, type RuleResult, withRevision } from "./ir/evaluate.ts";
import type { DeviceIr } from "./ir/schema.ts";
import {
  conditionAttributes,
  evaluateObligations,
  type Obligation,
  type ObligationResult,
  type Standard,
} from "./obligations.ts";

export interface NavigatorModel {
  registry: AttributeRegistry;
  rules: DeviceIr[];
  obligations: Obligation[];
  standards: Standard[];
}

export interface Scenario {
  results: Record<string, RuleResult>;
  crossChecks: CrossCheckResult[];
  obligations: ObligationResult[];
}

export interface Navigation extends Scenario {
  asOf: string;
  /** Unknown attributes that would change a primary result or an obligation, in question order. */
  questions: DecisiveUnknown[];
  /** Unknown attributes that only the cross-check (guidance) rules need. */
  guidanceQuestions: DecisiveUnknown[];
  /** The same device under every hypothetical revision in place of the rule it revises. */
  proposal?: Scenario & { revisions: string[]; questions: DecisiveUnknown[] };
}

const inForceSet = (rules: readonly DeviceIr[]) => rules.filter((r) => r.role !== "hypothetical");

function scenario(model: NavigatorModel, rules: readonly DeviceIr[], profile: Profile, asOf: string): Scenario {
  const results = evaluateRules(rules, profile, asOf);
  const crossChecks = rules.flatMap((r) => {
    const result = results[r.id];
    const c = result ? crossCheck(r, result, profile) : null;
    return c ? [c] : [];
  });
  return { results, crossChecks, obligations: evaluateObligations(model.obligations, profile, results, asOf) };
}

/** Per primary rule its scope and possibilities, per obligation whether it applies. */
function signature(
  model: NavigatorModel,
  rules: readonly DeviceIr[],
  asOf: string,
  roles: DeviceIr["role"][],
): Signature {
  return (profile) => {
    const s = scenario(model, rules, profile, asOf);
    const out: Record<string, string> = {};
    for (const r of rules) {
      if (!roles.includes(r.role)) continue;
      const res = s.results[r.id];
      if (res) out[r.id] = `${String(res.scope)}|${res.possible.join(",")}`;
    }
    if (roles.includes("primary")) for (const o of s.obligations) out[`obligation:${o.id}`] = String(o.applies);
    return out;
  };
}

function candidates(model: NavigatorModel, rules: readonly DeviceIr[]): string[] {
  const out = attributesRead(rules);
  for (const o of model.obligations) for (const a of conditionAttributes(o.when)) if (!out.includes(a)) out.push(a);
  return out;
}

export function navigate(
  model: NavigatorModel,
  profile: Profile,
  options: { asOf: string; proposals?: boolean },
): Navigation {
  const rules = inForceSet(model.rules);
  const base = scenario(model, rules, profile, options.asOf);
  const ask = candidates(model, rules);
  const questions = decisiveUnknowns(model.registry, profile, signature(model, rules, options.asOf, ["primary"]), ask);
  const asked = new Set(questions.map((q) => q.attr));
  const guidanceQuestions = decisiveUnknowns(
    model.registry,
    profile,
    signature(model, rules, options.asOf, ["cross-check"]),
    ask,
  ).filter((q) => !asked.has(q.attr));
  const navigation: Navigation = { asOf: options.asOf, ...base, questions, guidanceQuestions };
  const revisions = model.rules.filter((r) => r.role === "hypothetical");
  if (options.proposals && revisions.length > 0) {
    const revised = revisions.reduce<DeviceIr[]>((set, rev) => withRevision(set, rev), rules);
    const s = scenario(model, revised, profile, options.asOf);
    const proposalQuestions = decisiveUnknowns(
      model.registry,
      profile,
      signature(model, revised, options.asOf, ["primary"]),
      candidates(model, revised),
    );
    navigation.proposal = { ...s, revisions: revisions.map((r) => r.id), questions: proposalQuestions };
  }
  return navigation;
}
