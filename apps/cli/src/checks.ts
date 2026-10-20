// Data checks shared by `pnpm mrn check` and the test suite: originals unchanged, extracted text and sections
// reproducible, every citation still verbatim.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, checkCitation, findCitations, type SectionLookup, sliceSections } from "@mrn/core";
import {
  dataJsonFiles,
  originalPath,
  readJson,
  readMeta,
  readOutline,
  readSections,
  readTextLines,
  repoPath,
  sectionLookup,
  sha256OfBytes,
  sourceDir,
  sourceIds,
} from "./data.ts";
import { htmlToLines } from "./sources/html.ts";

export interface Issue {
  where: string;
  message: string;
}

/** Originals match their sha256, text.txt matches its sha256 (and, for XHTML, re-extraction), sections match the outline. */
export function checkSources(ids = sourceIds()): Issue[] {
  const issues: Issue[] = [];
  for (const id of ids) {
    const where = `data/sources/${id}`;
    let meta: ReturnType<typeof readMeta>;
    try {
      meta = readMeta(id);
    } catch (error) {
      issues.push({ where: `${where}/meta.json`, message: String(error) });
      continue;
    }
    const original = readFileSync(originalPath(meta));
    if (sha256OfBytes(original) !== meta.sha256) issues.push({ where, message: "original does not match meta.sha256" });
    if (original.length !== meta.bytes) issues.push({ where, message: "original size does not match meta.bytes" });
    const textPath = join(sourceDir(id), "text.txt");
    if (!existsSync(textPath)) {
      issues.push({ where, message: "no text.txt: run pnpm mrn extract" });
      continue;
    }
    const text = readFileSync(textPath, "utf8");
    if (sha256OfBytes(text) !== meta.extraction.textSha256) {
      issues.push({ where, message: "text.txt does not match meta.extraction.textSha256" });
    }
    if (meta.format === "html" && `${htmlToLines(original.toString("utf8")).join("\n")}\n` !== text) {
      issues.push({ where, message: "text.txt is not what the extractor gives for the original" });
    }
    if (!existsSync(join(sourceDir(id), "outline.json"))) continue;
    const { sections, issues: outlineIssues } = sliceSections(readTextLines(id), readOutline(id));
    for (const i of outlineIssues) issues.push({ where: `${where}/outline.json#${i.section}`, message: i.message });
    if (!existsSync(join(sourceDir(id), "sections.json"))) {
      issues.push({ where, message: "no sections.json: run pnpm mrn sections" });
      continue;
    }
    const file = readSections(id);
    const expected = { source: id, textSha256: meta.extraction.textSha256, sections };
    if (canonicalJson(file) !== canonicalJson(expected)) {
      issues.push({ where: `${where}/sections.json`, message: "stale: run pnpm mrn sections" });
    }
  }
  return issues;
}

/** Every citation in the data files (outside data/sources) is complete and verbatim. */
export function checkCitations(files = dataJsonFiles(), lookup: SectionLookup = sectionLookup()): Issue[] {
  const issues: Issue[] = [];
  for (const file of files) {
    for (const { path, value } of findCitations(readJson(file))) {
      for (const i of checkCitation(value, lookup))
        issues.push({ where: `${repoPath(file)} ${path}`, message: i.message });
    }
  }
  return issues;
}
