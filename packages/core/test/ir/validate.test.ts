import { describe, expect, it } from "vitest";
import { irHash, validateRules } from "../../src/index.ts";
import { attr, gate, registry, result, rule } from "./build.ts";

const hashed = <T extends ReturnType<typeof rule>>(ir: T): T => ({
  ...ir,
  metadata: { ...ir.metadata, irHash: irHash(ir) },
});

const good = hashed(
  rule(
    "good",
    [attr("a", "a"), attr("lvl", "level", "in", ["low", "mid"]), gate("both", "all", ["a", "lvl"])],
    [
      ["II", 2, "both"],
      ["I", 1, "a"],
    ],
  ),
);

const codes = (inputs: unknown[]) =>
  validateRules(inputs, registry).map((i) => `${i.code}${i.nodeId ? `@${i.nodeId}` : ""}`);

describe("validateRules", () => {
  it("accepts a well-formed rule", () => {
    expect(validateRules([good], registry)).toEqual([]);
  });

  it("reports schema errors, bad structure and bad references", () => {
    const broken = rule(
      "broken",
      [
        attr("a", "a"),
        attr("a", "a"),
        attr("x", "nope"),
        attr("e", "level", "isTrue"),
        attr("v", "level", "equals", ["huge"]),
        gate("one", "all", ["a"]),
        gate("n", "not", ["a", "x"]),
        gate("dangling", "any", ["a", "ghost"]),
        result("r", "elsewhere", ["z"]),
        gate("lonely", "any", ["a", "x"]),
      ],
      [
        ["II", 1, "one"],
        ["I", 1, "missing"],
      ],
    );
    const out = codes([broken, { id: "junk" }]);
    for (const code of [
      "duplicate-id@a",
      "unknown-attribute@x",
      "bad-op@e",
      "bad-value@v",
      "child-count@one",
      "child-count@n",
      "missing-node@dangling",
      "unknown-rule@r",
      "missing-node",
      "rank",
      "orphan@lonely",
      "irhash",
      "schema",
    ]) {
      expect(out).toContain(code);
    }
  });

  it("requires a criterion on every explicit node and on highest-rank resolution, and no unused criteria", () => {
    const uncited = hashed({
      ...good,
      nodes: good.nodes.map((n) =>
        n.id === "a" ? { ...n, prov: { criterionIds: [], basis: "explicit" as const } } : n,
      ),
      resolutionCriterionIds: [],
      criteria: [...good.criteria, { ...(good.criteria[0] ?? never()), id: "c2" }],
    });
    expect(codes([hashed(uncited)])).toEqual(expect.arrayContaining(["uncited@a", "uncited", "unused-criterion"]));
  });

  it("checks results against the read rule's outcomes, cross-checks, lifecycle and rule cycles", () => {
    const reader = hashed(rule("reader", [result("r", "good", ["III"])], [["x", 1, "r"]]));
    expect(codes([good, reader])).toContain("unknown-outcome@r");
    const checked = hashed({
      ...good,
      crossCheck: { attr: "level", map: { huge: "II", low: "IV" }, criterionIds: ["c1"] },
    });
    expect(codes([checked]).filter((c) => c === "cross-check")).toHaveLength(2);
    const reviewed = hashed({ ...good, metadata: { ...good.metadata, status: "approved" as const } });
    expect(codes([reviewed])).toEqual(expect.arrayContaining(["lifecycle"]));
    const a = hashed(rule("p", [result("r", "q", ["x"])], [["x", 1, "r"]]));
    const b = hashed(rule("q", [result("r", "p", ["x"])], [["x", 1, "r"]]));
    expect(codes([a, b])).toContain("cycle");
  });
});

function never(): never {
  throw new Error("missing");
}
