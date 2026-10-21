// Witnesses: the nodes listed under "what decided it" follow the same choices as the attribute support.
import { describe, expect, it } from "vitest";
import { evaluateRule, witnesses } from "../../src/index.ts";
import { attr, gate, rule } from "./build.ts";

const ir = rule(
  "r",
  [
    attr("a", "a"),
    attr("b", "b"),
    attr("c", "c"),
    gate("ab", "all", ["a", "b"]),
    gate("either", "any", ["ab", "c"]),
    gate("not-c", "not", ["c"]),
  ],
  [["yes", 1, "either"]],
);

const nodes = (profile: Record<string, boolean | null>) => evaluateRule(ir, profile).nodes;

describe("witnesses", () => {
  it("a true any: the first true child and what makes it true", () => {
    expect(witnesses(ir, nodes({ a: true, b: true, c: true }), "either")).toEqual(["either", "ab", "a", "b"]);
  });

  it("a false all: the first false child only", () => {
    expect(witnesses(ir, nodes({ a: false, b: false, c: false }), "ab")).toEqual(["ab", "a"]);
  });

  it("a false any: every child", () => {
    expect(witnesses(ir, nodes({ a: false, b: true, c: false }), "either")).toEqual(["either", "ab", "a", "c"]);
  });

  it("an unknown gate: its unknown children", () => {
    expect(witnesses(ir, nodes({ a: true, b: null, c: false }), "either")).toEqual(["either", "ab", "b"]);
  });

  it("not: its child", () => {
    expect(witnesses(ir, nodes({ c: true }), "not-c")).toEqual(["not-c", "c"]);
  });
});
