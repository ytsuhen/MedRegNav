// Sections of a source document. A source's extracted text (one line per block of the original) is cut into
// sections — an article, an annex, a rule, a guidance section, a table — by line anchors kept as data
// (`data/sources/<id>/outline.json`). Each section keeps its raw lines (readable, with paragraph breaks) and the
// sha256 of its normalised text, which is what citations point at (`citation.ts`).
// Adapted from vlk-engine (packages/core/src/article/document.ts), Apache-2.0, same author: a section is one
// document of its own with its own sha256; there it is the schedule row or the explanation, here any outline entry.
import { z } from "zod";
import { sha256Hex } from "../hash.ts";
import { normalizeText } from "../text/normalize.ts";

export const AnchorSchema = z
  .strictObject({
    line: z.string().min(1).optional().describe("The whole line equals this (both normalised)"),
    startsWith: z.string().min(1).optional().describe("The line starts with this (both normalised)"),
    occurrence: z.int().min(1).optional().describe("Take the n-th matching line (1-based) instead of the only one"),
  })
  .refine((a) => (a.line === undefined) !== (a.startsWith === undefined), "exactly one of line / startsWith");

export type Anchor = z.infer<typeof AnchorSchema>;

export const SECTION_KINDS = [
  "article",
  "annex",
  "chapter",
  "rule",
  "section",
  "table",
  "figure",
  "example",
  "recital",
  "part",
] as const;

export const OutlineSectionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, "lowercase id: letters, digits, dots, dashes"),
  title: z.string().min(1).describe("Human title, in the source's language"),
  kind: z.enum(SECTION_KINDS),
  ref: z.string().min(1).describe("Locator as a lawyer would write it, e.g. 'Article 2', 'Annex VIII, 6.3'"),
  after: AnchorSchema.optional().describe("Search for `start` only below the first line matching this"),
  start: AnchorSchema.describe("First line of the section (included)"),
  end: AnchorSchema.optional().describe("First line after the section (excluded): the first match below `start`"),
  toEnd: z.literal(true).optional().describe("The section runs to the end of the text (instead of `end`)"),
});

export type OutlineSection = z.infer<typeof OutlineSectionSchema>;

export const OutlineSchema = z.strictObject({
  source: z.string().min(1),
  sections: z.array(OutlineSectionSchema).min(1),
});

export type Outline = z.infer<typeof OutlineSchema>;

export interface SourceSection {
  id: string;
  title: string;
  kind: OutlineSection["kind"];
  ref: string;
  /** Line span `[from, to)` in the extracted text. */
  lines: [from: number, to: number];
  /** The section's extracted lines joined with "\n" (display text). */
  raw: string;
  /** sha256 of `normalizeText(raw).text`: what citations of this section point at. */
  sha256: string;
}

export interface OutlineIssue {
  section: string;
  message: string;
}

const norm = (s: string) => normalizeText(s).text;

/** Does an already normalised line match the anchor? */
function matches(normalizedLine: string, anchor: Anchor): boolean {
  if (anchor.line !== undefined) return normalizedLine === norm(anchor.line);
  return anchor.startsWith !== undefined && normalizedLine.startsWith(norm(anchor.startsWith));
}

function describe(anchor: Anchor): string {
  const what = anchor.line !== undefined ? `line "${anchor.line}"` : `line starting "${anchor.startsWith}"`;
  return anchor.occurrence ? `${what} #${anchor.occurrence}` : what;
}

/** Indexes of the (normalised) lines in `[from, lines.length)` matching `anchor`. */
function find(normalized: readonly string[], anchor: Anchor, from: number): number[] {
  const hits: number[] = [];
  for (let i = from; i < normalized.length; i++) if (matches(normalized[i] ?? "", anchor)) hits.push(i);
  return hits;
}

/**
 * Cuts the extracted text into the outline's sections. Anchors match whole normalised lines. Without `after`, a
 * start anchor must match exactly one line (or name its `occurrence`); with `after`, the first match below the
 * `after` line is taken. `end` is the first match below the start line. Problems are returned, not thrown, and
 * such a section is left out.
 */
export function sliceSections(
  lines: readonly string[],
  outline: Outline,
): { sections: SourceSection[]; issues: OutlineIssue[] } {
  const sections: SourceSection[] = [];
  const issues: OutlineIssue[] = [];
  const seen = new Set<string>();
  const normalized = lines.map(norm);
  for (const def of outline.sections) {
    const fail = (message: string) => issues.push({ section: def.id, message });
    if (seen.has(def.id)) {
      fail("duplicate section id");
      continue;
    }
    seen.add(def.id);
    let scope = 0;
    if (def.after) {
      const hits = find(normalized, def.after, 0);
      const at = hits[(def.after.occurrence ?? 1) - 1];
      if (at === undefined) {
        fail(`after: no ${describe(def.after)}`);
        continue;
      }
      scope = at + 1;
    }
    const starts = find(normalized, def.start, scope);
    let startAt: number | undefined;
    if (def.start.occurrence) startAt = starts[def.start.occurrence - 1];
    else if (def.after) startAt = starts[0];
    else if (starts.length > 1) {
      fail(`start: ${describe(def.start)} matches ${starts.length} lines (${starts.join(", ")}); add after/occurrence`);
      continue;
    } else startAt = starts[0];
    if (startAt === undefined) {
      fail(`start: no ${describe(def.start)}`);
      continue;
    }
    let endAt: number | undefined;
    if (def.toEnd && def.end) {
      fail("both end and toEnd");
      continue;
    }
    if (def.toEnd) endAt = lines.length;
    else if (def.end) {
      const ends = find(normalized, def.end, startAt + 1);
      endAt = ends[(def.end.occurrence ?? 1) - 1];
      if (endAt === undefined) {
        fail(`end: no ${describe(def.end)} below line ${startAt}`);
        continue;
      }
    } else {
      fail("neither end nor toEnd");
      continue;
    }
    const raw = lines.slice(startAt, endAt).join("\n");
    const text = norm(raw);
    if (text === "") {
      fail("empty section");
      continue;
    }
    sections.push({
      id: def.id,
      title: def.title,
      kind: def.kind,
      ref: def.ref,
      lines: [startAt, endAt],
      raw,
      sha256: sha256Hex(text),
    });
  }
  return { sections, issues };
}
