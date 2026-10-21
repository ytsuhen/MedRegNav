// A quote shown in its context: the browser recomputes the section's sha256 from its text and checks that the text
// at the citation's offsets is the quote (the same check the test suite runs), then cuts a window of the section's
// display text around the quoted span. For display only, the window is reflowed: a PDF's visual line breaks are
// joined into paragraphs (blank lines stay breaks, lone bullet glyphs go), and a list marker on a line of its own
// ("1.", "(a)", "—") joins the line it numbers. Words are never changed; the check runs on the original text.
import { type Citation, citedText, rawSpan, type SectionText, sha256Hex } from "@mrn/core";

export interface QuoteView {
  /** The section's text hashes to the citation's sha256 and holds the quote at its offsets. */
  verified: boolean;
  before: string;
  mark: string;
  after: string;
  /** Text was cut before / after the window. */
  cutBefore: boolean;
  cutAfter: boolean;
}

const hashes = new Map<string, string>();

/** sha256 of the section's normalised text, computed once per section text. */
export function sectionSha256(section: SectionText): string {
  let h = hashes.get(section.raw);
  if (h === undefined) {
    h = sha256Hex(citedText(section.raw));
    hashes.set(section.raw, h);
  }
  return h;
}

export function verifyQuote(citation: Citation, section: SectionText): boolean {
  if (sectionSha256(section) !== citation.sha256) return false;
  return citedText(section.raw).slice(citation.start, citation.end) === citation.quote;
}

const OPEN = "\u0001";
const CLOSE = "\u0002";
const MARKER_LINE =
  /(^|\n)((?:\(?[0-9]{1,3}[a-z]?\)?\.?|\(?[a-z]{1,4}\)|[ivx]{1,5}\.|[—–-]|[0-9]+(?:\.[0-9]+)+\.?))\n/g;

/** Display form of a text window: PDF lines joined into paragraphs, list markers joined to their line. */
export function reflow(text: string, format: "html" | "pdf"): string {
  let out = text.replaceAll(MARKER_LINE, "$1$2 ");
  if (format === "pdf") {
    out = out
      .split(/\n{2,}/)
      .map((p) =>
        p
          .split("\n")
          .filter((line) => !/^[•●▪◦·]\s*$/.test(line.replaceAll(OPEN, "").replaceAll(CLOSE, "")))
          .join(" "),
      )
      .filter((p) => p.trim() !== "")
      .join("\n\n");
  }
  return out;
}

/** The quote with up to `context` characters of the section around it (the whole section when context is null). */
export function quoteView(
  citation: Citation,
  section: SectionText,
  context: number | null = 240,
  format: "html" | "pdf" = "html",
): QuoteView {
  const verified = verifyQuote(citation, section);
  const raw = section.raw;
  const span = rawSpan(raw, citation);
  let from = context === null ? 0 : Math.max(0, span.start - context);
  let to = context === null ? raw.length : Math.min(raw.length, span.end + context);
  // Cut at whitespace so that no word is split.
  if (from > 0) {
    const space = raw.slice(from, span.start).search(/\s/);
    from = space >= 0 ? from + space + 1 : span.start;
  }
  if (to < raw.length) {
    const tail = raw.slice(span.end, to);
    const space = Math.max(tail.lastIndexOf(" "), tail.lastIndexOf("\n"));
    to = space >= 0 ? span.end + space : span.end;
  }
  const shown = reflow(
    `${raw.slice(from, span.start)}${OPEN}${raw.slice(span.start, span.end)}${CLOSE}${raw.slice(span.end, to)}`,
    format,
  );
  const open = shown.indexOf(OPEN);
  const close = shown.indexOf(CLOSE);
  return {
    verified,
    before: shown.slice(0, open).trimStart(),
    mark: shown.slice(open + 1, close),
    after: shown.slice(close + 1).trimEnd(),
    cutBefore: from > 0,
    cutAfter: to < raw.length,
  };
}

/** "eur-lex.europa.eu" from a source link. */
export function hostOf(link: string): string {
  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
}
