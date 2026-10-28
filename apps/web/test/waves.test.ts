// The sea's map of the map's lines (lib/waves.ts), along which the water twinkles: the lines from a branch to its
// requirements carry on the line to that branch, fainter; each line keeps its own way along, so a long line is not cut
// short; a drag of the whole map moves the map of the lines instead of building it again.
import { describe, expect, it } from "vitest";
import { movedBy, waveMap } from "../src/lib/waves.ts";

describe("the sea's map of the lines", () => {
  const toBranch = { points: [0, 0, 50, 0, 100, 0] };
  const toRequirement = { points: [120, 0, 170, 0, 220, 0], from: 0 };

  it("carries the line to a branch on along the lines from it, fainter", () => {
    const map = waveMap([toBranch, toRequirement]);
    const [root, onward] = map?.lines ?? [];
    expect(root).toEqual({ length: 100, strength: 1 });
    expect(onward?.length).toBeCloseTo(100);
    expect(onward?.strength).toBeLessThan(1);
    expect(onward?.strength).toBeGreaterThan(0);
  });

  it("keeps every line from the device at full strength", () => {
    const map = waveMap([toBranch, { points: [0, 40, 100, 40] }, toRequirement]);
    expect(map?.lines.map((l) => l.strength === 1)).toEqual([true, true, false]);
  });

  it("keeps a long line's way along to its end", () => {
    const map = waveMap([{ points: [0, 0, 450, 0, 900, 0] }]);
    if (!map) throw new Error("no map");
    const [x0, y0] = map.rect;
    const cell = map.rect[2] / map.cols;
    // The cell over the point 880 px along the line: its green channel is the way along, a step of four pixels.
    const c = Math.floor((880 - x0) / cell);
    const r = Math.floor((0 - y0) / cell);
    const green = map.data[(r * map.cols + c) * 4 + 1] ?? 0;
    expect(green * 4).toBeGreaterThan(860);
    expect(green * 4).toBeLessThan(900);
  });

  it("tells a drag of the whole map from a change of it", () => {
    const dragged = [toBranch, toRequirement].map((l) => ({
      ...l,
      points: l.points.map((v, i) => v + (i % 2 ? 5 : 10)),
    }));
    expect(movedBy([toBranch, toRequirement], dragged)).toEqual([10, 5]);
    expect(movedBy([toBranch], [{ points: [0, 0, 60, 0, 100, 0] }])).toBeNull();
    expect(movedBy([toBranch], [toBranch, toRequirement])).toBeNull();
  });
});
