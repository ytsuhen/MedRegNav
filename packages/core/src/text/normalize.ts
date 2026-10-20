// Adapted from vlk-engine (packages/core/src/article/normalize.ts), Apache-2.0, same author.
// Text normalisation: a source section (article, annex, rule, guidance page) in one canonical form, so the same
// text gives the same text — and the same sha256 that criteria point at — however it was copied, plus an
// offset map from the normalised text back to the input.

/**
 * `[normStart, normEnd, origStart, origEnd]`: a run of the normalised text and the part of the input it came
 * from. The runs cover both texts in order, without gaps. In a run of equal lengths every position maps to
 * the same position of the input (unchanged or one-for-one replaced characters); other runs — a collapsed
 * whitespace run, a composed character, a deleted invisible character (empty in the normalised text) — map
 * only as a whole.
 */
export type OffsetRun = [normStart: number, normEnd: number, origStart: number, origEnd: number];

export interface NormalizedText {
  text: string;
  map: OffsetRun[];
}

/** A character with its combining marks (NFC composes within such a cluster). */
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;
const SPACE = /^\s$/u;
/** Soft hyphen and zero-width characters (U+FEFF is also a byte-order mark). */
const INVISIBLE = /^(?:\u00ad|\u200b|\u200c|\u200d|\u2060|\ufeff)$/u;
/** Apostrophe look-alikes → ’ (U+2019). */
const APOSTROPHES = /['`\u00b4\u02b9\u02bc\u2018\u2032]/gu;
/** Hyphens, figure/en/em dashes, the horizontal bar and minus signs → "-". */
const DASHES = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/gu;

const isLinear = (r: OffsetRun) => r[1] - r[0] === r[3] - r[2] && r[1] > r[0];

/**
 * The normal form: NFC (per character and its combining marks), apostrophe variants → ’, dash variants →
 * "-", invisible characters (soft hyphen, zero-width, BOM) removed, every whitespace run (spaces, tabs, line
 * breaks, non-breaking and thin spaces) → one space, no leading or trailing space. Quotes («», "") are kept.
 */
export function normalizeText(raw: string): NormalizedText {
  let text = "";
  const map: OffsetRun[] = [];
  const emit = (out: string, origStart: number, origEnd: number) => {
    const last = map.at(-1);
    const run: OffsetRun = [text.length, text.length + out.length, origStart, origEnd];
    if (last && isLinear(last) && isLinear(run)) {
      last[1] = run[1];
      last[3] = run[3];
    } else map.push(run);
    text += out;
  };
  let spaceFrom = -1;
  for (const m of raw.matchAll(CLUSTER)) {
    const [cluster] = m;
    const end = m.index + cluster.length;
    if (INVISIBLE.test(cluster)) {
      if (spaceFrom < 0) emit("", m.index, end); // inside a whitespace run it joins the run
    } else if (SPACE.test(cluster)) {
      if (spaceFrom < 0) spaceFrom = m.index;
    } else {
      if (spaceFrom >= 0) emit(text === "" ? "" : " ", spaceFrom, m.index);
      spaceFrom = -1;
      emit(cluster.normalize("NFC").replace(APOSTROPHES, "’").replace(DASHES, "-"), m.index, end);
    }
  }
  if (spaceFrom >= 0) emit("", spaceFrom, raw.length);
  return { text, map };
}

/** The input offset of a normalised offset, as the start (`side: "start"`) or the end of a span. */
function originalAt(map: readonly OffsetRun[], offset: number, side: "start" | "end"): number {
  const runs = map.filter((r) => r[1] > r[0]);
  if (side === "start") {
    const r = runs.find((x) => x[0] <= offset && offset < x[1]);
    if (!r) return runs.at(-1)?.[3] ?? 0;
    return isLinear(r) ? r[2] + offset - r[0] : r[2];
  }
  const r = runs.findLast((x) => x[0] < offset && offset <= x[1]);
  if (!r) return runs[0]?.[2] ?? 0;
  return isLinear(r) ? r[2] + offset - r[0] : r[3];
}

/**
 * The input span `[start, end)` that the normalised span `[start, end)` came from; it never starts or ends
 * with removed whitespace or invisible characters, and normalising it gives the normalised span back when
 * the span has no surrounding spaces.
 */
export function toOriginal(map: readonly OffsetRun[], start: number, end: number): { start: number; end: number } {
  return { start: originalAt(map, start, "start"), end: originalAt(map, end, "end") };
}

/** The normalised offset of an input offset (the start of its run when the run maps only as a whole). */
export function toNormalized(map: readonly OffsetRun[], offset: number): number {
  const r = map.find((x) => x[2] <= offset && offset < x[3]);
  if (!r) return map.at(-1)?.[1] ?? 0;
  return isLinear(r) ? r[0] + offset - r[2] : r[0];
}
