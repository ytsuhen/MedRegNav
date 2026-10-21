// The input space of a rule (jointInputs) against brute force over every profile, and coverage on synthetic rules:
// a clean set has no failure, an exclusive rule with overlapping outcomes does.
import { describe, expect, it } from "vitest";
import { closure, jointInputs, product, shapeOf, valuesOf } from "../../src/analysis/space.ts";
import {
  type AttributeValue,
  type DeviceIr,
  dependencies,
  directAttributes,
  evaluateRules,
  ruleCoverage,
  shapeKey,
} from "../../src/index.ts";
import { attr, gate, registry, result, rule } from "../ir/build.ts";

// qual reads a; cls applies when qual says "covered" and reads b and level; nb reads cls's result and a again, so
// a reaches nb twice (directly and through the scope of cls) — the correlation a superset would lose.
const qual = rule(
  "qual",
  [attr("a", "a"), gate("not-a", "not", ["a"])],
  [
    ["covered", 2, "a"],
    ["not-covered", 1, "not-a"],
  ],
  { resolution: "exclusive", resolutionCriterionIds: [] },
);
const cls = rule(
  "cls",
  [
    result("in-scope", "qual", ["covered"]),
    attr("b", "b"),
    attr("hi", "level", "equals", ["high"]),
    gate("b-hi", "all", ["b", "hi"]),
    gate("not-b", "not", ["b"]),
  ],
  [
    ["III", 3, "b-hi"],
    ["IIa", 2, "b"],
    ["I", 1, "not-b"],
  ],
  { scopeId: "in-scope" },
);
const nb = rule(
  "nb",
  [
    result("high", "cls", ["III"]),
    attr("a", "a"),
    attr("c", "c"),
    gate("a-c", "all", ["a", "c"]),
    gate("yes", "any", ["high", "a-c"]),
    gate("no", "not", ["yes"]),
  ],
  [
    ["yes", 2, "yes"],
    ["no", 1, "no"],
  ],
);
const rules = [qual, cls, nb];
const byId = new Map(rules.map((r) => [r.id, r]));

/** Every distinct input of `ir`, from every profile over every attribute its chain reads, evaluated for real. */
function bruteForce(ir: DeviceIr, withUnknown: boolean): Set<string> {
  const chain = closure(byId, dependencies(ir));
  const attrs = [...new Set([...chain, ir].flatMap(directAttributes))];
  const out = new Set<string>();
  for (const combo of product<AttributeValue | null>(attrs.map((a) => valuesOf(registry, a, withUnknown)))) {
    const profile = Object.fromEntries(attrs.map((a, i) => [a, combo[i] ?? null]));
    const results = evaluateRules(chain, profile);
    out.add(
      JSON.stringify([
        directAttributes(ir).map((a) => profile[a] ?? null),
        dependencies(ir).map((d) => {
          const r = results[d];
          if (!r) throw new Error(`no result for ${d}`);
          return shapeKey(shapeOf(r));
        }),
      ]),
    );
  }
  return out;
}

describe("jointInputs", () => {
  for (const withUnknown of [true, false]) {
    it(`gives exactly the inputs real profiles give (${withUnknown ? "with" : "without"} "unknown")`, () => {
      for (const ir of rules) {
        const { inputs, profiles } = jointInputs(ir, byId, registry, withUnknown);
        const keys = inputs.map((input) =>
          JSON.stringify([
            directAttributes(ir).map((a) => input.profile[a] ?? null),
            dependencies(ir).map((d) => {
              const s = input.shapes[d];
              if (!s) throw new Error(`no shape for ${d}`);
              return shapeKey(s);
            }),
          ]),
        );
        expect(new Set(keys).size, `${ir.id}: duplicate inputs`).toBe(keys.length);
        expect(new Set(keys), ir.id).toEqual(bruteForce(ir, withUnknown));
        const attrs = new Set([...closure(byId, dependencies(ir)), ir].flatMap(directAttributes));
        expect(profiles).toBe([...attrs].reduce((n, a) => n * valuesOf(registry, a, withUnknown).length, 1));
      }
    });
  }

  it("keeps the correlation through a shared attribute: no input has a = true with cls out of scope", () => {
    const { inputs } = jointInputs(nb, byId, registry, false);
    expect(inputs.some((i) => i.profile.a === true && i.shapes.cls?.scope === false)).toBe(false);
    expect(inputs.some((i) => i.profile.a === false && i.shapes.cls?.scope === false)).toBe(true);
  });
});

describe("ruleCoverage", () => {
  it("finds no input without an outcome in a clean rule set, and counts every leaf's values", () => {
    const report = ruleCoverage(rules, registry);
    expect(report.map((r) => [r.ruleId, r.failureCount])).toEqual([
      ["qual", 0],
      ["cls", 0],
      ["nb", 0],
    ]);
    const q = report.find((r) => r.ruleId === "qual");
    expect([q?.inputs, q?.profiles]).toEqual([3, 3]);
    expect(q?.leaves.find((l) => l.nodeId === "a")).toEqual({ nodeId: "a", true: 1, false: 1, unknown: 1 });
    for (const r of report) for (const x of r.results) expect(x.possible.length > 0 || x.scope === false).toBe(true);
  });

  it("reports the inputs where exclusive outcomes overlap", () => {
    const bad = rule(
      "bad",
      [attr("a", "a"), attr("b", "b")],
      [
        ["one", 2, "a"],
        ["two", 1, "b"],
      ],
      { resolution: "exclusive", resolutionCriterionIds: [] },
    );
    const [report] = ruleCoverage([bad], registry);
    expect(report?.failureCount).toBeGreaterThan(0);
    expect(report?.failures.map((f) => f.profile)).toContainEqual({ a: true, b: true });
    expect(report?.failures.every((f) => f.status === "conflict")).toBe(true);
  });
});
