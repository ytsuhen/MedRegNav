// MC/DC on synthetic rules: every pair found really flips its leaf and the outcome; a leaf that a stricter outcome
// always overrides gets no pair ("none", reported, not forced).
import { describe, expect, it } from "vitest";
import { type DeviceIr, evaluateRule, type McdcLeaf, mcdcPairs } from "../../src/index.ts";
import { attr, gate, registry, rule } from "../ir/build.ts";

// The classifier of the evaluation tests: a → III if b, else IIa; c → IIb; otherwise I.
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

// "lo" needs a and b, but a alone already gives the stricter "hi": b never decides on its own.
const dominated = rule(
  "dom",
  [attr("a", "a"), attr("b", "b"), gate("a-and-b", "all", ["a", "b"]), gate("not-a", "not", ["a"])],
  [
    ["hi", 3, "a"],
    ["lo", 2, "a-and-b"],
    ["base", 1, "not-a"],
  ],
);

const parse = (v: string) => (v === "true" ? true : v === "false" ? false : v);

/** Re-runs both sides of an attribute leaf's pair and checks the leaf and the outcome flip. */
function checkPair(ir: DeviceIr, leaf: McdcLeaf) {
  const pair = leaf.pair;
  if (!pair) throw new Error(`${leaf.nodeId}: no pair`);
  const [x, y] = pair.values.map((v) => evaluateRule(ir, { ...pair.profile, [leaf.reads]: parse(v) }));
  expect([x?.value, y?.value], leaf.nodeId).toEqual(pair.outcomes);
  expect(x?.nodes[leaf.nodeId], leaf.nodeId).not.toBe(y?.nodes[leaf.nodeId]);
}

describe("mcdcPairs", () => {
  it("finds a unique-cause pair for every leaf of the classifier, each reproducible", () => {
    const [report] = mcdcPairs([classifier], registry);
    expect(report?.leaves.map((l) => [l.nodeId, l.status])).toEqual([
      ["a", "unique"],
      ["b", "unique"],
      ["c", "unique"],
    ]);
    expect([report?.achieved, report?.total, report?.inputs]).toEqual([3, 3, 8]);
    for (const leaf of report?.leaves ?? []) checkPair(classifier, leaf);
  });

  it("reports a leaf that never decides the outcome on its own as none", () => {
    const [report] = mcdcPairs([dominated], registry);
    expect(report?.leaves.map((l) => [l.nodeId, l.status])).toEqual([
      ["a", "unique"],
      ["b", "none"],
    ]);
    expect(report?.leaves.find((l) => l.nodeId === "b")?.pair).toBeNull();
    expect([report?.achieved, report?.total]).toEqual([1, 2]);
  });
});
