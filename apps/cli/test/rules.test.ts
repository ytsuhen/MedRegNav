// The real rule set: valid, every node cited, every MDCG reference example passing, and sound three-valued logic on
// the whole attribute space (learning more never adds a possibility; a complete profile always gives one result).
import {
  type AttributeValue,
  attributesRead,
  crossCheck,
  decisiveUnknowns,
  domain,
  evaluateRules,
  type Profile,
  possibleWithScope,
  profileIssues,
  ruleSignature,
  runExample,
  validateRules,
} from "@mrn/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readExamples, readRegistry, readRuleFiles, readRules } from "../src/data.ts";

const registry = readRegistry();
const rules = readRules();
const examples = readExamples();
const inForce = rules.filter((r) => r.role !== "hypothetical");

describe("data/rules", () => {
  it("validate: schema, structure, attribute references, a citation on every explicit node, fresh irHash", () => {
    expect(
      validateRules(
        readRuleFiles().map((f) => f.json),
        registry,
      ),
    ).toEqual([]);
  });

  it("are all draft manual reference rules", () => {
    for (const r of rules) {
      expect([r.id, r.metadata.status, r.metadata.authoredBy]).toEqual([r.id, "draft", "manual-reference"]);
    }
  });
});

describe("reference examples (MDCG 2019-11 rev.1, MDCG 2021-24 rev.1, MDCG 2025-6)", () => {
  it("are at least ten classification examples from MDCG guidance", () => {
    const classification = examples.filter((e) => e.expected.some((x) => x.rule === "eu-mdr-classification"));
    expect(classification.length).toBeGreaterThanOrEqual(10);
  });

  it.each(examples.map((e) => [e.id, e] as const))("%s gives the outcome the guidance states", (_id, example) => {
    expect(profileIssues(registry, example.profile)).toEqual([]);
    expect(runExample(inForce, example).failures).toEqual([]);
  });

  it("agree with the IMDRF table where the guidance gives an IMDRF category", () => {
    const table = rules.find((r) => r.id === "mdcg-2019-11-table-1");
    if (!table) throw new Error("no table rule");
    const checked = examples.filter((e) => e.profile.imdrfSituation !== undefined);
    expect(checked.length).toBeGreaterThanOrEqual(5);
    for (const e of checked) {
      const results = evaluateRules(inForce, e.profile);
      const result = results[table.id];
      if (!result) throw new Error("no result");
      expect([e.id, crossCheck(table, result, e.profile)?.status]).toEqual([e.id, "consistent"]);
    }
  });

  it("leave no decisive unknown for the rules they state an outcome of", () => {
    for (const e of examples) {
      const asked = decisiveUnknowns(registry, e.profile, ruleSignature(inForce), attributesRead(inForce));
      const stated = new Set(e.expected.map((x) => x.rule));
      expect([e.id, asked.filter((q) => q.affects.some((r) => stated.has(r)))]).toEqual([e.id, []]);
    }
  });
});

describe("three-valued soundness on the real attribute space (property)", () => {
  const attrs = registry.attributes;
  const partial = fc.tuple(...attrs.map((a) => fc.option(fc.constantFrom(...domain(a)), { nil: undefined })));
  const full = fc.tuple(...attrs.map((a) => fc.constantFrom(...domain(a))));
  const toProfile = (values: readonly (AttributeValue | undefined)[]): Profile =>
    Object.fromEntries(attrs.flatMap((a, i) => (values[i] === undefined ? [] : [[a.id, values[i]]])));

  it("a complete profile determines every rule (or puts it out of scope), never a conflict", () => {
    fc.assert(
      fc.property(full, (values) => {
        for (const r of Object.values(evaluateRules(inForce, toProfile(values)))) {
          expect(["determined", "not-applicable"]).toContain(r.status);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("answering more questions only removes possibilities, and every node already decided stays decided", () => {
    fc.assert(
      fc.property(partial, full, (some, all) => {
        const p = toProfile(some);
        const q = toProfile(all.map((v, i) => some[i] ?? v));
        const rp = evaluateRules(inForce, p);
        const rq = evaluateRules(inForce, q);
        for (const [id, r] of Object.entries(rq)) {
          const before = rp[id];
          if (!before) throw new Error(id);
          for (const o of possibleWithScope(r)) expect(possibleWithScope(before)).toContain(o);
          for (const [node, t] of Object.entries(before.nodes)) if (t !== null) expect(r.nodes[node]).toBe(t);
        }
      }),
      { numRuns: 300 },
    );
  });
});
