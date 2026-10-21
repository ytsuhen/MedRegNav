// The map's layout, computed (no hand-placed coordinates): the device in the centre, the first half of the branches
// on its left and the rest on its right, and the leaves of the expanded branch fanned out beside it. Each side is a
// tidy tree (d3-hierarchy, Reingold–Tilford) grown sideways from the device, with node heights as measured in the
// browser (or estimated before the first measurement) so that nothing overlaps.
import { type HierarchyPointNode, hierarchy, tree } from "d3-hierarchy";

export interface SizedNode {
  id: string;
  height: number;
}

export interface LayoutInput {
  device: { id: string; width: number; height: number };
  branches: (SizedNode & { side: "left" | "right"; leaves: SizedNode[] })[];
  branchWidth: number;
  leafWidth: number;
  /** Horizontal gaps: device ↔ branches, branch ↔ leaves. */
  gapX: [number, number];
  /** Vertical gap between neighbouring branches, and between leaves. */
  gapY: [number, number];
}

export interface Placed {
  id: string;
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  side: "left" | "right" | "centre";
  depth: 0 | 1 | 2;
  parent: string | null;
}

export interface Layout {
  nodes: Placed[];
  bounds: { x: number; y: number; width: number; height: number };
}

interface Datum {
  id: string;
  height: number;
  children?: Datum[];
}

export function layoutMap(input: LayoutInput): Layout {
  const { device, branchWidth, leafWidth, gapX, gapY } = input;
  const nodes: Placed[] = [
    {
      id: device.id,
      x: -device.width / 2,
      y: -device.height / 2,
      width: device.width,
      height: device.height,
      side: "centre",
      depth: 0,
      parent: null,
    },
  ];
  for (const side of ["left", "right"] as const) {
    const branches = input.branches.filter((b) => b.side === side);
    if (branches.length === 0) continue;
    const root = hierarchy<Datum>({
      id: device.id,
      height: device.height,
      children: branches.map((b) => ({
        id: b.id,
        height: b.height,
        children: b.leaves.length > 0 ? b.leaves.map((l) => ({ id: l.id, height: l.height })) : undefined,
      })),
    });
    // nodeSize [1, 1]: separation() is then the distance in pixels between neighbouring centres.
    tree<Datum>()
      .nodeSize([1, 1])
      .separation((a, b) => (a.data.height + b.data.height) / 2 + (a.depth >= 2 ? gapY[1] : gapY[0]))(root);
    const column = (depth: number) =>
      depth === 1 ? device.width / 2 + gapX[0] : device.width / 2 + gapX[0] + branchWidth + gapX[1];
    for (const n of root.descendants() as HierarchyPointNode<Datum>[]) {
      if (n.depth === 0) continue;
      const width = n.depth === 1 ? branchWidth : leafWidth;
      const inner = column(n.depth);
      nodes.push({
        id: n.data.id,
        x: side === "right" ? inner : -inner - width,
        y: n.x - n.data.height / 2,
        width,
        height: n.data.height,
        side,
        depth: n.depth as 1 | 2,
        parent: n.parent?.data.id ?? null,
      });
    }
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  return { nodes, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
