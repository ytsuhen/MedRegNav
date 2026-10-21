// Quotes as the browser shows them: every citation in the snapshot verifies against its section text, the marked
// words are the quote, and a changed section is caught.
import { findCitations, normalizeText } from "@mrn/core";
import { describe, expect, it } from "vitest";
import { quoteView, reflow, verifyQuote } from "../src/lib/quotes.ts";
import { sections, snapshot } from "./fixtures.ts";

const words = (s: string) => normalizeText(s.replaceAll(/[•●▪◦·]/g, " ")).text;

describe("quotes in the browser", () => {
  const all = findCitations({ model: snapshot.model, examples: snapshot.examples });

  it("verify every citation and mark exactly the quoted words", () => {
    for (const { value } of all) {
      const c = value as unknown as Parameters<typeof verifyQuote>[0];
      const section = sections[`${c.source}/${c.section}`];
      if (!section) throw new Error(`no section ${c.source}/${c.section}`);
      const format = snapshot.sources[c.source]?.format ?? "html";
      expect(verifyQuote(c, section)).toBe(true);
      const view = quoteView(c, section, 120, format);
      expect([c.source, c.section, words(view.mark)]).toEqual([c.source, c.section, words(c.quote)]);
    }
  });

  it("catch a section text that no longer matches", () => {
    const { value } = all[0] ?? { value: {} };
    const c = value as unknown as Parameters<typeof verifyQuote>[0];
    const section = sections[`${c.source}/${c.section}`];
    if (!section) throw new Error("no section");
    expect(verifyQuote(c, { ...section, raw: `${section.raw} changed` })).toBe(false);
  });

  it("reflow PDF lines into paragraphs and join list markers, without touching words", () => {
    expect(reflow("first line\nsecond line\n\n•\nnext para", "pdf")).toBe("first line second line\n\nnext para");
    expect(reflow("1.\nPrior to placing\n(a)\nfirst\n—\ndeath", "html")).toBe(
      "1. Prior to placing\n(a) first\n— death",
    );
  });
});
