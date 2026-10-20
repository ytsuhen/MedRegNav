// @mrn/core: pure logic, no I/O. Callers pass file contents as strings or parsed JSON.
export { base64Utf8, canonicalJson, sha256Hex } from "./hash.ts";
export { type NormalizedText, normalizeText, type OffsetRun, toNormalized, toOriginal } from "./text/normalize.ts";
