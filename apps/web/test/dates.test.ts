// Calendar dates: day numbers round-trip, formats per language, and the slider's key dates come from the data.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatDate, fromDays, isIsoDate, keyDates, sliderRange, toDays } from "../src/lib/dates.ts";
import { snapshot } from "./fixtures.ts";

describe("dates", () => {
  it("round-trip through day numbers", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 60_000 }), (d) => toDays(fromDays(d)) === d));
    expect(isIsoDate("2028-08-02")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
  });

  it("format as 02.08.2028 in Ukrainian and 2 Aug 2028 in English", () => {
    expect(formatDate("2028-08-02", "uk")).toBe("02.08.2028");
    expect(formatDate("2028-08-02", "en")).toBe("2 Aug 2028");
  });

  it("mark every date an obligation or a rule starts to apply", () => {
    const dates = keyDates(snapshot.model).map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    for (const d of ["2021-05-26", "2023-05-26", "2025-05-26", "2026-05-28", "2026-08-02", "2028-08-02"])
      expect(dates).toContain(d);
    const range = sliderRange(keyDates(snapshot.model), "2026-10-21");
    expect(range).toEqual({ min: "2021-05-26", max: "2029-12-31" });
  });
});
