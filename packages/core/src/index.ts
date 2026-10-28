// @mrn/core: pure logic, no I/O. Callers pass file contents as strings or parsed JSON.

export {
  type CoverageFailure,
  type CoverageResult,
  type RuleCoverage,
  ruleCoverage,
} from "./analysis/coverage.ts";
export { type Changes, diffRules, type IrDiff } from "./analysis/diff.ts";
export { type McdcLeaf, type McdcPair, mcdcPairs, type RuleMcdc } from "./analysis/mcdc.ts";
export {
  analysisOrder,
  dependencies,
  directAttributes,
  explanationNodes,
  type ResultShape,
  shapeKey,
  standIn,
} from "./analysis/space.ts";
export {
  type ExampleTransition,
  impliedAnswers,
  type TransitionMatrix,
  type WhatIfFile,
  WhatIfFileSchema,
  type WhatIfProposal,
  type WhatIfResult,
  whatIf,
  whatIfIssues,
} from "./analysis/whatif.ts";

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
export {
  type GuidedRun,
  type GuidedStep,
  guidedRun,
  type RunAnswers,
  type StepChanges,
  type StepSource,
  settledLeaves,
  stepChanges,
} from "./guided.ts";
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
export { witnesses } from "./ir/explain.ts";
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
  type Navigation,
  type NavigatorModel,
  navigate,
  nextQuestion,
  outcomeKey,
  type Scenario,
} from "./navigator.ts";
export {
  BRANCHES,
  type Branch,
  type Condition,
  type ConditionResult,
  ConditionSchema,
  conditionAttributes,
  evaluateCondition,
  evaluateObligations,
  type Obligation,
  type ObligationResult,
  ObligationSchema,
  ObligationsFileSchema,
  obligationIssues,
  type Standard,
  StandardSchema,
  StandardsFileSchema,
  timingOf,
} from "./obligations.ts";
export {
  type MarketView,
  MarketViewSchema,
  type ModelledMarket,
  modelledMarket,
  type Presentation,
  PresentationSchema,
  presentationIssues,
} from "./presentation.ts";
export {
  citedSectionKeys,
  type SectionInfo,
  type SectionText,
  type SectionTexts,
  type SourceInfo,
  sectionKey,
  type WebSnapshot,
} from "./snapshot.ts";
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
