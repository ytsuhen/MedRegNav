// Decisive unknowns: the unknown attributes whose answer would change a result. They become the questions in the
// UI, so the user is never asked what does not matter. Adapted from the idea of vlk-engine
// (packages/core/src/fhir/decisive.ts), Apache-2.0, same author: there an unknown leaf is decisive when flipping it
// moves the verdict; here every value of an unknown attribute is tried against a "signature" of the results.
import { type AttributeRegistry, domain, type Profile } from "../attributes.ts";
import { evaluateRules, ruleOrder } from "./evaluate.ts";
import type { DeviceIr } from "./schema.ts";

export interface DecisiveUnknown {
  attr: string;
  /** Signature keys (e.g. rule ids) whose value some answer would change. */
  affects: string[];
}

/** What the results are, as comparable strings per key. */
export type Signature = (profile: Profile) => Record<string, string>;

/**
 * The unknown attributes among `candidates` (in that order) whose answer would change the signature; with `limit`, only
 * the first that many.
 */
export function decisiveUnknowns(
  registry: AttributeRegistry,
  profile: Profile,
  signature: Signature,
  candidates: readonly string[],
  limit = Number.POSITIVE_INFINITY,
): DecisiveUnknown[] {
  const base = signature(profile);
  const byId = new Map(registry.attributes.map((a) => [a.id, a]));
  const out: DecisiveUnknown[] = [];
  for (const attr of candidates) {
    if (out.length >= limit) break;
    const attribute = byId.get(attr);
    if (!attribute || (profile[attr] !== null && profile[attr] !== undefined)) continue;
    const affects = new Set<string>();
    for (const value of domain(attribute)) {
      const alt = signature({ ...profile, [attr]: value });
      for (const key of new Set([...Object.keys(base), ...Object.keys(alt)]))
        if (base[key] !== alt[key]) affects.add(key);
    }
    if (affects.size > 0) out.push({ attr, affects: [...affects].sort() });
  }
  return out;
}

/** Signature of a rule set: per rule, whether it applies and which outcomes remain possible. */
export function ruleSignature(rules: readonly DeviceIr[], asOf?: string): Signature {
  return (profile) => {
    const results = evaluateRules(rules, profile, asOf);
    return Object.fromEntries(
      Object.values(results).map((r) => [r.ruleId, `${String(r.scope)}|${r.possible.join(",")}`]),
    );
  };
}

/** Attributes the rules read, in reading order: rules in dependency order (`ruleOrder`), nodes in file order. */
export function attributesRead(rules: readonly DeviceIr[]): string[] {
  const out: string[] = [];
  for (const r of ruleOrder(rules))
    for (const n of r.nodes) if (n.kind === "attr" && !out.includes(n.attr)) out.push(n.attr);
  return out;
}
