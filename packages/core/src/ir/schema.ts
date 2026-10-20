// DeviceIr — the rule language: a flat list of nodes (gates over leaves that read attributes or the result of
// another rule), outcomes with a rank, and the criteria (verbatim citations) every node encodes. The Zod schema is
// the single source of truth for types and validation. Semantics: docs/ARCHITECTURE.md ("Rules").
// Adapted from vlk-engine (packages/core/src/ir/schema.ts), Apache-2.0, same author: same flat-node shape, gates,
// prov.criterionIds, review marks and revision metadata; the leaves read device attributes instead of FHIR data.
import { z } from "zod";
import { IdSchema, IsoDateSchema, TextSchema } from "../model/text.ts";
import { CitationSchema } from "../source/citation.ts";

const base = {
  id: IdSchema,
  label: TextSchema,
  prov: z.strictObject({
    criterionIds: z.array(IdSchema).describe("Criteria (verbatim quotes) this node encodes"),
    basis: z.enum(["explicit", "structural"]).describe("explicit: stated in a source; structural: logic glue"),
  }),
  review: z.strictObject({
    status: z.enum(["draft", "reviewed"]).describe("reviewed: a regulatory specialist checked this node"),
  }),
};

const childIds = z.array(IdSchema);

const AllNode = z.strictObject({ ...base, kind: z.literal("all"), childIds });
const AnyNode = z.strictObject({ ...base, kind: z.literal("any"), childIds });
const NotNode = z.strictObject({ ...base, kind: z.literal("not"), childIds: childIds.describe("Exactly one child") });
const AtLeastNode = z.strictObject({ ...base, kind: z.literal("atLeast"), n: z.int(), childIds });

const AttrValue = z.union([z.boolean(), z.string()]);

/** A predicate over one registered attribute: `isTrue` (boolean), `equals` one value, `in` a list. */
const AttrNode = z.strictObject({
  ...base,
  kind: z.literal("attr"),
  attr: z.string(),
  op: z.enum(["isTrue", "equals", "in"]),
  values: z.array(AttrValue).describe("isTrue: []; equals: [value]; in: [values]"),
});

/** True when the other rule's result is surely one of `in`, false when surely none (or the rule does not apply). */
const ResultNode = z.strictObject({
  ...base,
  kind: z.literal("result"),
  rule: IdSchema,
  in: z.array(z.string()).min(1),
});

export const NodeSchema = z.discriminatedUnion("kind", [AllNode, AnyNode, NotNode, AtLeastNode, AttrNode, ResultNode]);

export const CriterionSchema = CitationSchema.extend({ id: IdSchema });

export const OutcomeSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
  label: TextSchema,
  rank: z.int().describe("highest-rank resolution: the strictest true outcome wins; exclusive: display order"),
  rootId: IdSchema,
  criterionIds: z.array(IdSchema).min(1),
});

export const DeviceIrSchema = z.strictObject({
  id: IdSchema,
  title: TextSchema,
  summary: TextSchema,
  market: z.enum(["EU", "US"]),
  role: z
    .enum(["primary", "cross-check", "hypothetical"])
    .describe("primary: decides the result; cross-check: guidance compared with it; hypothetical: a proposed revision"),
  revises: IdSchema.optional().describe("hypothetical: the rule this proposed revision would replace"),
  effective: z
    .strictObject({ from: IsoDateSchema, until: IsoDateSchema.optional(), criterionIds: z.array(IdSchema).min(1) })
    .optional()
    .describe("When the rule applies (as of a date); absent for a hypothetical rule"),
  scopeId: IdSchema.optional().describe("Node that must hold for the rule to apply at all"),
  resolution: z.enum(["highest-rank", "exclusive"]),
  resolutionCriterionIds: z.array(IdSchema).describe("Why the resolution (e.g. Annex VIII 3.5 for highest-rank)"),
  crossCheck: z
    .strictObject({
      attr: z.string(),
      map: z.record(z.string(), z.string()).describe("attribute value → the outcome this rule should then give"),
      criterionIds: z.array(IdSchema).min(1),
    })
    .optional()
    .describe("cross-check: the outcome must agree with this mapping of an attribute"),
  outcomes: z.array(OutcomeSchema).min(1),
  criteria: z.array(CriterionSchema),
  nodes: z.array(NodeSchema),
  metadata: z.strictObject({
    authoredBy: z.enum(["manual-reference", "specialist"]),
    revision: z.int().min(1),
    parentRevision: z.int().min(0).describe("0 = none"),
    irHash: z.string().describe("irHash() of this revision"),
    status: z.enum(["draft", "reviewed", "approved"]),
    approval: z.strictObject({ by: z.string(), at: z.string(), note: z.string() }),
  }),
});

export type DeviceIr = z.infer<typeof DeviceIrSchema>;
export type IrNode = z.infer<typeof NodeSchema>;
export type NodeKind = IrNode["kind"];
export type NodeOf<K extends NodeKind> = Extract<IrNode, { kind: K }>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;

export const GATE_KINDS = ["all", "any", "not", "atLeast"] as const;
export type GateNode = NodeOf<(typeof GATE_KINDS)[number]>;
export const isGate = (node: IrNode): node is GateNode => "childIds" in node;

/** The pseudo-outcome of a rule that does not apply (scope false); never a real outcome id. */
export const NO_OUTCOME = "$none";
