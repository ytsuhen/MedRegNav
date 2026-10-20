# Architecture

Living map of the code: packages, public APIs and data formats. Update it together with the code. What the demo does
and why is in [SPEC.md](SPEC.md); decisions and divergences from the brief are in [DECISIONS.md](DECISIONS.md).

## Workspace

| Package | Path | Role | Depends on |
|---|---|---|---|
| `@mrn/core` | `packages/core` | Pure logic, no I/O: text normalisation, hashing, source sections and citations, attribute registry, DeviceIr (schema, validation, three-valued evaluation, decisive unknowns, cross-checks), reference examples | `zod` (dev: `fast-check`) |
| `@mrn/cli` | `apps/cli` | `pnpm mrn …`: owns all file I/O; source extraction, citation pinning, data checks | `@mrn/core`, `parse5` |

Packages export their TypeScript sources directly (`"exports": "./src/index.ts"`); there is no build step for them.
Code runs through `tsx` (CLI) and `vitest` (tests); `tsc --noEmit` only type-checks. CI
(`.github/workflows/verify.yml`) runs `pnpm install --frozen-lockfile` and `pnpm verify` on Node 22.

**No I/O in core.** Biome's `noNodejsModules` is an error for `packages/core/src/**` (and later `apps/web/src/**`), and
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
| `core/src/ir/evaluate.ts` | `evaluateRule(ir, profile, results?, asOf?)`, `evaluateRules(rules, profile, asOf?)`, `ruleOrder`, `withRevision(rules, hypothetical)`, `resultIn`, `possibleWithScope`, `isInForce`, `descendants`, `and3`/`or3`/`not3`; types `RuleResult`, `Results`, `Truth` (adapted from vlk-engine `ir/oracle.ts`) |
| `core/src/ir/validate.ts` | `validateRules(inputs, registry)` → `IrIssue[]`, `irHash(ir)` (adapted from vlk-engine `ir/validate.ts`) |
| `core/src/ir/decisive.ts` | `decisiveUnknowns(registry, profile, signature, candidates)`, `ruleSignature(rules, asOf?)`, `attributesRead(rules)` (idea from vlk-engine `fhir/decisive.ts`) |
| `core/src/ir/crosscheck.ts` | `crossCheck(ir, result, profile)` → `CrossCheckResult` |
| `core/src/examples.ts` | `ExampleSchema`, `ExamplesFileSchema`, `runExample(rules, example, asOf?)` |
| `cli/src/cli.ts` | `runCli(args, out?)` → exit code, `COMMANDS` |
| `cli/src/data.ts` | `REPO_ROOT`, `DATA_DIR`, `SOURCES_DIR`, `sourceIds()`, `readMeta`, `readTextLines`, `readOutline`, `readSections`, `sectionLookup()`, `dataJsonFiles()`, `readJson`, `writeJson` (Biome-formats data files), `sha256OfBytes` |
| `cli/src/sources/html.ts` | `htmlToLines(html)`, `cleanLine(text)` |
| `cli/src/sources/pdf.ts` | `pdftotext(path)`, `pdftotextVersion()`, `cleanPdfText(raw)` → `{ lines, pageStarts }` |
| `cli/src/checks.ts` | `checkSources(ids?)`, `checkCitations(files?, lookup?)` → `Issue[]` (shared by `pnpm mrn check` and the tests) |
| `cli/src/commands/sources.ts` | `extract`, `sections`, `quote` |
| `cli/src/commands/cite.ts` | `cite`, `check` |
| `cli/src/commands/rules.ts` | `rules` (`--rehash`), `evalCommand` (`pnpm mrn eval`) |

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
| `data/rules/<id>.json` | One `DeviceIr` per file: `eu-mdr-qualification`, `eu-mdr-classification`, `eu-mdr-notified-body`, `eu-ai-act-high-risk` (primary), `mdcg-2019-11-table-1` (cross-check). |
| `data/examples/mdcg.json` | Reference examples: `{ id, title, source (citation), also?, profile, expected: [{ rule, outcome }], interpretation, preset }`. |

### DeviceIr

A flat list of nodes plus outcomes, criteria and revision metadata:

- **Gates** `all`, `any`, `not` (one child), `atLeast` (`n` of the children).
- **Leaves** `attr` (`isTrue` on a boolean attribute, `equals` one value, `in` ≥ 2 values) and `result` (`rule`, `in`: the
  other rule's result is surely one of these outcomes).
- Every node has `label`, `prov: { criterionIds, basis }` (`explicit` nodes cite at least one criterion; `structural` nodes
  — negations, glue — may cite none) and `review: { status: draft | reviewed }`.
- `criteria`: citations with an `id`; `outcomes`: `{ id, label, rank, rootId, criterionIds }`; optional `scopeId` (the
  rule applies only where that node holds); `effective: { from, until?, criterionIds }` (required for `primary` rules);
  `role`: `primary` | `cross-check` | `hypothetical` (+ `revises`); optional `crossCheck: { attr, map, criterionIds }`.
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
