// The web app's data: built from data/, it carries every section any citation points to (and no other), each still
// hashing to what its citations pin; the presentation names only real rules and places every one.
import { checkCitation, citedSectionKeys, citedText, findCitations, sha256Hex } from "@mrn/core";
import { describe, expect, it } from "vitest";
import { checkPresentation } from "../src/checks.ts";
import { buildSnapshot } from "../src/snapshot.ts";

const { snapshot, sections } = buildSnapshot();

describe("the web snapshot", () => {
  it("has the texts of exactly the cited sections, with their locators and sources", () => {
    const keys = citedSectionKeys({ model: snapshot.model, examples: snapshot.examples });
    expect(Object.keys(sections).sort()).toEqual(keys);
    expect(Object.keys(snapshot.sections).sort()).toEqual(keys);
    for (const key of keys) expect(snapshot.sources[key.split("/")[0] ?? ""]).toBeDefined();
  });

  it("each section text hashes to its sha256, and every citation verifies against the snapshot alone", () => {
    for (const s of Object.values(sections)) expect(sha256Hex(citedText(s.raw))).toBe(s.sha256);
    const lookup = (source: string, section: string) => {
      const s = sections[`${source}/${section}`];
      return s ? { sha256: s.sha256, text: citedText(s.raw) } : undefined;
    };
    const all = findCitations({ model: snapshot.model, examples: snapshot.examples });
    expect(all.length).toBeGreaterThan(200);
    for (const { path, value } of all) expect([path, checkCitation(value, lookup)]).toEqual([path, []]);
  });

  it("presents every rule of the modelled market on exactly one branch", () => {
    expect(checkPresentation()).toEqual([]);
    const eu = snapshot.presentation.markets.find((m) => m.market === "EU");
    expect(eu?.status).toBe("modelled");
  });

  it("serialises to JSON and back unchanged", () => {
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
