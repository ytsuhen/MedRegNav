// PDF → text lines with poppler's pdftotext (DECISIONS D4), then one generic clean-up: running headers and
// footers (lines repeated at the top or bottom of most pages) and bare page numbers are dropped, so a quote can
// run across a page break. Nothing else is changed; footnotes stay where pdftotext puts them.
import { execFileSync, spawnSync } from "node:child_process";
import { normalizeText } from "@mrn/core";

/** How many non-empty lines at the top and at the bottom of a page may be running headers or footers. */
const EDGE = 4;
/** A line is running when it sits in a page edge on at least this share of the pages. */
const RUNNING_SHARE = 0.6;
const PAGE_NUMBER = /^(?:\d{1,3}|Page \d{1,3} of \d{1,3})$/u;

/** poppler's version (pdftotext -v prints it on stderr). */
export function pdftotextVersion(): string {
  const { stdout, stderr } = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
  return /pdftotext version ([\d.]+)/u.exec(`${stdout}${stderr}`)?.[1] ?? "unknown";
}

/** pdftotext's raw output (default reading order, UTF-8, pages separated by form feeds). */
export function pdftotext(path: string): string {
  return execFileSync("pdftotext", ["-enc", "UTF-8", path, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const key = (line: string) => normalizeText(line).text;

function edges(lines: string[]): { top: string[]; bottom: string[] } {
  const filled = lines.map(key).filter((l) => l !== "");
  return { top: filled.slice(0, EDGE), bottom: filled.slice(-EDGE) };
}

/**
 * Cleans pdftotext output page by page and joins the pages. Returns the lines (trailing spaces trimmed, runs of
 * empty lines kept as one) and the first line of every page.
 */
export function cleanPdfText(raw: string): { lines: string[]; pageStarts: number[] } {
  const pages = raw.split("\f");
  if (pages.at(-1)?.trim() === "") pages.pop();
  const pageLines = pages.map((p) => p.split("\n").map((l) => l.replace(/\s+$/u, "")));
  const topCount = new Map<string, number>();
  const bottomCount = new Map<string, number>();
  for (const lines of pageLines) {
    const { top, bottom } = edges(lines);
    for (const l of new Set(top)) topCount.set(l, (topCount.get(l) ?? 0) + 1);
    for (const l of new Set(bottom)) bottomCount.set(l, (bottomCount.get(l) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length * RUNNING_SHARE));
  const header = new Set([...topCount].filter(([, n]) => n >= min).map(([l]) => l));
  const footer = new Set([...bottomCount].filter(([, n]) => n >= min).map(([l]) => l));

  const out: string[] = [];
  const pageStarts: number[] = [];
  for (const lines of pageLines) {
    let from = 0;
    let to = lines.length;
    // Top: running headers among the first EDGE non-empty lines.
    for (let seen = 0; from < to && seen <= EDGE; from++) {
      const l = key(lines[from] ?? "");
      if (l === "") continue;
      seen++;
      if (!header.has(l)) break;
    }
    // Bottom: running footers and at most one page number (these documents number pages at the bottom).
    let pageNumberSeen = false;
    for (let seen = 0; to > from && seen <= EDGE; to--) {
      const l = key(lines[to - 1] ?? "");
      if (l === "") continue;
      seen++;
      if (footer.has(l)) continue;
      if (!pageNumberSeen && PAGE_NUMBER.test(l)) {
        pageNumberSeen = true;
        continue;
      }
      break;
    }
    pageStarts.push(out.length);
    for (const line of lines.slice(from, to)) {
      if (line === "" && (out.length === 0 || out.at(-1) === "")) continue;
      out.push(line);
    }
  }
  while (out.at(-1) === "") out.pop();
  return { lines: out, pageStarts };
}
