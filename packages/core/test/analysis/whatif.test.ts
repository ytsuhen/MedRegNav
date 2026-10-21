// "What if" on a synthetic revision: the IR diff, the cohort's transition matrix worked out by hand (incoherent
// combinations dropped, an answer that changes neither result not varied), the reference examples, and the answers
// the coherence constraints imply.
import { describe, expect, it } from "vitest";
import {
  type Citation,
  diffRules,
  type Example,
  impliedAnswers,
  NO_OUTCOME,
  type WhatIfProposal,
  whatIf,
} from "../../src/index.ts";
import { attr, gate, registry, result, rule } from "../ir/build.ts";

const T = (s: string) => ({ uk: s, en: s });
const cite: Citation = { source: "s", section: "x", quote: "q", sha256: "0".repeat(64), start: 0, end: 1 };

const qual = rule(
  "qual",
  [attr("a", "a"), gate("not-a", "not", ["a"])],
  [
    ["covered", 2, "a"],
    ["not-covered", 1, "not-a"],
  ],
  { resolution: "exclusive", resolutionCriterionIds: [] },
);
// In force: b and c → III, b → IIa, otherwise I.
const cls = rule(
  "cls",
  [
    result("in-scope", "qual", ["covered"]),
    attr("b", "b"),
    attr("c", "c"),
    gate("b-c", "all", ["b", "c"]),
    gate("not-b", "not", ["b"]),
  ],
  [
    ["III", 3, "b-c"],
    ["IIa", 2, "b"],
    ["I", 1, "not-b"],
  ],
  { scopeId: "in-scope" },
);
// Proposed: the class follows level alone.
const revision = rule(
  "cls-proposal",
  [
    result("in-scope", "qual", ["covered"]),
    attr("hi", "level", "equals", ["high"]),
    attr("mid", "level", "equals", ["mid"]),
    attr("lo", "level", "equals", ["low"]),
  ],
  [
    ["III", 3, "hi"],
    ["IIa", 2, "mid"],
    ["I", 1, "lo"],
  ],
  { scopeId: "in-scope", role: "hypothetical", revises: "cls" },
);
const rules = [qual, cls, revision];

const example = (id: string, profile: Example["profile"]): Example => ({
  id,
  title: T(id),
  source: cite,
  profile,
  expected: [{ rule: "cls", outcome: "III" }],
  interpretation: T(id),
  preset: false,
});

// b with a low level cannot describe one device.
const proposal: WhatIfProposal = {
  revision: "cls-proposal",
  base: "base",
  constraints: [
    {
      when: { attr: "b", isTrue: true },
      require: { attr: "level", in: ["high", "mid"] },
      why: T("x"),
      citations: [cite],
    },
  ],
};

describe("diffRules", () => {
  it("lists nodes, outcomes and attributes added, removed or changed", () => {
    const d = diffRules(cls, revision);
    expect(d.from).toEqual({ id: "cls", revision: 1 });
    expect(d.nodes).toEqual({ added: ["hi", "mid", "lo"], removed: ["b", "c", "b-c", "not-b"], changed: [] });
    expect(d.outcomes).toEqual({ added: [], removed: [], changed: ["III", "IIa", "I"] });
    expect(d.criteria).toEqual({ added: [], removed: [], changed: [] });
    expect(d.attributes).toEqual({ added: ["level"], removed: ["b", "c"] });
  });
});

describe("whatIf", () => {
  const examples = [
    example("base", { a: true, b: true, c: false, level: "mid" }),
    example("open", { a: true, b: true, c: true }),
  ];
  const w = whatIf(rules, registry, proposal, examples);

  it("varies the attributes either version reads", () => {
    expect(w.attributes).toEqual(["b", "c", "level"]);
    expect([w.revision, w.revises]).toEqual(["cls-proposal", "cls"]);
  });

  it("keeps the base example's other answers: from a base out of scope, nothing has a class", () => {
    const off = whatIf(rules, registry, proposal, [example("base", { a: false, b: true, c: false, level: "mid" })]);
    expect(off.matrix.cells).toEqual({ [NO_OUTCOME]: { [NO_OUTCOME]: 1 } });
    expect([off.matrix.cohort, off.matrix.changed]).toEqual([1, 0]);
  });

  it("counts the coherent, distinct situations in the transition matrix", () => {
    // 12 combinations; b with a low level is incoherent (2); with b false, c changes neither result (3 more).
    expect(w.matrix.outcomes).toEqual(["I", "IIa", "III"]);
    expect(w.matrix.cells).toEqual({
      III: { III: 1, IIa: 1 },
      IIa: { III: 1, IIa: 1 },
      I: { III: 1, IIa: 1, I: 1 },
    });
    const sum = Object.values(w.matrix.cells).reduce((n, row) => n + Object.values(row).reduce((m, k) => m + k, 0), 0);
    expect(sum).toBe(w.matrix.cohort);
    expect([w.matrix.cohort, w.matrix.changed, w.matrix.up, w.matrix.down]).toEqual([7, 4, 3, 1]);
  });

  it("compares the reference examples: an unknown answer the proposal reads leaves a set", () => {
    expect(w.examples).toEqual([
      { example: "base", from: ["IIa"], to: ["IIa"], implied: [] },
      { example: "open", from: ["III"], to: ["III", "IIa", "I"], implied: [] },
    ]);
  });
});

describe("impliedAnswers", () => {
  // In this order b can only be filled in on a second pass, once the first has filled in level.
  const constraints: WhatIfProposal["constraints"] = [
    { when: { attr: "level", equals: "high" }, require: { attr: "b", isTrue: true }, why: T("x"), citations: [cite] },
    { when: { attr: "c", isTrue: true }, require: { attr: "level", equals: "high" }, why: T("x"), citations: [cite] },
  ];

  it("fills in the single value a constraint requires, repeatedly, and never overrides an answer", () => {
    expect(impliedAnswers(constraints, { c: true }, [qual, cls])).toEqual({ c: true, level: "high", b: true });
    expect(impliedAnswers(constraints, { c: true, level: "low" }, [qual, cls])).toEqual({ c: true, level: "low" });
    expect(impliedAnswers(constraints, { c: false }, [qual, cls])).toEqual({ c: false });
  });

  it("feeds the examples' transitions, which name the implied attributes", () => {
    const w = whatIf(rules, registry, { ...proposal, constraints: [...proposal.constraints, ...constraints] }, [
      example("base", { a: true, b: true, c: false, level: "mid" }),
      example("implied", { a: true, c: true }),
    ]);
    expect(w.examples[1]).toEqual({
      example: "implied",
      from: ["III", "IIa", "I"],
      to: ["III"],
      implied: ["level", "b"],
    });
  });
});
