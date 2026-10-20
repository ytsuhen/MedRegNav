// Adapted from vlk-engine (packages/core/test/article/normalize.test.ts), Apache-2.0, same author.
// Normalisation: one canonical text for every way of copying a source section, and an exact map back.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeText, type OffsetRun, toNormalized, toOriginal } from "../../src/index.ts";

/** Pieces of messy scrapes: letters, decomposed letters, odd spaces, apostrophes, dashes, invisibles. */
const PIECES = [
  "а",
  "б",
  "й",
  "ї",
  "Н",
  "5",
  ".",
  ";",
  "(",
  "»",
  " ",
  "  ",
  "\u00a0",
  "\u2009",
  "\u202f",
  "\t",
  "\n",
  "'",
  "\u02bc",
  "\u2018",
  "’",
  "`",
  "-",
  "\u2013",
  "\u2014",
  "\u2212",
  "\u00ad",
  "\u200b",
  "\ufeff",
  "и\u0306",
  "і\u0308",
  "e\u0301",
];
const messy = fc.array(fc.constantFrom(...PIECES), { maxLength: 40 }).map((p) => p.join(""));
const linear = (r: OffsetRun) => r[1] - r[0] === r[3] - r[2] && r[1] > r[0];

describe("normalizeText", () => {
  it("normalises spaces, apostrophes, dashes, composed letters and invisible characters", () => {
    const raw =
      "\ufeff Стаття\u00a030:\tкров\u02bcяним   тиском I10\u2013I15 \u2014 сто\u00adрона\u200b, и\u0306 і\u0308\n«а»  ";
    expect(normalizeText(raw).text).toBe("Стаття 30: кров’яним тиском I10-I15 - сторона, й ї «а»");
    expect(normalizeText("зв'язку зв`язку зв\u2018язку зв’язку").text).toBe("зв’язку зв’язку зв’язку зв’язку");
    expect(normalizeText(" \u200b \n").text).toBe("");
  });

  it("maps every unchanged stretch one-to-one and collapsed runs as a whole", () => {
    const raw = "  а  би\u0306 в";
    const { text, map } = normalizeText(raw);
    expect(text).toBe("а бй в");
    expect(map).toEqual([
      [0, 0, 0, 2], // leading spaces: removed
      [0, 1, 2, 3], // а
      [1, 2, 3, 5], // two spaces → one
      [2, 3, 5, 6], // б
      [3, 4, 6, 8], // и + combining breve → й
      [4, 6, 8, 10], // " в", unchanged
    ]);
  });

  it("is idempotent, and its output is a fixed point with the identity map", () => {
    fc.assert(
      fc.property(messy, (raw) => {
        const once = normalizeText(raw).text;
        const twice = normalizeText(once);
        expect(twice.text).toBe(once);
        expect(twice.map).toEqual(once === "" ? [] : [[0, once.length, 0, once.length]]);
        expect(once).not.toMatch(
          /^ | $| {2}|[\t\n\u00a0\u2009\u202f'`\u02bc\u2018\u2013\u2014\u2212\u00ad\u200b\ufeff]/u,
        );
        expect(once).toBe(once.normalize("NFC"));
      }),
    );
  });

  it("maps every normalised character back to the input it came from", () => {
    fc.assert(
      fc.property(messy, (raw) => {
        const { text, map } = normalizeText(raw);
        // The runs tile both texts in order.
        let [n, o] = [0, 0];
        for (const [ns, ne, os, oe] of map) {
          expect([ns, os]).toEqual([n, o]);
          expect(ne >= ns && oe > os).toBe(true);
          [n, o] = [ne, oe];
        }
        expect([n, o]).toEqual([text.length, raw.length]);
        for (let i = 0; i < text.length; i++) {
          const span = toOriginal(map, i, i + 1);
          const piece = raw.slice(span.start, span.end);
          if (text[i] === " ") expect(piece).toMatch(/^[\s\u00ad\u200b\ufeff]+$/u);
          else expect(normalizeText(piece).text).toBe(text[i]);
        }
      }),
    );
  });

  it("round-trips offsets and spans", () => {
    fc.assert(
      fc.property(messy, fc.nat(), fc.nat(), (raw, a, b) => {
        const { text, map } = normalizeText(raw);
        for (let i = 0; i <= text.length; i++) {
          const inside = map.some((r) => !linear(r) && r[0] < i && i < r[1]);
          if (!inside) expect(toNormalized(map, toOriginal(map, i, i).start)).toBe(i);
        }
        const [s, e] = [a % (text.length + 1), b % (text.length + 1)].sort((x, y) => x - y) as [number, number];
        const span = toOriginal(map, s, e);
        expect(normalizeText(raw.slice(span.start, span.end)).text).toBe(text.slice(s, e).trim());
      }),
    );
  });
});
