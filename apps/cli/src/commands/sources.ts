// `pnpm mrn extract | sections | quote`: the source pipeline and the quote viewer.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { citedText, locateQuote, pageOfLine, rawSpan, SourceMetaSchema, sliceSections } from "@mrn/core";
import type { Out } from "../cli.ts";
import {
  originalPath,
  REPO_ROOT,
  readJson,
  readMeta,
  readOutline,
  readSections,
  readTextLines,
  sha256OfBytes,
  sourceDir,
  sourceIds,
  writeJson,
} from "../data.ts";
import { htmlToLines } from "../sources/html.ts";
import { cleanPdfText, pdftotext, pdftotextVersion } from "../sources/pdf.ts";

/** The exact (save-exact) parse5 version this CLI depends on. */
const parse5Version = () =>
  (readJson(join(REPO_ROOT, "apps/cli/package.json")) as { dependencies: Record<string, string> }).dependencies.parse5;

function ids(args: string[]): string[] {
  return args.includes("--all") || args.length === 0 ? sourceIds() : args.filter((a) => !a.startsWith("--"));
}

/** Extracts text.txt from the original and records it in meta.json (`extraction`). */
export async function extract(args: string[], out: Out): Promise<number> {
  for (const id of ids(args)) {
    const metaPath = join(sourceDir(id), "meta.json");
    const meta = SourceMetaSchema.partial({ extraction: true }).parse(readJson(metaPath));
    const path = originalPath(meta);
    let lines: string[];
    let tool: string;
    let pageStarts: number[] | undefined;
    if (meta.format === "html") {
      lines = htmlToLines(readFileSync(path, "utf8"));
      tool = `parse5 ${parse5Version()} + htmlToLines`;
    } else {
      ({ lines, pageStarts } = cleanPdfText(pdftotext(path)));
      tool = `pdftotext ${pdftotextVersion()} (poppler) + cleanPdfText`;
    }
    const text = `${lines.join("\n")}\n`;
    writeFileSync(join(sourceDir(id), "text.txt"), text);
    const extraction = {
      tool,
      textSha256: sha256OfBytes(text),
      lines: lines.length,
      ...(pageStarts && { pageStarts }),
    };
    writeJson(metaPath, SourceMetaSchema.parse({ ...meta, extraction }));
    out.write(`${id}: ${lines.length} lines (${tool})\n`);
  }
  return 0;
}

/** Cuts text.txt into the outline's sections → sections.json. */
export async function sections(args: string[], out: Out): Promise<number> {
  let failed = false;
  for (const id of ids(args)) {
    if (!existsSync(join(sourceDir(id), "outline.json"))) {
      out.write(`${id}: no outline.json, skipped\n`);
      continue;
    }
    const meta = readMeta(id);
    const result = sliceSections(readTextLines(id), readOutline(id));
    for (const i of result.issues) out.write(`${id}/${i.section}: ${i.message}\n`);
    if (result.issues.length > 0) failed = true;
    writeJson(join(sourceDir(id), "sections.json"), {
      source: id,
      textSha256: meta.extraction.textSha256,
      sections: result.sections,
    });
    out.write(`${id}: ${result.sections.length} sections\n`);
  }
  return failed ? 1 : 0;
}

const MARK = (s: string) => `\u001b[7m${s}\u001b[0m`;

/**
 * Prints a section with its location; `--find <text>` highlights a quote (and prints its offsets), `--at a:b`
 * highlights normalised offsets, `--list` lists the source's sections.
 */
export async function quote(args: string[], out: Out): Promise<number> {
  const [target, ...rest] = args;
  const [sourceId, sectionId] = (target ?? "").split("/");
  if (!sourceId) {
    out.write("usage: pnpm mrn quote <source>[/<section>] [--find <text> | --at <start>:<end>] [--list]\n");
    return 2;
  }
  const meta = readMeta(sourceId);
  const file = readSections(sourceId);
  if (!sectionId || rest.includes("--list")) {
    for (const s of file.sections) out.write(`${s.id.padEnd(28)} ${s.ref} — ${s.title}\n`);
    return 0;
  }
  const section = file.sections.find((s) => s.id === sectionId);
  if (!section) {
    out.write(`no section ${sourceId}/${sectionId}\n`);
    return 1;
  }
  const pages = meta.extraction.pageStarts;
  const where = pages ? `, p. ${pageOfLine(pages, section.lines[0])}–${pageOfLine(pages, section.lines[1] - 1)}` : "";
  out.write(`${meta.shortTitle} · ${section.ref} — ${section.title}\n`);
  out.write(`lines ${section.lines[0]}–${section.lines[1]}${where} · sha256 ${section.sha256}\n\n`);
  let span: { start: number; end: number } | undefined;
  const find = rest.indexOf("--find");
  const at = rest.indexOf("--at");
  if (find >= 0) {
    const found = locateQuote(citedText(section.raw), rest.slice(find + 1).join(" "));
    if ("code" in found) {
      out.write(`quote ${found.code} (${found.count} matches)\n`);
      return 1;
    }
    out.write(`start ${found.start} end ${found.end}\n\n`);
    span = rawSpan(section.raw, found);
  } else if (at >= 0) {
    const [a, b] = (rest[at + 1] ?? "").split(":").map(Number);
    if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return 2;
    span = rawSpan(section.raw, { start: a, end: b });
  }
  const raw = section.raw;
  out.write(
    span ? `${raw.slice(0, span.start)}${MARK(raw.slice(span.start, span.end))}${raw.slice(span.end)}\n` : `${raw}\n`,
  );
  return 0;
}
