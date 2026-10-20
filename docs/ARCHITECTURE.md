# Architecture

Living map of the code: packages, public APIs and data formats. Update it together with the code. What the demo does
and why is in [SPEC.md](SPEC.md); decisions and divergences from the brief are in [DECISIONS.md](DECISIONS.md).

## Workspace

| Package | Path | Role | Depends on |
|---|---|---|---|
| `@mrn/core` | `packages/core` | Pure logic, no I/O: text normalisation, hashing, source sections and citations | `zod` (dev: `fast-check`) |
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
| `cli/src/cli.ts` | `runCli(args, out?)` → exit code, `COMMANDS` |
| `cli/src/data.ts` | `REPO_ROOT`, `DATA_DIR`, `SOURCES_DIR`, `sourceIds()`, `readMeta`, `readTextLines`, `readOutline`, `readSections`, `sectionLookup()`, `dataJsonFiles()`, `readJson`, `writeJson` (Biome-formats data files), `sha256OfBytes` |
| `cli/src/sources/html.ts` | `htmlToLines(html)`, `cleanLine(text)` |
| `cli/src/sources/pdf.ts` | `pdftotext(path)`, `pdftotextVersion()`, `cleanPdfText(raw)` → `{ lines, pageStarts }` |
| `cli/src/checks.ts` | `checkSources(ids?)`, `checkCitations(files?, lookup?)` → `Issue[]` (shared by `pnpm mrn check` and the tests) |
| `cli/src/commands/sources.ts` | `extract`, `sections`, `quote` |
| `cli/src/commands/cite.ts` | `cite`, `check` |

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
