import { describe, expect, it } from "vitest";
import { checkCitations, checkSources } from "../src/checks.ts";
import { readMeta, readOutline, readSections, sourceIds } from "../src/data.ts";
import { cleanLine, htmlToLines } from "../src/sources/html.ts";
import { cleanPdfText } from "../src/sources/pdf.ts";

describe("htmlToLines", () => {
  it("gives one line per block, drops consolidation markers and keeps the text", () => {
    const html = `<?xml version="1.0"?><html><head><title>L_2017117EN</title></head><body>
      <p class="arrow"><a href="x">▼B</a></p>
      <p class="title-article-norm">Article 1</p>
      <p class="norm">The necessary common specifications shall be adopted by <span><a href="m1"><span class="boldface">►M1</span></a></span> 26 May 2021<span class="boldface"> ◄ </span>. They apply.</p>
      <div class="grid-container grid-list"><div class="list grid-list-column-1"><span>— </span></div>
        <div class="grid-list-column-2"><div class="list">death or an irreversible deterioration of a person's state of health;</div></div></div>
      <table><tr><td><p>(a)</p></td><td><p>first&#160;point</p></td></tr></table>
      <script>ignored()</script>
    </body></html>`;
    expect(htmlToLines(html)).toEqual([
      "Article 1",
      "The necessary common specifications shall be adopted by 26 May 2021. They apply.",
      "—",
      "death or an irreversible deterioration of a person's state of health;",
      "(a)",
      "first point",
    ]);
  });

  it("removes every kind of marker but no legal text", () => {
    expect(cleanLine("►B REGULATION (EU) 2017/745")).toBe("REGULATION (EU) 2017/745");
    expect(cleanLine("▼M6 (b) substances ◄")).toBe("(b) substances");
    expect(cleanLine("from ►C2 1 July ◄ , whichever")).toBe("from 1 July, whichever");
    expect(cleanLine("in Annex XVI ►M1 26 May 2021 ◄ ")).toBe("in Annex XVI 26 May 2021");
    expect(cleanLine("Class IIa ►Bad")).toBe("Class IIa ►Bad");
  });
});

describe("cleanPdfText", () => {
  it("drops running headers and bottom page numbers, keeps body lines, records page starts", () => {
    const page = (n: number, body: string[]) =>
      ["Medical Devices", "MDCG 2021-24 Rev.1", "", ...body, "", String(n)].join("\n");
    const raw = `${[page(1, ["Rule 11", "IIa"]), page(2, ["12", "body two"]), page(3, ["body three"])].join("\f")}\f`;
    const { lines, pageStarts } = cleanPdfText(raw);
    // Pages join without a blank line, so a sentence can run on across a page break.
    expect(lines).toEqual(["Rule 11", "IIa", "12", "body two", "body three"]);
    expect(pageStarts).toEqual([0, 2, 4]);
  });
});

describe("data/sources", () => {
  it("has the expected sources, each with a valid meta.json, an outline and sections", () => {
    expect(sourceIds()).toEqual([
      "ai-act",
      "com-2025-1023",
      "com-2025-1023-annexes",
      "mdcg-2019-11",
      "mdcg-2020-1",
      "mdcg-2021-24",
      "mdcg-2025-6",
      "mdr",
    ]);
    for (const id of sourceIds()) {
      expect(readMeta(id).id).toBe(id);
      expect(readSections(id).sections.map((s) => s.id)).toEqual(readOutline(id).sections.map((s) => s.id));
    }
  });

  it("originals, extracted text and sections are unchanged and reproducible", () => {
    expect(checkSources()).toEqual([]);
  }, 60_000);

  it("every citation in the data files is the text at its offsets (citation = text)", () => {
    expect(checkCitations()).toEqual([]);
  });
});
