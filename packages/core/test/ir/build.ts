// Tiny builders for synthetic rules in unit tests (the real rules live in data/rules and are tested in apps/cli).
import type { AttributeRegistry, DeviceIr, IrNode } from "../../src/index.ts";

const T = (s: string) => ({ uk: s, en: s });
const prov = (basis: "explicit" | "structural" = "explicit") => ({
  criterionIds: basis === "explicit" ? ["c1"] : [],
  basis,
});
const review = { status: "draft" as const };

export const attr = (
  id: string,
  a: string,
  op: "isTrue" | "equals" | "in" = "isTrue",
  values: (string | boolean)[] = [],
) => ({ id, label: T(id), prov: prov(), review, kind: "attr", attr: a, op, values }) as IrNode;

export const gate = (id: string, kind: "all" | "any" | "not", childIds: string[]) =>
  ({ id, label: T(id), prov: prov("structural"), review, kind, childIds }) as IrNode;

export const atLeast = (id: string, n: number, childIds: string[]) =>
  ({ id, label: T(id), prov: prov("structural"), review, kind: "atLeast", n, childIds }) as IrNode;

export const result = (id: string, rule: string, inn: string[]) =>
  ({ id, label: T(id), prov: prov(), review, kind: "result", rule, in: inn }) as IrNode;

export function rule(
  id: string,
  nodes: IrNode[],
  outcomes: [id: string, rank: number, rootId: string][],
  extra: Partial<DeviceIr> = {},
): DeviceIr {
  return {
    id,
    title: T(id),
    summary: T(id),
    market: "EU",
    role: "primary",
    effective: { from: "2021-05-26", criterionIds: ["c1"] },
    resolution: "highest-rank",
    resolutionCriterionIds: ["c1"],
    outcomes: outcomes.map(([oid, rank, rootId]) => ({ id: oid, label: T(oid), rank, rootId, criterionIds: ["c1"] })),
    criteria: [{ id: "c1", source: "s", section: "x", quote: "q", sha256: "0".repeat(64), start: 0, end: 1 }],
    nodes,
    metadata: {
      authoredBy: "manual-reference",
      revision: 1,
      parentRevision: 0,
      irHash: "",
      status: "draft",
      approval: { by: "", at: "", note: "" },
    },
    ...extra,
  };
}

const boolAttr = (id: string) => ({
  id,
  type: "boolean" as const,
  group: "classification" as const,
  label: T(id),
  question: T(id),
  help: T(id),
  citations: [{ source: "s", section: "x", quote: "q", sha256: "0".repeat(64), start: 0, end: 1 }],
});

export const registry: AttributeRegistry = {
  attributes: [
    boolAttr("a"),
    boolAttr("b"),
    boolAttr("c"),
    {
      ...boolAttr("level"),
      type: "enum",
      values: [
        { id: "low", label: T("low") },
        { id: "mid", label: T("mid") },
        { id: "high", label: T("high") },
      ],
    },
  ],
};
