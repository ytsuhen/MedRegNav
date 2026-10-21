// Why a rule gave its result: the nodes that explain a node's truth value (its witnesses), with the same choice of
// children as the attribute support in evaluate.ts. The UI lists them, each with its label and quotes, under "what
// decided it".
import type { Truth } from "./evaluate.ts";
import { type DeviceIr, isGate } from "./schema.ts";

/**
 * The nodes that explain `rootId`'s value, depth-first from it (the node itself first): every child of a true `all`
 * or a false `any`; the first deciding child of a false `all` or a true `any`; the child of a `not`; for `atLeast`
 * the true children when it holds and the false ones when it fails; the unknown children of an unknown gate.
 */
export function witnesses(ir: DeviceIr, truth: Readonly<Record<string, Truth>>, rootId: string): string[] {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  const seen = new Set<string>();
  const t = (id: string): Truth => truth[id] ?? null;
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    const n = byId.get(id);
    if (!n || !isGate(n)) return;
    const v = t(id);
    const kids = n.childIds;
    const withState = (state: Truth) => kids.filter((k) => t(k) === state);
    let next: string[];
    if (n.kind === "not") next = kids;
    else if (v === null) next = withState(null);
    else if (n.kind === "all") next = v ? kids : withState(false).slice(0, 1);
    else if (n.kind === "any") next = v ? withState(true).slice(0, 1) : kids;
    else next = v ? withState(true).slice(0, n.n) : withState(false);
    for (const k of next) visit(k);
  };
  visit(rootId);
  return out;
}
