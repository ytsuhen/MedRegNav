// @mrn/core: pure logic, no I/O. Callers pass file contents as strings or parsed JSON.
export { base64Utf8, canonicalJson, sha256Hex } from "./hash.ts";
export {
  type Citation,
  type CitationDraft,
  CitationDraftSchema,
  type CitationIssue,
  type CitationIssueCode,
  CitationSchema,
  type CitedSection,
  checkCitation,
  citedText,
  findCitations,
  locateQuote,
  rawSpan,
  resolveCitation,
  type SectionLookup,
} from "./source/citation.ts";
export { pageOfLine, type SourceMeta, SourceMetaSchema } from "./source/meta.ts";
export {
  type Anchor,
  AnchorSchema,
  type Outline,
  type OutlineIssue,
  OutlineSchema,
  type OutlineSection,
  OutlineSectionSchema,
  SECTION_KINDS,
  type SourceSection,
  sliceSections,
} from "./source/outline.ts";
export { type NormalizedText, normalizeText, type OffsetRun, toNormalized, toOriginal } from "./text/normalize.ts";
