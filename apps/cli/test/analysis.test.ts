// The analyses on the real rule set: the M5 criterion (every combination of answers, "don't know" included, gives an
// outcome or an explicit set of possible outcomes), MC/DC with the leaves that never decide on their own, the
// proposed revision's cohort and examples, and the CLI reports. README and SPEC §6 quote these numbers.
import { mcdcPairs, NO_OUTCOME, ruleCoverage, whatIf } from "@mrn/core";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.ts";
import { readExamples, readRegistry, readRules, readWhatIf } from "../src/data.ts";

const rules = readRules();
const registry = readRegistry();

function capture() {
  let text = "";
  return { out: { write: (s: string) => (text += s) }, text: () => text };
}

describe("coverage of the attribute space", () => {
  const report = ruleCoverage(rules, registry);

  it("every rule, on every input a profile can give it, ends with an outcome or an explicit set", () => {
    expect(report.map((r) => r.ruleId).sort()).toEqual(rules.map((r) => r.id).sort());
    for (const r of report) {
      expect(r.failureCount, r.ruleId).toBe(0);
      for (const x of r.results) expect(x.possible.length > 0 || x.scope === false, r.ruleId).toBe(true);
    }
  });

  it("covers the documented input space", () => {
    expect(Object.fromEntries(report.map((r) => [r.ruleId, [r.inputs, r.profiles]]))).toEqual({
      "eu-mdr-qualification": [2187, 2187],
      "eu-mdr-classification": [37260, 1180980],
      "eu-mdr-notified-body": [87, 3542940],
      "eu-ai-act-high-risk": [684, 42515280],
      "mdcg-2019-11-table-1": [1488, 104976],
      "eu-mdr-classification-com-2025-1023": [16560, 524880],
    });
  });
});

describe("MC/DC", () => {
  const report = mcdcPairs(rules, registry);

  it("finds a deciding pair for every leaf but those a stricter outcome always overrides (reported, not forced)", () => {
    expect(Object.fromEntries(report.map((r) => [r.ruleId, `${r.achieved}/${r.total}`]))).toEqual({
      "eu-mdr-qualification": "7/7",
      "eu-mdr-classification": "10/11",
      "eu-mdr-notified-body": "4/4",
      "eu-ai-act-high-risk": "6/6",
      "mdcg-2019-11-table-1": "8/8",
      "eu-mdr-classification-com-2025-1023": "10/13",
    });
    const none = report.flatMap((r) =>
      r.leaves.filter((l) => l.status === "none").map((l) => `${r.ruleId}#${l.nodeId}`),
    );
    expect(none).toEqual([
      "eu-mdr-classification#dev-i",
      "eu-mdr-classification-com-2025-1023#sit-non-serious",
      "eu-mdr-classification-com-2025-1023#sig-inform",
      "eu-mdr-classification-com-2025-1023#dev-i",
    ]);
  });

  it("gives every pair two different outcomes and two different values of what the leaf reads", () => {
    for (const r of report)
      for (const l of r.leaves)
        if (l.pair) {
          expect(l.pair.outcomes[0], `${r.ruleId}#${l.nodeId}`).not.toBe(l.pair.outcomes[1]);
          expect(l.pair.values[0], `${r.ruleId}#${l.nodeId}`).not.toBe(l.pair.values[1]);
        }
  });
});

describe("what if COM(2025) 1023 were adopted", () => {
  const [proposal] = readWhatIf().proposals;
  if (!proposal) throw new Error("no proposal in data/whatif.json");
  const w = whatIf(rules, registry, proposal, readExamples());
  const one = (id: string) => w.examples.find((e) => e.example === id);

  it("compares the revision with Rule 11 on a cohort of distinct situations", () => {
    const m = w.matrix;
    const sum = Object.values(m.cells).reduce((n, row) => n + Object.values(row).reduce((k, x) => k + x, 0), 0);
    expect(sum).toBe(m.cohort);
    expect([m.cohort, m.changed, m.up, m.down]).toEqual([162, 77, 31, 46]);
    expect(m.outcomes).toEqual(["I", "IIa", "IIb", "III"]);
  });

  it("keeps the class of the MDCG examples that state their IMDRF category", () => {
    for (const [id, cls] of [
      ["stroke-image-analysis", "III"],
      ["cognitive-therapy-specialist", "IIa"],
      ["heartbeat-app", "IIb"],
      ["depression-scoring", "IIb"],
      ["chemotherapy-ranking", "IIa"],
    ])
      expect([id, one(id ?? "")?.from, one(id ?? "")?.to]).toEqual([id, [cls], [cls]]);
    expect(one("wellness-app")?.to).toEqual([NO_OUTCOME]);
  });
});

describe("the CLI reports", () => {
  it("coverage exits 0 with a tick for every rule", async () => {
    const { out, text } = capture();
    expect(await runCli(["coverage"], out)).toBe(0);
    expect(text().match(/✓ every combination gives an outcome/g)).toHaveLength(rules.length);
  });

  it("mcdc lists every rule", async () => {
    const { out, text } = capture();
    expect(await runCli(["mcdc"], out)).toBe(0);
    expect(text()).toContain("eu-mdr-classification [primary] — 864 real inputs; MC/DC 10/11 leaves");
    expect(text()).not.toContain(NO_OUTCOME);
  });

  it("whatif prints the transition matrix and the examples", async () => {
    const { out, text } = capture();
    expect(await runCli(["whatif"], out)).toBe(0);
    expect(text()).toContain("162 distinct situations; the class changes in 77 (up 31, down 46)");
    expect(text()).toMatch(/in force ↓ \/ proposal → +I +IIa +IIb +III/);
    expect(text()).toMatch(/\n {2}IIa +12 +45 +8 +4\n/);
    expect(text()).toContain("heartbeat-app");
  });
});
