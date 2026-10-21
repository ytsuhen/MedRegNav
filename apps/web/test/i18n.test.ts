// Every UI string goes through the dictionary (CLAUDE.md): both languages have the same keys and placeholders, no
// message is empty, every key the components pass to t() exists, and no component carries literal Cyrillic text.
// The banner is the brief's wording, word for word.
// Adapted from vlk-engine (apps/demo/test/web/i18n.test.ts), Apache-2.0, same author.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DICTIONARY, translate } from "../src/i18n/dict.ts";

const SRC = new URL("../src/", import.meta.url);
const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => /\.tsx?$/.test(f) && !f.startsWith("i18n"))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, SRC), "utf8") }));

/** Code without comments. */
const code = (text: string) => text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("i18n dictionary", () => {
  it("has the same keys in Ukrainian and English, none empty", () => {
    expect(Object.keys(DICTIONARY.en).sort()).toEqual(Object.keys(DICTIONARY.uk).sort());
    for (const lang of ["uk", "en"] as const) {
      for (const [key, value] of Object.entries(DICTIONARY[lang])) expect(value.trim(), `${lang}:${key}`).not.toBe("");
    }
  });

  it("uses the same placeholders in both languages", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)(?=[},])/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(DICTIONARY.uk) as (keyof typeof DICTIONARY.uk)[]) {
      expect(names(DICTIONARY.en[key]), key).toEqual(names(DICTIONARY.uk[key]));
    }
  });

  it("chooses Ukrainian plural forms", () => {
    expect(translate("uk", "branch.count", { n: 1 })).toBe("1 вимога");
    expect(translate("uk", "branch.count", { n: 3 })).toBe("3 вимоги");
    expect(translate("uk", "branch.count", { n: 9 })).toBe("9 вимог");
    expect(translate("en", "branch.count", { n: 1 })).toBe("1 requirement");
    expect(translate("en", "leaf.from", { date: "2 Aug 2028" })).toBe("from 2 Aug 2028");
  });

  it("knows every literal key the components pass to t()", () => {
    const keys = new Set(Object.keys(DICTIONARY.uk));
    const used = sources.flatMap(({ file, text }) =>
      [...code(text).matchAll(/\bt\(\s*"([\w.-]+)"/g)].map((m) => ({ file, key: m[1] as string })),
    );
    expect(used.length).toBeGreaterThan(80);
    expect(used.filter((u) => !keys.has(u.key))).toEqual([]);
  });

  it("has no literal Cyrillic text in the components (data aside)", () => {
    const offenders = sources.flatMap(({ file, text }) =>
      code(text)
        .split("\n")
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter((l) => /[А-Яа-яЄєІіЇїҐґ]/.test(l.text)),
    );
    expect(offenders).toEqual([]);
  });

  it("shows the brief's banner word for word", () => {
    expect(`${DICTIONARY.uk["banner.lead"]} ${DICTIONARY.uk["banner.rest"]}`).toBe(
      "Демо, не юридична консультація. Клас визначає виробник; для IIa і вище його підтверджує нотифікований орган. Правила — чернетка, не перевірені регуляторним фахівцем.",
    );
  });
});
