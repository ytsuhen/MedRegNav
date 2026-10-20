// `pnpm mrn cite [--write] [files…]`: completes and re-pins citations in the data files from their quotes;
// `pnpm mrn check`: every data check (sources, sections, citations, and later rules and obligations).
import { resolve } from "node:path";
import {
  CITATION_KEYS,
  CitationDraftSchema,
  checkCitation,
  citationFields,
  findCitations,
  resolveCitation,
} from "@mrn/core";
import { checkCitations, checkExamples, checkRules, checkSources, type Issue } from "../checks.ts";
import type { Out } from "../cli.ts";
import { dataJsonFiles, readJson, repoPath, sectionLookup, writeJson } from "../data.ts";

export async function cite(args: string[], out: Out): Promise<number> {
  const write = args.includes("--write");
  const files = args.filter((a) => !a.startsWith("--")).map((f) => resolve(f));
  const lookup = sectionLookup();
  let fixed = 0;
  let ok = 0;
  let failed = 0;
  for (const file of files.length > 0 ? files : dataJsonFiles()) {
    const json = readJson(file);
    let changed = false;
    for (const { path, value } of findCitations(json)) {
      if (checkCitation(value, lookup).length === 0) {
        ok++;
        continue;
      }
      const draft = CitationDraftSchema.safeParse(citationFields(value));
      const section = draft.success ? lookup(draft.data.source, draft.data.section) : undefined;
      const result = draft.success && section ? resolveCitation(draft.data, section) : undefined;
      if (!result || "issue" in result) {
        failed++;
        const why = !draft.success
          ? draft.error.issues.map((i) => i.message).join("; ")
          : !section
            ? `no section ${draft.data.source}/${draft.data.section}`
            : result && "issue" in result
              ? result.issue.message
              : "";
        out.write(`${repoPath(file)} ${path}: ${why}\n`);
        continue;
      }
      fixed++;
      if (write) {
        // Rewrite in place with a stable key order: id (if any), the citation, then any other keys.
        const { id, ...others } = value;
        const rest = Object.fromEntries(
          Object.entries(others).filter(([k]) => !(CITATION_KEYS as readonly string[]).includes(k)),
        );
        for (const k of Object.keys(value)) delete value[k];
        Object.assign(value, id === undefined ? {} : { id }, result.citation, rest);
        changed = true;
      } else out.write(`${repoPath(file)} ${path}: needs --write (${draft.data?.quote.slice(0, 60)}…)\n`);
    }
    if (changed) writeJson(file, json);
  }
  out.write(`citations: ${ok} ok, ${fixed} ${write ? "pinned" : "to pin"}, ${failed} failed\n`);
  return failed > 0 || (!write && fixed > 0) ? 1 : 0;
}

/** Runs every data check; the same functions run in the test suite. */
export async function check(_args: string[], out: Out): Promise<number> {
  const groups: [string, () => Issue[]][] = [
    ["sources", () => checkSources()],
    ["citations", () => checkCitations()],
    ["rules", () => checkRules()],
    ["examples", () => checkExamples()],
  ];
  let total = 0;
  for (const [name, run] of groups) {
    const issues = run();
    total += issues.length;
    out.write(`${name}: ${issues.length === 0 ? "ok" : `${issues.length} issue(s)`}\n`);
    for (const i of issues) out.write(`  ${i.where}: ${i.message}\n`);
  }
  return total > 0 ? 1 : 0;
}
