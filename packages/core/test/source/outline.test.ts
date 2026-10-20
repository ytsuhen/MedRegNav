import { describe, expect, it } from "vitest";
import { normalizeText, type Outline, sha256Hex, sliceSections } from "../../src/index.ts";

const LINES = [
  "Contents", // 0
  "Article 1", // 1 (table of contents)
  "Article 2", // 2
  "Article 1", // 3
  "Subject matter", // 4
  "This Regulation lays down rules.", // 5
  "Article 2", // 6
  "Definitions", // 7
  "‘device’ means — software", // 8
  "ANNEX I", // 9
  "3.3.", // 10
  "Software text.", // 11
  "ANNEX II", // 12
  "3.3.", // 13
  "Other text.", // 14
];

const outline = (sections: Outline["sections"]): Outline => ({ source: "test", sections });

describe("sliceSections", () => {
  it("cuts sections by whole-line anchors, with after, occurrence and toEnd", () => {
    const { sections, issues } = sliceSections(
      LINES,
      outline([
        {
          id: "art-1",
          title: "Subject matter",
          kind: "article",
          ref: "Article 1",
          start: { line: "Article 1", occurrence: 2 },
          end: { line: "Article 2" },
        },
        {
          id: "annex-i-3.3",
          title: "Software",
          kind: "section",
          ref: "Annex I, 3.3",
          after: { line: "ANNEX I" },
          start: { line: "3.3." },
          end: { startsWith: "ANNEX" },
        },
        {
          id: "annex-ii",
          title: "Annex II",
          kind: "annex",
          ref: "Annex II",
          start: { line: "ANNEX II" },
          toEnd: true,
        },
      ]),
    );
    expect(issues).toEqual([]);
    expect(sections.map((s) => [s.id, s.lines])).toEqual([
      ["art-1", [3, 6]],
      ["annex-i-3.3", [10, 12]],
      ["annex-ii", [12, 15]],
    ]);
    const art1 = sections[0];
    expect(art1?.raw).toBe("Article 1\nSubject matter\nThis Regulation lays down rules.");
    expect(art1?.sha256).toBe(sha256Hex(normalizeText(art1?.raw ?? "").text));
  });

  it("matches anchors on normalised lines (spaces, dashes)", () => {
    const { sections, issues } = sliceSections(
      LINES,
      outline([
        {
          id: "def",
          title: "Definition",
          kind: "section",
          ref: "Article 2",
          start: { line: "‘device’  means - software" },
          end: { line: "ANNEX  I" },
        },
      ]),
    );
    expect(issues).toEqual([]);
    expect(sections[0]?.lines).toEqual([8, 9]);
  });

  it("reports ambiguous, missing and malformed anchors and leaves those sections out", () => {
    const base = { title: "t", kind: "section", ref: "r" } as const;
    const { sections, issues } = sliceSections(
      LINES,
      outline([
        { id: "ambiguous", ...base, start: { line: "Article 2" }, end: { line: "ANNEX I" } },
        { id: "missing", ...base, start: { line: "Article 9" }, end: { line: "ANNEX I" } },
        { id: "no-end", ...base, start: { line: "ANNEX II" }, end: { line: "ANNEX III" } },
        { id: "open", ...base, start: { line: "ANNEX II" } },
        { id: "both", ...base, start: { line: "ANNEX II" }, end: { line: "3.3." }, toEnd: true },
        { id: "dup", ...base, start: { line: "Contents" }, end: { line: "Article 2" } },
        { id: "dup", ...base, start: { line: "Contents" }, end: { line: "Article 2" } },
        { id: "late", ...base, after: { line: "ANNEX III" }, start: { line: "3.3." }, end: { line: "x" } },
      ]),
    );
    expect(sections.map((s) => s.id)).toEqual(["dup"]);
    expect(issues.map((i) => [i.section, i.message.split(":")[0]])).toEqual([
      ["ambiguous", "start"],
      ["missing", "start"],
      ["no-end", "end"],
      ["open", "neither end nor toEnd"],
      ["both", "both end and toEnd"],
      ["dup", "duplicate section id"],
      ["late", "after"],
    ]);
  });
});
