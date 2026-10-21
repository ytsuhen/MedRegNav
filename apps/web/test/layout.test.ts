// The map layout: no two nodes overlap whatever the heights and the number of leaves, the device sits in the centre,
// branches go to their side and the expanded branch's leaves fan out beyond it.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type LayoutInput, layoutMap, type Placed } from "../src/lib/layout.ts";

const base = (branches: LayoutInput["branches"]): LayoutInput => ({
  device: { id: "device", width: 284, height: 190 },
  branches,
  branchWidth: 196,
  leafWidth: 252,
  gapX: [54, 36],
  gapY: [22, 8],
});

const overlap = (a: Placed, b: Placed) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const arbitraryInput = fc
  .record({
    heights: fc.array(fc.integer({ min: 40, max: 220 }), { minLength: 6, maxLength: 6 }),
    expanded: fc.integer({ min: -1, max: 5 }),
    leaves: fc.array(fc.integer({ min: 30, max: 110 }), { maxLength: 18 }),
  })
  .map(({ heights, expanded, leaves }) =>
    base(
      heights.map((height, i) => ({
        id: `b${i}`,
        height,
        side: i < 3 ? ("left" as const) : ("right" as const),
        leaves: i === expanded ? leaves.map((h, j) => ({ id: `b${i}-l${j}`, height: h })) : [],
      })),
    ),
  );

describe("layoutMap", () => {
  it("never overlaps two nodes", () => {
    fc.assert(
      fc.property(arbitraryInput, (input) => {
        const { nodes } = layoutMap(input);
        for (const [i, a] of nodes.entries()) for (const b of nodes.slice(i + 1)) if (overlap(a, b)) return false;
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it("centres the device, puts branches on their side and leaves beyond their branch", () => {
    fc.assert(
      fc.property(arbitraryInput, (input) => {
        const { nodes, bounds } = layoutMap(input);
        const device = nodes.find((n) => n.id === "device");
        if (!device || device.x + device.width / 2 !== 0 || device.y + device.height / 2 !== 0) return false;
        for (const n of nodes) {
          if (n.depth === 0) continue;
          if (n.side === "left" ? n.x + n.width > device.x : n.x < device.x + device.width) return false;
          const parent = nodes.find((p) => p.id === n.parent);
          if (
            n.depth === 2 &&
            (!parent || (n.side === "left" ? n.x + n.width > parent.x : n.x < parent.x + parent.width))
          )
            return false;
          if (n.x < bounds.x || n.y < bounds.y || n.x + n.width > bounds.x + bounds.width + 1e-9) return false;
        }
        return nodes.length === 7 + input.branches.reduce((s, b) => s + b.leaves.length, 0);
      }),
      { numRuns: 200 },
    );
  });

  it("is symmetric when nothing is expanded", () => {
    const { nodes } = layoutMap(
      base(
        ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, height: 64, side: i < 3 ? "left" : "right", leaves: [] })),
      ),
    );
    const y = (id: string) => nodes.find((n) => n.id === id)?.y;
    expect([y("a"), y("b"), y("c")]).toEqual([y("d"), y("e"), y("f")]);
    expect(y("b")).toBe(-32);
  });
});
