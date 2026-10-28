// The sea's map of the map's lines (lib/waves.ts): a wave that reaches a branch carries on along the lines from it,
// fainter and right after; each line keeps its own way along, so a long line is not cut short; a drag of the whole
// map moves the map of the lines instead of building it again.
import { describe, expect, it } from "vitest";
import { movedBy, waveMap } from "../src/lib/waves.ts";

describe("the sea's map of the lines", () => {
  const toBranch = { points: [0, 0, 50, 0, 100, 0] };
  const toRequirement = { points: [120, 0, 170, 0, 220, 0], from: 0 };

  it("carries a wave on from the line to a branch along the lines from it, fainter and right after", () => {
    const map = waveMap([toBranch, toRequirement]);
    const [root, onward] = map?.lines ?? [];
    expect(root).toEqual({ family: 0, start: 0, end: 100, strength: 1 });
    // The same family, starting where the line to the branch ends, plus well under a second across it.
    expect(onward?.family).toBe(0);
    expect(onward?.strength).toBeLessThan(1);
    expect(onward?.start).toBeGreaterThan(100);
    expect(onward?.start).toBeLessThan(100 + 16);
    expect((onward?.end ?? 0) - (onward?.start ?? 0)).toBeCloseTo(100);
  });

  it("gives each line from the device its own family", () => {
    const map = waveMap([toBranch, { points: [0, 40, 100, 40] }, toRequirement]);
    expect(map?.lines.map((l) => l.family)).toEqual([0, 1, 0]);
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
