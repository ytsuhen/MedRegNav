# Architecture

Living map of the code: packages, public APIs and data formats. Update it together with the code. What the demo does
and why is in [SPEC.md](SPEC.md); decisions and divergences from the brief are in [DECISIONS.md](DECISIONS.md).

## Workspace

| Package | Path | Role | Depends on |
|---|---|---|---|
| `@mrn/core` | `packages/core` | Pure logic, no I/O: text normalisation, hashing, source sections and citations, attribute registry, DeviceIr (schema, validation, three-valued evaluation, decisive unknowns, cross-checks), reference examples, obligations, the navigator, rule analyses (coverage, MC/DC, what-if) | `zod` (dev: `fast-check`) |
| `@mrn/cli` | `apps/cli` | `pnpm mrn …`: owns all file I/O; source extraction, citation pinning, data checks, the web snapshot | `@mrn/core`, `parse5` |
| `@mrn/web` | `apps/web` | The static SPA: React 19, Vite 8, Tailwind 4, `@xyflow/react` + `d3-hierarchy`; the engine runs in the browser | `@mrn/core` (build: `@mrn/cli` for the snapshot) |

Packages export their TypeScript sources directly (`"exports": "./src/index.ts"`); there is no build step for them.
Code runs through `tsx` (CLI) and `vitest` (tests); `tsc --noEmit` only type-checks. CI
(`.github/workflows/verify.yml`) runs `pnpm install --frozen-lockfile` and `pnpm verify` on Node 22.

**No I/O in core.** Biome's `noNodejsModules` is an error for `packages/core/src/**` and `apps/web/src/**`, and
`packages/core/tsconfig.json` type-checks `src` without `@types/node`. Tests may use Node.

## Module map

| Module | Public API |
|---|---|
| `core/src/hash.ts` | `sha256Hex(text)`, `canonicalJson(value)`, `base64Utf8(text)` (pure, synchronous; adapted from vlk-engine) |
| `core/src/text/normalize.ts` | `normalizeText(raw)` → `{ text, map }`, `toOriginal(map, start, end)`, `toNormalized(map, offset)` (adapted from vlk-engine) |
| `core/src/source/meta.ts` | `SourceMetaSchema`, `pageOfLine(pageStarts, line)`; type `SourceMeta` |
| `core/src/source/outline.ts` | `OutlineSchema`, `OutlineSectionSchema`, `AnchorSchema`, `SECTION_KINDS`, `sliceSections(lines, outline)` → `{ sections, issues }`; types `Outline`, `SourceSection`, `OutlineIssue` (adapted from vlk-engine `article/document.ts`) |
| `core/src/source/citation.ts` | `CitationSchema`, `CitationDraftSchema`, `citedText(raw)`, `locateQuote(text, quote, occurrence?)`, `resolveCitation(draft, section)`, `checkCitation(value, lookup)`, `findCitations(json)`, `rawSpan(raw, citation)`; types `Citation`, `CitationDraft`, `CitedSection`, `SectionLookup`, `CitationIssue` |
| `core/src/model/text.ts` | `TextSchema` (`{ uk, en }`), `IdSchema`, `IsoDateSchema`, `LANGS` |
| `core/src/attributes.ts` | `AttributeSchema`, `AttributeRegistrySchema`, `domain(attribute)`, `profileIssues(registry, profile)`; types `Attribute`, `AttributeRegistry`, `Profile`, `AttributeValue` |
| `core/src/ir/schema.ts` | `DeviceIrSchema`, `NodeSchema`, `OutcomeSchema`, `CriterionSchema`, `isGate`, `GATE_KINDS`, `NO_OUTCOME`; types `DeviceIr`, `IrNode`, `Outcome`, `Criterion` (adapted from vlk-engine `ir/schema.ts`) |
| `core/src/ir/evaluate.ts` | `evaluateRule(ir, profile, results?)`, `evaluateRules(rules, profile, asOf?)`, `ruleOrder`, `withRevision(rules, hypothetical)`, `resultIn`, `possibleWithScope`, `isInForce`, `descendants`, `and3`/`or3`/`not3`; types `RuleResult`, `Results`, `Truth` (adapted from vlk-engine `ir/oracle.ts`) |
| `core/src/ir/validate.ts` | `validateRules(inputs, registry)` → `IrIssue[]`, `irHash(ir)` (adapted from vlk-engine `ir/validate.ts`) |
| `core/src/ir/decisive.ts` | `decisiveUnknowns(registry, profile, signature, candidates, limit?)`, `ruleSignature(rules, asOf?)`, `attributesRead(rules)` (idea from vlk-engine `fhir/decisive.ts`) |
| `core/src/ir/crosscheck.ts` | `crossCheck(ir, result, profile)` → `CrossCheckResult` |
| `core/src/ir/explain.ts` | `witnesses(ir, truth, rootId)` → the node ids that explain a node's value (the same child choices as the attribute support), depth-first |
| `core/src/examples.ts` | `ExampleSchema`, `ExamplesFileSchema`, `runExample(rules, example, asOf?)` |
| `core/src/obligations.ts` | `ObligationSchema`, `ObligationsFileSchema`, `StandardSchema`, `StandardsFileSchema`, `ConditionSchema`, `BRANCHES`, `evaluateCondition`, `evaluateObligations(obligations, profile, results, asOf)`, `timingOf`, `conditionAttributes`, `obligationIssues`; types `Obligation`, `ObligationResult`, `Condition`, `Standard`, `Branch` |
| `core/src/navigator.ts` | `navigate(model, profile, { asOf, proposals? })` → `Navigation` (results, cross-checks, obligations, questions, guidance questions, proposal scenario); `nextQuestion(model, profile, { asOf, skip? })` (the first of those questions, passing over `skip`, without the rest); `outcomeKey(model, profile, asOf)` (what the questions are about, comparable); types `NavigatorModel`, `Scenario` |
| `core/src/guided.ts` | `guidedRun(model, target, { asOf, answers? })` → `{ steps, pending, final }` (DECISIONS U13): from a blank sheet, each step the first question `navigate` asks that the run has not passed, filled from the target or waiting for an answer ("don't know" passes it); a closing step with the target's remaining answers only when they matter together; `stepChanges(before, after)` (rules, obligations and counts a step changed), `settledLeaves(rule, before, after)` (the leaves a step settled, true first); types `GuidedStep`, `GuidedRun`, `StepSource`, `RunAnswers`, `StepChanges` |
| `core/src/presentation.ts` | `PresentationSchema`, `MarketViewSchema`, `presentationIssues(presentation, rules)`, `modelledMarket(presentation, market)`; types `Presentation`, `MarketView`, `ModelledMarket` |
| `core/src/snapshot.ts` | `citedSectionKeys(value)`, `sectionKey(source, section)`; types `WebSnapshot` (with the precomputed `whatIf`), `SourceInfo`, `SectionInfo`, `SectionText`, `SectionTexts` |
| `core/src/analysis/space.ts` | `jointInputs(ir, byId, registry, withUnknown)` → every distinct input a real profile can give a rule (exact); `directAttributes`, `dependencies`, `closure`, `product`, `valuesOf`, `evaluateOn`, `standIn`, `shapeOf`, `shapeKey`, `explanationNodes`, `analysisOrder` |
| `core/src/analysis/coverage.ts` | `ruleCoverage(rules, registry)` → per rule: inputs, profiles covered, distinct results, failures (no outcome or a conflict), leaf counts |
| `core/src/analysis/mcdc.ts` | `mcdcPairs(rules, registry)` → per rule and leaf: `unique` / `masking` / `none` with the deciding pair |
| `core/src/analysis/diff.ts` | `diffRules(from, to)` → nodes, outcomes, criteria added / removed / changed, attributes read |
| `core/src/analysis/whatif.ts` | `WhatIfFileSchema`, `whatIf(rules, registry, proposal, examples)` → diff, cohort transition matrix, examples; `impliedAnswers`, `whatIfIssues` |
| `cli/src/cli.ts` | `runCli(args, out?)` → exit code, `COMMANDS` |
| `cli/src/data.ts` | `REPO_ROOT`, `DATA_DIR`, `SOURCES_DIR`, `sourceIds()`, `readMeta`, `readTextLines`, `readOutline`, `readSections`, `sectionLookup()`, `dataJsonFiles()`, `readJson`, `writeJson` (Biome-formats data files), `sha256OfBytes`; `readRegistry`, `readRules`, `readExamples`, `readObligations`, `readStandards`, `readPresentation`, `readWhatIf`, `readModel` |
| `cli/src/sources/html.ts` | `htmlToLines(html)`, `cleanLine(text)` |
| `cli/src/sources/pdf.ts` | `pdftotext(path)`, `pdftotextVersion()`, `cleanPdfText(raw)` → `{ lines, pageStarts }` |
| `cli/src/checks.ts` | `checkSources(ids?)`, `checkCitations(files?, lookup?)`, `checkRules()`, `checkExamples()`, `checkObligations()`, `checkPresentation()`, `checkWhatIf()` → `Issue[]` (shared by `pnpm mrn check` and the tests) |
| `cli/src/snapshot.ts` | `buildSnapshot()` → `{ snapshot, sections }` (the web build's data); `snapshotCommand` (`pnpm mrn snapshot --out <dir>`) |
| `cli/src/commands/sources.ts` | `extract`, `sections`, `quote` |
| `cli/src/commands/cite.ts` | `cite`, `check` |
| `cli/src/commands/rules.ts` | `rules` (`--rehash`), `evalCommand` (`pnpm mrn eval`) |
| `cli/src/commands/obligations.ts` | `obligationsCommand` (`pnpm mrn obligations`) |
| `cli/src/commands/analysis.ts` | `coverageCommand`, `mcdcCommand`, `whatifCommand` (`pnpm mrn coverage \| mcdc \| whatif`) |

## Sources and citations

### Files of a source

`data/sources/<id>/` (excluded from Biome; everything but `outline.json` is written by tools):

| File | Content |
|---|---|
| `original.html` / `original.pdf` | The official file, byte for byte as downloaded. Never edited. |
| `meta.json` | `SourceMetaSchema`: `id`, `title`, `shortTitle`, `kind` (regulation / guidance / proposal), `format`, `language`, `url` (actual download address), `link` (EUR-Lex or the Commission's guidance page), `retrievedAt`, `sha256` and `bytes` of the original, `edition`, `notes`, `license`, `extraction` (`tool`, `textSha256`, `lines`, PDF `pageStarts`). |
| `text.txt` | Extracted text, one line per block of the original (`pnpm mrn extract <id>`). |
| `outline.json` | Hand-written: which line ranges are citable sections (`OutlineSchema`). |
| `sections.json` | `{ source, textSha256, sections: SourceSection[] }` (`pnpm mrn sections <id>`). |

**Extraction.** XHTML (`htmlToLines`, parse5): every block element (`p`, `div`, `td`, `li`, headings, `br`, …) starts and
ends a line, inline text is concatenated, whitespace collapsed, `head`/`script`/`style` skipped, consolidation markers
removed (`►M1`, `►B`, `►C2`, `▼M3` with the spaces after them, `◄` with the spaces before it, D3). The test suite
re-extracts every XHTML original and compares it with `text.txt`. PDF (`cleanPdfText` over `pdftotext -enc UTF-8`): pages
split at form feeds; a line is a running header (footer) when it is among the first (last) four non-empty lines of at
least 60 % of the pages (and ≥ 3 pages) and sits in the top (bottom) run of a page; one bare page number (`12`, `Page 3 of
27`) is dropped from the bottom of each page; pages are joined without a blank line; `pageStarts` records where each page
begins (D7). PDFs are not re-extracted in CI (D4); `text.txt` is checked against `meta.extraction.textSha256`.

**Sections.** `sliceSections(lines, outline)`: anchors compare whole normalised lines (`line`: equal, `startsWith`:
prefix). Without `after`, a start anchor must match exactly one line or name its `occurrence`; with `after`, the first
match below the `after` line is taken; `end` is the first match below the start (excluded), or `toEnd`. A section keeps
its raw lines (`raw`, joined with `\n`, for display) and `sha256 = sha256Hex(normalizeText(raw).text)`.

### Citation

```ts
{ source: "mdr", section: "annex-viii-rule-11", quote: "All other software is classified as class I.",
  sha256: "<sha256 of the section's normalised text>", start: 764, end: 808, occurrence?: 2 }
```

Offsets are UTF-16 indexes into the section's normalised text (`citedText(raw)`); `quote` is that slice. Any object with
string `source`, `section` and `quote` anywhere in a data JSON file (outside `data/sources/`) is a citation
(`findCitations`) and must pass `checkCitation`: the section exists, its sha256 is unchanged (else `stale`) and the text at
the offsets is the quote (else `mismatch`). `rawSpan(raw, citation)` maps the offsets back into the display text.

### Authoring workflow

1. Download the original into `data/sources/<id>/original.<ext>`; write `meta.json` (without `extraction`).
2. `pnpm mrn extract <id>` → `text.txt` and `meta.extraction`.
3. Write `outline.json`; `pnpm mrn sections <id>` → `sections.json` (problems are printed, exit 1).
4. In a data file, write `{ "source", "section", "quote" }` (find the text with `pnpm mrn quote <id>/<section> --find …`).
5. `pnpm mrn cite --write` normalises each quote, finds it (unique, or `occurrence`) and adds `sha256`, `start`, `end`;
   after an outline change it re-pins stale citations whose quote is still there.
6. `pnpm mrn check` / `pnpm verify`.

## Rules

### Data

| File | Content |
|---|---|
| `data/attributes.json` | The attribute registry: `{ id, type: boolean \| enum, values?, group, label, question, help, citations }` (all text `{ uk, en }`). Rules may read only these attributes. |
| `data/rules/<id>.json` | One `DeviceIr` per file: `eu-mdr-qualification`, `eu-mdr-classification`, `eu-mdr-notified-body`, `eu-ai-act-high-risk` (primary), `mdcg-2019-11-table-1` (cross-check), `eu-mdr-classification-com-2025-1023` (hypothetical: Rule 11 as COM(2025) 1023 would replace it, DECISIONS I9, I10). |
| `data/examples/mdcg.json` | Reference examples: `{ id, title, source (citation), also?, profile, expected: [{ rule, outcome }], interpretation, preset }`. |
| `data/whatif.json` | The proposed revisions to compare (see Analyses). |

### DeviceIr

A flat list of nodes plus outcomes, criteria and revision metadata:

- **Gates** `all`, `any`, `not` (one child), `atLeast` (`n` of the children).
- **Leaves** `attr` (`isTrue` on a boolean attribute, `equals` one value, `in` ≥ 2 values) and `result` (`rule`, `in`: the
  other rule's result is surely one of these outcomes).
- Every node has `label`, `prov: { criterionIds, basis }` (`explicit` nodes cite at least one criterion; `structural` nodes
  — negations, glue — may cite none) and `review: { status: draft | reviewed }`.
- `criteria`: citations with an `id`; `outcomes`: `{ id, label, rank, rootId, criterionIds }`; optional `scopeId` (the
  rule applies only where that node holds); `effective: { from, until?, criterionIds }` (required for `primary` rules);
  `role`: `primary` | `cross-check` | `hypothetical` (+ `revises`: a revision keeps every outcome of the rule it
  revises, because other rules read them); optional `crossCheck: { attr, map, criterionIds }`.
- `resolution`: `highest-rank` — the strictest true outcome wins (Annex VIII 3.5), and every unknown outcome ranked above
  it stays possible; `exclusive` — outcomes cannot overlap (two true outcomes = `conflict`).
- `metadata`: `authoredBy: manual-reference`, `revision`, `parentRevision`, `status: draft | reviewed | approved`,
  `approval`, `irHash` = sha256 of the canonical JSON with `irHash` blanked (`pnpm mrn rules --rehash`).

### Evaluation

`evaluateRules(rules, profile, asOf?)` evaluates in dependency order (`ruleOrder`, rules read by `result` leaves first).
Kleene logic: an unknown attribute is `null`; `all` is false if any child is false, null if any is null, else true; `any`
dually; `not` keeps null; `atLeast` is true at `n` trues, false when `n` is out of reach. A `result` leaf is true when every
possibility of the read rule (`possibleWithScope`: its possible outcomes, plus `$none` when its scope is null, or only
`$none` when the scope is false) is in `in`, false when none is, else null. `RuleResult`: `scope`, node and outcome truth,
`possible` (strictest first), `value` (single outcome when determined), `status` (`determined`, `undetermined`,
`not-applicable`, `conflict`), `inForce` (as-of date within `effective`; a hypothetical rule never), `support` and
`nodeSupport`: the attributes that explain a value — `all`: true → every child, false → the first false child; `any` dually;
null → the null children; a `result` leaf carries the read rule's support; a rule's support is its scope (when not true),
its possible outcomes' roots and the false outcomes ranked above them.

**Decisive unknowns** (`decisiveUnknowns`): an unknown attribute is decisive when some value of it changes the signature
(`ruleSignature`: per rule, scope and possible outcomes); candidates in reading order (`attributesRead`: rules in
dependency order, nodes in file order). They are the questions the UI asks.

**Soundness** is a property test on the real rules: for random partial profiles and random completions, the completed
profile's possibilities are a subset of the partial one's and every node already decided keeps its value; every complete
profile gives each rule `determined` or `not-applicable`, never `conflict`.

## Obligations

`data/obligations/eu.json` (`ObligationsFileSchema`): `{ market, obligations }`; each obligation:

| Field | Meaning |
|---|---|
| `id`, `branch` | One of the six branches: `class`, `market`, `qms`, `clinical`, `cyber`, `ai` |
| `title`, `summary` | The requirement and what it means for software — our words, `{ uk, en }` |
| `when` | A condition: `{ all: [...] }`, `{ any: [...] }`, `{ not }`, `{ attr, isTrue }`, `{ attr, equals }`, `{ attr, in }`, `{ result: <rule>, in: [outcomes] }`, `{ always: true }` — the same Kleene logic and support as rule nodes |
| `effective` | `{ from, until?, citations }` — every date is cited (MDR Art. 123, AI Act Art. 113, the Commission's EUDAMED notice) |
| `how` | `{ deliverable, standards: [ids in data/standards.json], who }` — the "how to comply" card |
| `citations`, `guidance?` | The legal basis and supporting guidance, verbatim |

`evaluateObligations` gives per obligation `applies` (true / false / null = depends on an unknown answer), `timing`
relative to the as-of date (`in-force`, `upcoming`, `expired`) and `support`. `data/standards.json`: `{ id, number, edition,
title, purpose, link, checkedAt, note? }` — catalogue metadata only, never text of a standard.

## Navigator

`navigate(model, profile, { asOf, proposals })` is the single entry point of the UI: it evaluates the rules in force
(primary and cross-check), the cross-checks and the obligations; `questions` are the decisive unknowns for the primary
rules and the obligations (signature: per primary rule scope + possible outcomes, per obligation `applies`), candidates in
reading order (rule attributes, then obligation attributes); `guidanceQuestions` are those that only the cross-check rules
need. With `proposals`, every hypothetical rule replaces the rule it revises (`withRevision`) and the same scenario is
evaluated again (`proposal`).

## Analyses

`packages/core/src/analysis` (DECISIONS A3), printed by `pnpm mrn coverage | mcdc | whatif`, tested on synthetic rules
(`packages/core/test/analysis`) and on the real ones (`apps/cli/test/analysis.test.ts`, which also pins the numbers that
SPEC §6 and the README quote).

- **Input space** (`jointInputs`): a rule depends on a profile only through the attributes its nodes read and the
  results (scope and possible outcomes) of the rules it reads. Those rules are evaluated in dependency order on joint
  states that keep only what later rules still need, so correlations through shared attributes survive and the inputs
  are exactly the ones a real profile can give (a test compares them with brute force over every profile). `profiles`
  says how many profiles over every attribute involved (with "unknown") the inputs stand for.
- **Coverage** (`ruleCoverage`): every rule on every input, "unknown" included. A failure is an input with no possible
  outcome or with two exclusive outcomes true (`conflict`); the M5 criterion is that there is none.
- **MC/DC** (`mcdcPairs`): complete inputs only. Per leaf, a pair that differs only in what the leaf reads (and in the
  results of the rules derived from it) where the leaf flips and the outcome changes: `unique` (no other leaf changes),
  `masking` (other leaves change, but the leaf is in the explanation of both outcomes) or `none` (reported, not forced).
- **What if** (`whatIf`): the revision in place of the rule it revises (`withRevision`). The cohort is every complete
  combination of the answers either version reads, the base example's other answers kept, without the combinations a
  guidance cross-check contradicts or a coherence constraint excludes. A situation is the pair of results with the
  answers that decide them (the `support` of each: a certificate, since answers outside it cannot change the result);
  combinations that differ only in other answers are one situation. The matrix counts situations, per outcome in force,
  the outcome under the proposal (`up` / `down` by rank). The reference examples are compared too, with the answers the
  constraints imply filled in (`impliedAnswers`).

`data/whatif.json` (`WhatIfFileSchema`):

```json
{ "proposals": [{ "revision": "<hypothetical rule>", "base": "<reference example>",
  "constraints": [{ "when": <condition>, "require": <condition>, "why": { "uk", "en" }, "citations": [...] }] }] }
```

`base` must be covered by the revised rule (`pnpm mrn check`, "what-if"); a constraint says that when `when` holds,
`require` must hold too (the condition language of obligations), with our reason and verbatim citations. The web
snapshot carries the file and the precomputed results (`snapshot.whatIf`), so the browser does not recompute the cohort.

## Presentation

`data/navigator.json` (`PresentationSchema`): `{ markets: [...] }`. A modelled market names the rule whose result is the
device node's qualification line (`device.qualification`), the rule whose outcomes form the class ladder
(`device.ladder`; outcome ids are shown as the class names) and, for each of the six branches in display order (the first
half on the left), the rules whose results sit on it next to the branch's obligations. A market with
`"status": "next-stage"` (the US) gets a placeholder. `presentationIssues` checks that every non-hypothetical rule of a
market stands on exactly one branch.

## Web app

`apps/web` is a static SPA; the engine (`@mrn/core`) runs in the browser, nothing is sent anywhere.

| Module | Role |
|---|---|
| `vite.config.ts` | `webConfig({ outDir? })`; plugin `mrnData()` serves `virtual:mrn/snapshot` (the model, presentation, examples, sources' metadata, cited sections' locators) and `virtual:mrn/sections` (the cited sections' texts, a lazy chunk) from `buildSnapshot()`; in development a change under `data/` reloads the page. `base: "./"`: the build works under any sub-path |
| `src/state.tsx` | `AppProvider` / `useApp()`: language, market, view, as-of date, answers, example, expanded branch, card selection, proposals, attribute editor, hover; mirrored in the URL hash |
| `src/lib/route.ts` | `encodeRoute`, `parseRoute`, `encodeProfile`, `parseProfile`: `#m=EU&v=map&d=…&x=<example>&p=attr.value_…&b=<branch>&s=o.<obligation>\|r.<rule>\|x&w=1&l=en` |
| `src/data.tsx` | `DataProvider`, `useSnapshot()`, `useSections()` (lazy), `useScreen()`: `navigate()` + `buildView()` memoised per state |
| `src/lib/view.ts` | `buildView(snapshot, market, navigation, profile)` → `ScreenView`: device (qualification, ladder steps value/possible/excluded, the proposal's steps and questions), branches (state open / in-force / upcoming / none, leaves, counts, support, questions — each question once on the map — and how many leaves the proposal changes), leaves (with `proposal`: a rule's outcomes or an obligation's state under the proposal, when different), chips (shown / folded / needed only for the proposal), leaves by key |
| `src/lib/layout.ts` | `layoutMap(input)` → positions: device centred, branches by side, the expanded branch's leaves beyond it; `d3-hierarchy` tidy trees per side with measured heights |
| `src/lib/quotes.ts` | `verifyQuote`, `sectionSha256`, `quoteView(citation, section, context, format)` (window + display reflow), `reflow`, `hostOf` |
| `src/lib/dates.ts` | `todayIso`, `toDays` / `fromDays`, `formatDate(iso, lang)`, `keyDates(model)`, `sliderRange` |
| `src/components/MapView.tsx` | React Flow canvas: device node (label with the class ladder and its first question), branch nodes (inline question), leaf nodes, ink edges (solid / dashed / dotted, marker underlay on hover); with proposals on, the red pen (`data-proposal`); viewport fitted to the width |
| `src/components/DeviceChips.tsx` | Preset picker, attribute chips by group (answered, decisive unknown, folded rest), the attribute editor with the concept's quote |
| `src/components/Card.tsx` | The margin note: obligation (how to comply, depends on, legal basis, guidance), rule (result, questions, what decided it, why not stricter, and with proposals on the proposal's section), device (the example's quote and our reading, the map's legend) |
| `src/components/Proposal.tsx` | `ProposalSection` ("if the proposal were adopted": result and what decided it under the revision, changed requirements, the cohort's transition matrix with its coherence conditions, the MDCG examples; heading level and folding set by the host), `proposalWords(leaf, t, lang)` |
| `src/components/Questions.tsx` | `useAsk` (open an attribute's editor), `QuestionList`, `SupportList` (shared by the card, the proposal section, the map) |
| `src/components/Checklist.tsx` | The same content as a document: rule results, open questions with inline answers, each branch's obligations; with proposals on, the same red-pen lines and the proposal's section |
| `src/components/Explain.tsx`, `Quote.tsx`, `Shell.tsx`, `ui.tsx` | Witness lists (heading level set by the host); quotes with context and the browser's check (the hash and offsets in mono); banner, masthead (the sea band with the waves; market, as-of slider with key dates, proposals, view, language), next-stage placeholder, footer; shared controls, the device's name and `rich` (a message with elements in its placeholders) |
| `src/lib/waves.ts` | `startWaves(canvas, host, "webgl2" \| "2d")` → `{ renderer, light(x, y, reach), stop() }`: the masthead's hexagon field (DECISIONS U12; adapted from ytsuhen/Pub-demos first-visit), idle off screen and in a hidden tab, one static frame under reduced motion |
| `src/lib/sheen.ts` | `sheen(el)` (the iridescent layer over an element, following it while it moves, and a light on the waves), `sheenKeys(keys)` (every `[data-flash]` with one of the keys), `installSheen(document)` (a delegated click listener), `setLightSink`, `reducedMotion` |
| `src/components/Waves.tsx` | `HexWaves`: the canvas behind the masthead; WebGL2 first, a fresh canvas for the 2D painter when it fails; registers the waves' light with the sheen |
| `src/i18n/dict.ts` | Every UI string in Ukrainian and English, with plural forms |

Tests: `apps/web/test` (vitest; components under happy-dom) — view model (proposals included), layout (no overlap,
property-based), route, dates, every citation verified and marked in the browser's form, i18n (same keys, no Cyrillic in
components, the banner word for word), the app and the map in a DOM, the proposals switch, the class card's proposal
section and the checklist's red pen. `apps/web/e2e` (`pnpm e2e`, not in `verify`): the static build served under
`/MedRegNav/` in a preinstalled Chromium — offline, no console errors, inline answers, verified quotes, the as-of step
into 2 August 2028, the proposals switch, the checklist, a phone viewport; `design.e2e.ts` checks the look (U12): the
three fonts, the waves on a 2D canvas and in WebGL2 (a software one allowed by `__wavesAnyGL`), the sheen and its absence
under reduced motion, every map label inside its node at 1440 and 390 px; `screens.e2e.ts` writes the README's
screenshots (`MRN_DOCS_SCREENS=docs/screens pnpm e2e apps/web/e2e/screens.e2e.ts`). Chromium is found through
`MRN_CHROMIUM`, else `PLAYWRIGHT_BROWSERS_PATH` (`chromium-*/chrome-linux*/chrome`), else `/opt/pw-browsers`; it is never
downloaded by the tests. `e2e/peek.ts` is a developer aid, not a test: `pnpm build:web && pnpm exec tsx
apps/web/e2e/peek.ts <outDir> 1440x900 '<hash>'…` saves screenshots of URL states (`PEEK_DARK=1`, `PEEK_FULL=0`,
`PEEK_SCALE=2`).
