// What the static web app is built from (`pnpm mrn snapshot`, or the web build itself): the navigator model, its
// presentation, the reference examples (presets), the sources' metadata and, for every cited section, its locator.
// The cited sections' texts travel separately and load on demand, so the first screen does not wait for them; the
// browser re-checks every quote against the section's sha256 before showing it.
import type { Example } from "./examples.ts";
import type { NavigatorModel } from "./navigator.ts";
import type { Presentation } from "./presentation.ts";
import { findCitations } from "./source/citation.ts";
import type { SourceMeta } from "./source/meta.ts";

export type SourceInfo = Pick<
  SourceMeta,
  "id" | "title" | "shortTitle" | "kind" | "format" | "link" | "edition" | "retrievedAt" | "license"
>;

export interface SectionInfo {
  ref: string;
  title: string;
}

export interface WebSnapshot {
  model: NavigatorModel;
  presentation: Presentation;
  examples: Example[];
  sources: Record<string, SourceInfo>;
  /** Cited sections by `sectionKey`. */
  sections: Record<string, SectionInfo>;
}

/** A cited section's display text (raw lines) and the sha256 its citations point at. */
export interface SectionText {
  raw: string;
  sha256: string;
}

export type SectionTexts = Record<string, SectionText>;

export const sectionKey = (source: string, section: string) => `${source}/${section}`;

/** Keys of every section cited anywhere in `value` (sorted, unique). */
export function citedSectionKeys(value: unknown): string[] {
  const keys = new Set(findCitations(value).map(({ value: c }) => sectionKey(String(c.source), String(c.section))));
  return [...keys].sort();
}
