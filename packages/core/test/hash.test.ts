// Adapted from vlk-engine (packages/core/test/hash.test.ts), Apache-2.0, same author.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64Utf8, canonicalJson, sha256Hex } from "../src/hash.ts";

describe("sha256Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("agrees with node:crypto on UTF-8 text of many lengths (Cyrillic, emoji, block edges)", () => {
    const samples = [
      "Article 2(1): «medical device» — 21 день",
      "😀 astral",
      "x".repeat(55),
      "x".repeat(56),
      "y".repeat(64),
      "ї".repeat(200),
    ];
    for (const text of samples) expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });
});

describe("canonicalJson", () => {
  it("sorts keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});

describe("base64Utf8", () => {
  it("agrees with Buffer on UTF-8 text of every padding length", () => {
    for (const text of ["", "a", "ab", "abc", "Стаття «а»", "😀 ї", "x".repeat(100)]) {
      expect(base64Utf8(text)).toBe(Buffer.from(text, "utf8").toString("base64"));
    }
  });
});
