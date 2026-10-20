// `data/sources/<id>/meta.json`: where an original came from, when, its sha256 and edition, and how its text was
// extracted. The original file itself is never edited.
import { z } from "zod";

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex sha256");

export const SourceMetaSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  shortTitle: z.string().min(1).describe("How the UI names the source, e.g. 'MDR', 'MDCG 2019-11 rev.1'"),
  kind: z.enum(["regulation", "guidance", "proposal"]),
  format: z.enum(["html", "pdf"]),
  language: z.literal("en"),
  url: z.url().describe("The address the original was downloaded from"),
  link: z.url().describe("Where a person reads the document (EUR-Lex, the Commission's guidance page)"),
  retrievedAt: z.iso.datetime(),
  sha256: Sha256.describe("sha256 of the original file's bytes"),
  bytes: z.int().min(1),
  edition: z.string().min(1),
  notes: z.string(),
  license: z.string().min(1),
  extraction: z.strictObject({
    tool: z.string().min(1),
    textSha256: Sha256.describe("sha256 of text.txt (UTF-8)"),
    lines: z.int().min(1),
    pageStarts: z.array(z.int().min(0)).optional().describe("PDF: first line of every page in text.txt"),
  }),
});

export type SourceMeta = z.infer<typeof SourceMetaSchema>;

/** The PDF page (1-based) that holds a line of text.txt. */
export function pageOfLine(pageStarts: readonly number[], line: number): number {
  let page = 1;
  pageStarts.forEach((start, i) => {
    if (start <= line) page = i + 1;
  });
  return page;
}
