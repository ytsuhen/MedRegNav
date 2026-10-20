import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  and3,
  crossCheck,
  decisiveUnknowns,
  evaluateRule,
  evaluateRules,
  NO_OUTCOME,
  not3,
  or3,
  type Profile,
  possibleWithScope,
  resultIn,
  ruleOrder,
  ruleSignature,
  type Truth,
  withRevision,
} from "../../src/index.ts";
import { atLeast, attr, gate, registry, result, rule } from "./build.ts";

const truths: Truth[] = [true, false, null];

describe("Kleene connectives", () => {
  it("follow the strong Kleene tables", () => {
    expect(truths.map((a) => truths.map((b) => and3(a, b)))).toEqual([
      [true, false, null],
      [false, false, false],
      [null, false, null],
    ]);
    expect(truths.map((a) => truths.map((b) => or3(a, b)))).toEqual([
      [true, true, true],
      [true, false, null],
      [true, null, null],
    ]);
    expect(truths.map(not3)).toEqual([false, true, null]);
  });
});

// A two-sub-rule classifier in the shape of Rule 11: a → III if b, else IIa; c → IIb; otherwise I.
const classifier = rule(
  "cls",
  [
    attr("a", "a"),
    attr("b", "b"),
    attr("c", "c"),
    gate("a-and-b", "all", ["a", "b"]),
    gate("not-a", "not", ["a"]),
    gate("not-c", "not", ["c"]),
    gate("neither", "all", ["not-a", "not-c"]),
  ],
  [
    ["III", 4, "a-and-b"],
    ["IIb", 3, "c"],
    ["IIa", 2, "a"],
    ["I", 1, "neither"],
  ],
);

describe("evaluateRule: highest-rank resolution", () => {
  it("picks the strictest true outcome when everything is known", () => {
    const r = evaluateRule(classifier, { a: true, b: false, c: true });
    expect([r.status, r.value, r.possible]).toEqual(["determined", "IIb", ["IIb"]]);
    expect(evaluateRule(classifier, { a: false, b: false, c: false }).value).toBe("I");
  });

  it("keeps every stricter unknown outcome possible above the best true one", () => {
    const r = evaluateRule(classifier, { a: true });
    expect([r.status, r.value, r.possible]).toEqual(["undetermined", null, ["III", "IIb", "IIa"]]);
    expect(r.outcomes).toEqual({ III: null, IIb: null, IIa: true, I: false });
  });

  it("with nothing known, every outcome whose root may hold is possible", () => {
    expect(evaluateRule(classifier, {}).possible).toEqual(["III", "IIb", "IIa", "I"]);
  });

  it("explains a result by its witnesses: the winning branch and why nothing stricter", () => {
    expect(evaluateRule(classifier, { a: true, b: false, c: false }).support).toEqual(["a", "b", "c"]);
    expect(evaluateRule(classifier, { a: false, b: true, c: false }).support).toEqual(["a", "c"]);
  });

  it("treats atLeast like vlk-engine: true at n, false when n is out of reach, else null", () => {
    const r = rule(
      "n",
      [attr("a", "a"), attr("b", "b"), attr("c", "c"), atLeast("two", 2, ["a", "b", "c"])],
      [["yes", 1, "two"]],
    );
    expect(evaluateRule(r, { a: true, b: true }).outcomes.yes).toBe(true);
    expect(evaluateRule(r, { a: false, b: false }).outcomes.yes).toBe(false);
    expect(evaluateRule(r, { a: true, b: false }).outcomes.yes).toBe(null);
  });
});

const qual = rule(
  "qual",
  [attr("a", "a"), gate("not-a", "not", ["a"])],
  [
    ["covered", 2, "a"],
    ["not-covered", 1, "not-a"],
  ],
  { resolution: "exclusive", resolutionCriterionIds: [] },
);

describe("rules that read rules", () => {
  const dependent = rule("dep", [result("covered", "qual", ["covered"]), attr("b", "b")], [["x", 1, "b"]], {
    scopeId: "covered",
  });

  it("evaluates in dependency order and propagates scope", () => {
    expect(ruleOrder([dependent, qual]).map((r) => r.id)).toEqual(["qual", "dep"]);
    const off = evaluateRules([dependent, qual], { a: false, b: true });
    expect([off.dep?.status, off.dep?.possible]).toEqual(["not-applicable", []]);
    const maybe = evaluateRules([dependent, qual], { b: true });
    expect([maybe.dep?.status, maybe.dep?.scope]).toEqual(["undetermined", null]);
    expect(possibleWithScope(maybe.dep ?? never())).toEqual(["x", NO_OUTCOME]);
    expect(evaluateRules([dependent, qual], { a: true, b: true }).dep?.value).toBe("x");
  });

  it("resultIn is true only when every possibility is inside the set", () => {
    const results = evaluateRules([qual], {});
    expect(resultIn(results.qual ?? never(), ["covered"])).toBe(null);
    expect(resultIn(results.qual ?? never(), ["covered", "not-covered"])).toBe(true);
    expect(resultIn(evaluateRules([qual], { a: false }).qual ?? never(), ["covered"])).toBe(false);
  });

  it("refuses unknown rules and cycles", () => {
    expect(() => ruleOrder([dependent])).toThrow(/unknown rule qual/);
    const loop = rule("qual", [result("r", "dep", ["x"])], [["covered", 1, "r"]]);
    expect(() => ruleOrder([dependent, loop])).toThrow(/cycle/);
  });

  it("flags an exclusive rule whose outcomes overlap", () => {
    const bad = rule(
      "bad",
      [attr("a", "a"), attr("b", "b")],
      [
        ["one", 2, "a"],
        ["two", 1, "b"],
      ],
      { resolution: "exclusive", resolutionCriterionIds: [] },
    );
    expect(evaluateRule(bad, { a: true, b: true }).status).toBe("conflict");
  });

  it("substitutes a hypothetical revision under the revised rule's id", () => {
    const revision = rule(
      "qual-proposal",
      [attr("b", "b"), gate("not-b", "not", ["b"])],
      [
        ["covered", 2, "b"],
        ["not-covered", 1, "not-b"],
      ],
    );
    const swapped = withRevision([qual, dependent], { ...revision, role: "hypothetical", revises: "qual" });
    const results = evaluateRules(swapped, { a: false, b: true });
    expect([results.qual?.value, results.dep?.value]).toEqual(["covered", "x"]);
  });
});

describe("decisiveUnknowns", () => {
  it("asks only what would change a result", () => {
    const sig = ruleSignature([classifier]);
    expect(decisiveUnknowns(registry, {}, sig, ["a", "b", "c"]).map((d) => d.attr)).toEqual(["a", "b", "c"]);
    // c true makes IIb the floor; b still matters (III above), a too.
    expect(decisiveUnknowns(registry, { c: true }, sig, ["a", "b", "c"]).map((d) => d.attr)).toEqual(["a", "b"]);
    // a false: III and IIa are out, b no longer matters.
    expect(decisiveUnknowns(registry, { a: false }, sig, ["a", "b", "c"]).map((d) => d.attr)).toEqual(["c"]);
    expect(decisiveUnknowns(registry, { a: true, b: true, c: false }, sig, ["a", "b", "c"])).toEqual([]);
  });
});

describe("crossCheck", () => {
  const table = rule(
    "table",
    [attr("hi", "level", "equals", ["high"]), gate("not-hi", "not", ["hi"])],
    [
      ["III", 2, "hi"],
      ["IIa", 1, "not-hi"],
    ],
  );
  const withCheck = { ...table, crossCheck: { attr: "b", map: { true: "III", false: "IIa" }, criterionIds: ["c1"] } };
  const check = (p: Profile) => crossCheck(withCheck, evaluateRule(withCheck, p), p)?.status;

  it("compares the guidance outcome with the mapped attribute", () => {
    expect(check({ level: "high", b: true })).toBe("consistent");
    expect(check({ level: "high", b: false })).toBe("inconsistent");
    expect(check({ level: "high" })).toBe("incomplete");
    expect(crossCheck(table, evaluateRule(table, {}), {})).toBeNull();
  });
});

describe("soundness (property)", () => {
  const profiles = fc.record(
    {
      a: fc.option(fc.boolean(), { nil: undefined }),
      b: fc.option(fc.boolean(), { nil: undefined }),
      c: fc.option(fc.boolean(), { nil: undefined }),
    },
    { requiredKeys: [] },
  );

  it("learning an answer never adds a possibility, and a complete profile leaves exactly one", () => {
    fc.assert(
      fc.property(profiles, fc.boolean(), fc.boolean(), fc.boolean(), (partial, a, b, c) => {
        const full = { a: partial.a ?? a, b: partial.b ?? b, c: partial.c ?? c };
        const p = evaluateRule(classifier, partial);
        const q = evaluateRule(classifier, full);
        expect(q.status).toBe("determined");
        expect(p.possible).toContain(q.value);
        for (const [id, t] of Object.entries(p.nodes)) if (t !== null) expect(q.nodes[id]).toBe(t);
      }),
    );
  });
});

function never(): never {
  throw new Error("missing result");
}
