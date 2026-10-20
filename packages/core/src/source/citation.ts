// Citations: a verbatim quote of one source section, pinned by the sha256 of the section's normalised text and the
// quote's offsets in it (as in vlk-engine, where criteria quote an article section by sha256 + offsets). Authors
// write `{ source, section, quote }`; `resolveCitation` fills in `sha256`, `start` and `end`, and `checkCitation`
// proves on every test run that the text at the offsets is still the quote.
import { z } from "zod";
import { normalizeText, toOriginal } from "../text/normalize.ts";

export const CitationSchema = z.strictObject({
  source: z.string().min(1).describe("Source id: a folder under data/sources/"),
  section: z.string().min(1).describe("Section id from the source's outline"),
  quote: z.string().min(1).describe("Verbatim text, normalised like the section"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex sha256"),
  start: z.int().min(0),
  end: z.int().min(1),
  occurrence: z.int().min(1).optional().describe("Which match of the quote, when the section repeats it"),
});

export type Citation = z.infer<typeof CitationSchema>;

/** What authors write before `pnpm mrn cite --write` fills in the hash and offsets. */
export const CitationDraftSchema = CitationSchema.partial({ sha256: true, start: true, end: true });

export type CitationDraft = z.infer<typeof CitationDraftSchema>;

/** A section as citations see it: the sha256 and the normalised text. */
export interface CitedSection {
  sha256: string;
  text: string;
}

export type SectionLookup = (source: string, section: string) => CitedSection | undefined;

export type CitationIssueCode = "schema" | "unknown-section" | "stale" | "mismatch" | "not-found" | "ambiguous";

export interface CitationIssue {
  code: CitationIssueCode;
  message: string;
}

/** The normalised text of a section's raw lines, the form citations quote. */
export function citedText(raw: string): string {
  return normalizeText(raw).text;
}

/**
 * Where the normalised `quote` occurs in `text`: the only match, or the `occurrence`-th. Occurrences may overlap
 * (every start position counts).
 */
export function locateQuote(
  text: string,
  quote: string,
  occurrence?: number,
): { start: number; end: number } | { code: "not-found" | "ambiguous"; count: number } {
  const q = normalizeText(quote).text;
  if (q === "") return { code: "not-found", count: 0 };
  const hits: number[] = [];
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) hits.push(i);
  if (occurrence !== undefined) {
    const at = hits[occurrence - 1];
    return at === undefined ? { code: "not-found", count: hits.length } : { start: at, end: at + q.length };
  }
  if (hits.length !== 1) return { code: hits.length === 0 ? "not-found" : "ambiguous", count: hits.length };
  const at = hits[0] ?? 0;
  return { start: at, end: at + q.length };
}

/** Completes a draft from its section: normalised quote, the section's sha256 and the quote's offsets. */
export function resolveCitation(
  draft: CitationDraft,
  section: CitedSection,
): { citation: Citation } | { issue: CitationIssue } {
  const found = locateQuote(section.text, draft.quote, draft.occurrence);
  if ("code" in found) {
    const message =
      found.code === "ambiguous"
        ? `quote occurs ${found.count} times in ${draft.source}/${draft.section}; add "occurrence"`
        : `quote not found in ${draft.source}/${draft.section}${draft.occurrence ? ` (occurrence ${draft.occurrence}, ${found.count} matches)` : ""}`;
    return { issue: { code: found.code, message } };
  }
  const citation: Citation = {
    source: draft.source,
    section: draft.section,
    quote: section.text.slice(found.start, found.end),
    sha256: section.sha256,
    start: found.start,
    end: found.end,
  };
  if (draft.occurrence !== undefined) citation.occurrence = draft.occurrence;
  return { citation };
}

/** The keys of a citation; a data object may carry others (e.g. a criterion's `id`), validated by its own schema. */
export const CITATION_KEYS = ["source", "section", "quote", "sha256", "start", "end", "occurrence"] as const;

/** Only the citation fields of an object that embeds a citation. */
export function citationFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(CITATION_KEYS.filter((k) => k in record).map((k) => [k, record[k]]));
}

/**
 * Problems with a complete citation: its section is gone or changed, or the text at the offsets is not the quote.
 * Only the citation fields are checked (`citationFields`).
 */
export function checkCitation(value: unknown, lookup: SectionLookup): CitationIssue[] {
  const parsed = CitationSchema.safeParse(citationFields(value));
  if (!parsed.success) {
    return [
      { code: "schema", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
    ];
  }
  const c = parsed.data;
  const section = lookup(c.source, c.section);
  if (!section) return [{ code: "unknown-section", message: `no section ${c.source}/${c.section}` }];
  if (section.sha256 !== c.sha256) {
    return [{ code: "stale", message: `${c.source}/${c.section} changed (sha256 ${c.sha256.slice(0, 12)}…)` }];
  }
  const actual = section.text.slice(c.start, c.end);
  if (actual !== c.quote) {
    return [{ code: "mismatch", message: `text at ${c.start}–${c.end} is "${actual.slice(0, 80)}", not the quote` }];
  }
  return [];
}

/** Every citation-shaped object (string `source`, `section` and `quote`) inside a JSON value, with its path. */
export function findCitations(value: unknown, path = "$"): { path: string; value: Record<string, unknown> }[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findCitations(v, `${path}[${i}]`));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.source === "string" && typeof record.section === "string" && typeof record.quote === "string") {
    return [{ path, value: record }];
  }
  return Object.entries(record).flatMap(([k, v]) => findCitations(v, `${path}.${k}`));
}

/** The span of the section's raw (display) text that a citation's normalised offsets came from. */
export function rawSpan(raw: string, citation: Pick<Citation, "start" | "end">): { start: number; end: number } {
  return toOriginal(normalizeText(raw).map, citation.start, citation.end);
}
