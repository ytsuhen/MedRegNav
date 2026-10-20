# Architecture

Living map of the code: packages, public APIs and data formats. Update it together with the code. What the demo does
and why is in [SPEC.md](SPEC.md); decisions and divergences from the brief are in [DECISIONS.md](DECISIONS.md).

## Workspace

| Package | Path | Role |
|---|---|---|
| `@mrn/core` | `packages/core` | Pure logic, no I/O (Biome `noNodejsModules`, no `@types/node` for `src`): text normalisation, hashing |
| `@mrn/cli` | `apps/cli` | `pnpm mrn …`: owns all file I/O |

Packages export their TypeScript sources directly (`"exports": "./src/index.ts"`); there is no build step for them.
Code runs through `tsx` (CLI) and `vitest` (tests); `tsc --noEmit` only type-checks.

## Module map

| Module | Public API |
|---|---|
| `core/src/hash.ts` | `sha256Hex(text)`, `canonicalJson(value)`, `base64Utf8(text)` (pure, synchronous; adapted from vlk-engine) |
| `core/src/text/normalize.ts` | `normalizeText(raw)` → `{ text, map }`, `toOriginal(map, start, end)`, `toNormalized(map, offset)` (adapted from vlk-engine) |
| `cli/src/cli.ts` | `runCli(args, out?)` → exit code, `COMMANDS` |
