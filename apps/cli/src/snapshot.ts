// The web app's data, built from data/: the model, the presentation, the reference examples, the sources' metadata
// and the texts of the cited sections only. The web build calls buildSnapshot() through its Vite plugin
// (apps/web/vite.config.ts); `pnpm mrn snapshot --out <dir>` writes the same two files for inspection.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { citedSectionKeys, type SectionTexts, type SourceInfo, sectionKey, type WebSnapshot, whatIf } from "@mrn/core";
import type { Out } from "./cli.ts";
import {
  REPO_ROOT,
  readExamples,
  readMeta,
  readModel,
  readPresentation,
  readSections,
  readWhatIf,
  sourceIds,
} from "./data.ts";

export interface BuiltSnapshot {
  snapshot: WebSnapshot;
  sections: SectionTexts;
}

export function buildSnapshot(): BuiltSnapshot {
  const model = readModel();
  const presentation = readPresentation();
  const examples = readExamples();
  const file = readWhatIf();
  const results = file.proposals.map((p) => whatIf(model.rules, model.registry, p, examples));
  const keys = new Set(citedSectionKeys({ model, examples, file }));
  const sources: Record<string, SourceInfo> = {};
  const index: WebSnapshot["sections"] = {};
  const sections: SectionTexts = {};
  for (const id of sourceIds()) {
    const meta = readMeta(id);
    const cited = readSections(id).sections.filter((s) => keys.has(sectionKey(id, s.id)));
    if (cited.length === 0) continue;
    const { title, shortTitle, kind, format, link, edition, retrievedAt, license } = meta;
    sources[id] = { id, title, shortTitle, kind, format, link, edition, retrievedAt, license };
    for (const s of cited) {
      index[sectionKey(id, s.id)] = { ref: s.ref, title: s.title };
      sections[sectionKey(id, s.id)] = { raw: s.raw, sha256: s.sha256 };
    }
  }
  const missing = [...keys].filter((k) => !(k in sections));
  if (missing.length > 0) throw new Error(`cited sections not found: ${missing.join(", ")}`);
  return { snapshot: { model, presentation, examples, whatIf: { file, results }, sources, sections: index }, sections };
}

/** `snapshot [--out <dir>]`: writes snapshot.json and sections.json (default apps/web/dist-snapshot). */
export async function snapshotCommand(args: string[], out: Out): Promise<number> {
  const at = args.indexOf("--out");
  const dir = resolve(at >= 0 && args[at + 1] ? (args[at + 1] as string) : join(REPO_ROOT, "apps/web/dist-snapshot"));
  const { snapshot, sections } = buildSnapshot();
  mkdirSync(dir, { recursive: true });
  const files: [string, unknown][] = [
    ["snapshot.json", snapshot],
    ["sections.json", sections],
  ];
  for (const [name, value] of files) {
    const text = `${JSON.stringify(value)}\n`;
    writeFileSync(join(dir, name), text);
    out.write(`${join(dir, name)}: ${(Buffer.byteLength(text) / 1024).toFixed(1)} KiB\n`);
  }
  out.write(
    `rules ${snapshot.model.rules.length}, obligations ${snapshot.model.obligations.length}, examples ${snapshot.examples.length}, cited sections ${Object.keys(sections).length}\n`,
  );
  return 0;
}
