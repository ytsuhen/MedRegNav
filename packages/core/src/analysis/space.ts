// The input space of a rule: the attributes its nodes read directly and the rules whose results it reads. A rule's
// evaluation depends on the profile only through these, so analyses enumerate them — attributes over their domain
// (and "unknown"), other rules' results over the results those rules can actually give — instead of the whole
// attribute space.
import { type AttributeRegistry, type AttributeValue, domain } from "../attributes.ts";
import type { RuleResult, Truth } from "../ir/evaluate.ts";
import { evaluateRule, ruleOrder } from "../ir/evaluate.ts";
import { witnesses } from "../ir/explain.ts";
import type { DeviceIr } from "../ir/schema.ts";

/** Attributes the rule's nodes read, in node order. */
export function directAttributes(ir: DeviceIr): string[] {
  const out: string[] = [];
  for (const n of ir.nodes) if (n.kind === "attr" && !out.includes(n.attr)) out.push(n.attr);
  return out;
}

/** Rules whose results the rule reads, in node order. */
export function dependencies(ir: DeviceIr): string[] {
  const out: string[] = [];
  for (const n of ir.nodes) if (n.kind === "result" && !out.includes(n.rule)) out.push(n.rule);
  return out;
}

/** What a rule's result looks like to the rules that read it: whether it applies and the outcomes still possible. */
export interface ResultShape {
  scope: Truth;
  possible: string[];
}

export const shapeKey = (s: ResultShape) => `${String(s.scope)}|${s.possible.join(",")}`;
export const shapeOf = (r: RuleResult): ResultShape => ({ scope: r.scope, possible: [...r.possible] });

/** A stand-in result with this shape (only `scope` and `possible` matter to the rules that read it). */
export function standIn(ruleId: string, shape: ResultShape): RuleResult {
  const status: RuleResult["status"] =
    shape.scope === false
      ? "not-applicable"
      : shape.possible.length === 0
        ? "conflict"
        : shape.possible.length === 1 && shape.scope === true
          ? "determined"
          : "undetermined";
  return {
    ruleId,
    inForce: true,
    scope: shape.scope,
    nodes: {},
    outcomes: {},
    possible: [...shape.possible],
    value: status === "determined" ? (shape.possible[0] ?? null) : null,
    status,
    support: [],
    nodeSupport: {},
  };
}

/** A domain with "unknown" (null) last, or without it. */
export function valuesOf(registry: AttributeRegistry, attr: string, withUnknown: boolean): (AttributeValue | null)[] {
  const a = registry.attributes.find((x) => x.id === attr);
  if (!a) throw new Error(`unknown attribute ${attr}`);
  return withUnknown ? [...domain(a), null] : domain(a);
}

/** Every combination of the given value lists (mixed radix, the first list varying slowest). */
export function* product<T>(lists: readonly (readonly T[])[]): Generator<T[]> {
  if (lists.some((l) => l.length === 0)) return;
  const index = lists.map(() => 0);
  for (;;) {
    yield index.map((i, k) => (lists[k] as readonly T[])[i] as T);
    let k = lists.length - 1;
    while (k >= 0) {
      const i = (index[k] ?? 0) + 1;
      if (i < (lists[k]?.length ?? 0)) {
        index[k] = i;
        break;
      }
      index[k] = 0;
      k--;
    }
    if (k < 0) return;
  }
}

/**
 * The nodes that explain a result: the witnesses of the decided outcome (or of the scope, when the rule does not
 * apply) and of why the alternatives are false — every stricter outcome for a "strictest wins" rule, every other
 * outcome for a rule with exclusive outcomes.
 */
export function explanationNodes(ir: DeviceIr, result: RuleResult): Set<string> {
  const out = new Set<string>();
  const add = (root: string | undefined) => {
    if (root) for (const id of witnesses(ir, result.nodes, root)) out.add(id);
  };
  if (result.scope === false) {
    add(ir.scopeId);
    return out;
  }
  if (ir.scopeId) add(ir.scopeId);
  const value = ir.outcomes.find((o) => o.id === result.value);
  add(value?.rootId);
  if (value)
    for (const o of ir.outcomes)
      if (
        o.id !== value.id &&
        result.outcomes[o.id] === false &&
        (ir.resolution === "exclusive" || o.rank > value.rank)
      )
        add(o.rootId);
  return out;
}

/** Evaluates one rule on stand-ins for the rules it reads. */
export function evaluateOn(
  ir: DeviceIr,
  profile: Readonly<Record<string, AttributeValue | null>>,
  shapes: Readonly<Record<string, ResultShape>>,
): RuleResult {
  const results = Object.fromEntries(Object.entries(shapes).map(([id, s]) => [id, standIn(id, s)]));
  return evaluateRule(ir, profile, results, { support: false });
}

/** Rules reachable through result nodes from `ids`, in dependency order. */
export function closure(byId: ReadonlyMap<string, DeviceIr>, ids: readonly string[]): DeviceIr[] {
  const seen = new Set<string>();
  const out: DeviceIr[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const ir = byId.get(id);
    if (!ir) throw new Error(`unknown rule ${id}`);
    for (const d of dependencies(ir)) visit(d);
    out.push(ir);
  };
  for (const id of ids) visit(id);
  return out;
}

/** One input of a rule: values of the attributes it reads and the results of the rules it reads. */
export interface RuleInput {
  profile: Record<string, AttributeValue | null>;
  shapes: Record<string, ResultShape>;
}

export interface JointInputs {
  inputs: RuleInput[];
  /** How many profiles over every attribute involved these inputs stand for (the attribute space covered). */
  profiles: number;
}

/**
 * Every distinct input a real profile can give `ir`, exactly: the rules it reads are evaluated in dependency order on
 * joint states that keep only what later rules still need (the attributes they read, the results they read), so
 * correlations through shared attributes and shared rules survive while everything else is folded into the results.
 * Attributes range over their domain, with "unknown" when `withUnknown`.
 */
export function jointInputs(
  ir: DeviceIr,
  byId: ReadonlyMap<string, DeviceIr>,
  registry: AttributeRegistry,
  withUnknown: boolean,
): JointInputs {
  const chain = closure(byId, dependencies(ir));
  const values = (a: string) => valuesOf(registry, a, withUnknown);
  let states: RuleInput[] = [{ profile: {}, shapes: {} }];
  const involved = new Set<string>();
  chain.forEach((rule, i) => {
    const later = [...chain.slice(i + 1), ir];
    const needAttrs = new Set(later.flatMap(directAttributes));
    const needRules = new Set(later.flatMap(dependencies));
    const own = directAttributes(rule);
    for (const a of own) involved.add(a);
    const next = new Map<string, RuleInput>();
    for (const state of states) {
      const fresh = own.filter((a) => !(a in state.profile));
      for (const combo of product<AttributeValue | null>(fresh.map(values))) {
        const profile = { ...state.profile };
        fresh.forEach((a, k) => {
          profile[a] = combo[k] ?? null;
        });
        const shapes = { ...state.shapes, [rule.id]: shapeOf(evaluateOn(rule, profile, state.shapes)) };
        const kept: RuleInput = {
          profile: Object.fromEntries(Object.entries(profile).filter(([a]) => needAttrs.has(a))),
          shapes: Object.fromEntries(Object.entries(shapes).filter(([id]) => needRules.has(id))),
        };
        const key = JSON.stringify([
          Object.entries(kept.profile).sort(([a], [b]) => a.localeCompare(b)),
          Object.entries(kept.shapes)
            .map(([id, sh]) => [id, shapeKey(sh)])
            .sort(),
        ]);
        if (!next.has(key)) next.set(key, kept);
      }
    }
    states = [...next.values()];
  });
  const own = directAttributes(ir);
  for (const a of own) involved.add(a);
  const deps = dependencies(ir);
  const inputs = states.flatMap((state) => {
    const fresh = own.filter((a) => !(a in state.profile));
    return [...product<AttributeValue | null>(fresh.map(values))].map((combo) => {
      const profile = Object.fromEntries(
        own.filter((a) => a in state.profile).map((a) => [a, state.profile[a] ?? null]),
      );
      fresh.forEach((a, k) => {
        profile[a] = combo[k] ?? null;
      });
      return { profile, shapes: Object.fromEntries(deps.map((d) => [d, state.shapes[d] as ResultShape])) };
    });
  });
  const profiles = [...involved].reduce((n, a) => n * values(a).length, 1);
  return { inputs, profiles };
}

/** Rules in dependency order with hypothetical rules last (nothing reads them by their own id). */
export const analysisOrder = (rules: readonly DeviceIr[]): DeviceIr[] => {
  const ordered = ruleOrder(rules);
  return [...ordered.filter((r) => r.role !== "hypothetical"), ...ordered.filter((r) => r.role === "hypothetical")];
};
