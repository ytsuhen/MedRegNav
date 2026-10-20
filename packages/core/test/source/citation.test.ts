import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CitedSection,
  checkCitation,
  citedText,
  findCitations,
  locateQuote,
  normalizeText,
  rawSpan,
  resolveCitation,
  sha256Hex,
} from "../../src/index.ts";

const RAW =
  "6.3. Rule 11\nSoftware intended to provide information which is used to take decisions with diagnosis or therapeutic purposes is classified as class IIa, except if such decisions have an impact that may cause:\n—\ndeath or an irreversible deterioration of a person's state of health, in which case it is in class III; or\n—\na serious deterioration.\nAll other software is classified as class I.";

function section(raw: string): CitedSection {
  const text = citedText(raw);
  return { text, sha256: sha256Hex(text) };
}

const SECTION = section(RAW);
const lookup = (source: string, id: string) => (source === "mdr" && id === "rule-11" ? SECTION : undefined);

describe("locateQuote", () => {
  it("finds the only match of the normalised quote", () => {
    const found = locateQuote(SECTION.text, "All other  software is classified\nas class I.");
    expect(found).toEqual({ start: SECTION.text.indexOf("All other"), end: SECTION.text.length });
  });

  it("normalises dashes and apostrophes in the quote like the section", () => {
    const found = locateQuote(SECTION.text, "— death or an irreversible deterioration of a person’s state");
    expect("start" in found && SECTION.text.slice(found.start, found.end)).toBe(
      "- death or an irreversible deterioration of a person’s state",
    );
  });

  it("refuses an ambiguous quote unless an occurrence is named", () => {
    // "classified" contains "class" too: classified, class IIa, class III, classified, class I.
    expect(locateQuote(SECTION.text, "class")).toEqual({ code: "ambiguous", count: 5 });
    const third = locateQuote(SECTION.text, "class", 3);
    expect("start" in third && third.start).toBe(SECTION.text.indexOf("class III"));
    expect(locateQuote(SECTION.text, "class", 9)).toEqual({ code: "not-found", count: 5 });
    expect(locateQuote(SECTION.text, "class IIc")).toEqual({ code: "not-found", count: 0 });
    expect(locateQuote(SECTION.text, "   ")).toEqual({ code: "not-found", count: 0 });
  });
});

describe("resolveCitation and checkCitation", () => {
  it("pins a draft and proves it", () => {
    const result = resolveCitation({ source: "mdr", section: "rule-11", quote: "is in class III" }, SECTION);
    if (!("citation" in result)) throw new Error(result.issue.message);
    const c = result.citation;
    expect(c).toEqual({
      source: "mdr",
      section: "rule-11",
      quote: "is in class III",
      sha256: SECTION.sha256,
      start: SECTION.text.indexOf("is in class III"),
      end: SECTION.text.indexOf("is in class III") + 15,
    });
    expect(checkCitation(c, lookup)).toEqual([]);
  });

  it("catches tampered quotes, moved offsets, changed sections and unknown sections", () => {
    const result = resolveCitation({ source: "mdr", section: "rule-11", quote: "class IIa" }, SECTION);
    if (!("citation" in result)) throw new Error("unresolved");
    const c = result.citation;
    expect(checkCitation({ ...c, quote: "class IIb" }, lookup).map((i) => i.code)).toEqual(["mismatch"]);
    expect(checkCitation({ ...c, start: c.start + 1, end: c.end + 1 }, lookup).map((i) => i.code)).toEqual([
      "mismatch",
    ]);
    expect(checkCitation({ ...c, sha256: sha256Hex("other") }, lookup).map((i) => i.code)).toEqual(["stale"]);
    expect(checkCitation({ ...c, section: "rule-12" }, lookup).map((i) => i.code)).toEqual(["unknown-section"]);
    expect(checkCitation({ source: "mdr", section: "rule-11", quote: "class IIa" }, lookup).map((i) => i.code)).toEqual(
      ["schema"],
    );
  });

  it("reports what is wrong with an unresolvable draft", () => {
    const ambiguous = resolveCitation({ source: "mdr", section: "rule-11", quote: "class" }, SECTION);
    expect("issue" in ambiguous && ambiguous.issue.code).toBe("ambiguous");
    const missing = resolveCitation({ source: "mdr", section: "rule-11", quote: "class IIc" }, SECTION);
    expect("issue" in missing && missing.issue.code).toBe("not-found");
  });

  const words = fc.array(fc.constantFrom("rule", "class", "IIa", "—", "software", "’s", "\n", " ", "x1", "(a)"), {
    minLength: 1,
    maxLength: 30,
  });

  it("round-trips any span: resolve, check, and map back to the raw text", () => {
    fc.assert(
      fc.property(words, fc.nat(), fc.nat(), (parts, a, b) => {
        const raw = parts.join(" ");
        const s = section(raw);
        if (s.text === "") return;
        const [from, to] = [a % s.text.length, b % s.text.length].sort((x, y) => x - y) as [number, number];
        const quote = s.text.slice(from, to + 1).trim();
        if (quote === "") return;
        let hits = 0; // overlapping matches, as locateQuote counts them
        for (let i = s.text.indexOf(quote); i >= 0; i = s.text.indexOf(quote, i + 1)) hits++;
        const occurrence = hits > 1 ? 1 : undefined;
        const result = resolveCitation({ source: "s", section: "x", quote, ...(occurrence && { occurrence }) }, s);
        if (!("citation" in result)) throw new Error(result.issue.message);
        const c = result.citation;
        expect(c.quote).toBe(quote);
        expect(checkCitation(c, () => s)).toEqual([]);
        const span = rawSpan(raw, c);
        expect(normalizeText(raw.slice(span.start, span.end)).text).toBe(quote);
      }),
    );
  });
});

describe("findCitations", () => {
  it("finds citation-shaped objects at any depth, with their JSON path", () => {
    const data = {
      nodes: [{ id: "a", cite: { source: "mdr", section: "s", quote: "q" } }, { id: "b" }],
      criteria: [{ source: "mdr", section: "t", quote: "r", extra: { source: "nested", section: "x", quote: "y" } }],
      note: { source: "only two keys", section: "s" },
    };
    expect(findCitations(data).map((c) => c.path)).toEqual(["$.nodes[0].cite", "$.criteria[0]"]);
  });
});
