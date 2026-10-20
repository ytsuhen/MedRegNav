// @mrn/core: pure logic, no I/O. Callers pass file contents as strings or parsed JSON.

export {
  ATTRIBUTE_GROUPS,
  type Attribute,
  type AttributeRegistry,
  AttributeRegistrySchema,
  AttributeSchema,
  type AttributeValue,
  domain,
  type Profile,
  profileIssues,
} from "./attributes.ts";
export { type Example, type ExampleRun, ExampleSchema, ExamplesFileSchema, runExample } from "./examples.ts";
export { base64Utf8, canonicalJson, sha256Hex } from "./hash.ts";
export { type CrossCheckResult, crossCheck } from "./ir/crosscheck.ts";
export {
  attributesRead,
  type DecisiveUnknown,
  decisiveUnknowns,
  ruleSignature,
  type Signature,
} from "./ir/decisive.ts";
export {
  and3,
  descendants,
  evaluateRule,
  evaluateRules,
  isInForce,
  not3,
  or3,
  possibleWithScope,
  type Results,
  type RuleResult,
  resultIn,
  ruleOrder,
  type Truth,
  withRevision,
} from "./ir/evaluate.ts";
export {
  type Criterion,
  CriterionSchema,
  type DeviceIr,
  DeviceIrSchema,
  GATE_KINDS,
  type GateNode,
  type IrNode,
  isGate,
  NO_OUTCOME,
  type NodeKind,
  type NodeOf,
  NodeSchema,
  type Outcome,
  OutcomeSchema,
} from "./ir/schema.ts";
export { type IrIssue, type IrIssueCode, irHash, validateRules } from "./ir/validate.ts";
export { IdSchema, IsoDateSchema, LANGS, type Lang, type Text, TextSchema } from "./model/text.ts";
export {
  CITATION_KEYS,
  type Citation,
  type CitationDraft,
  CitationDraftSchema,
  type CitationIssue,
  type CitationIssueCode,
  CitationSchema,
  type CitedSection,
  checkCitation,
  citationFields,
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
