// The attribute registry (`data/attributes.json`): every fact about a device that rules may read. Rules read only
// registered attributes; a profile gives each attribute a value or leaves it unknown ("don't know" = null).
import { z } from "zod";
import { TextSchema } from "./model/text.ts";
import { CitationSchema } from "./source/citation.ts";

export const ATTRIBUTE_GROUPS = ["qualification", "classification", "ai", "market", "guidance"] as const;

const ValueIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "value id: letters, digits, dashes");

export const AttributeSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "camelCase attribute id"),
    type: z.enum(["boolean", "enum"]),
    values: z
      .array(z.strictObject({ id: ValueIdSchema, label: TextSchema, help: TextSchema.optional() }))
      .optional()
      .describe("enum only: the allowed values"),
    group: z.enum(ATTRIBUTE_GROUPS).describe("Where the UI shows the chip"),
    label: TextSchema.describe("Short chip label"),
    question: TextSchema.describe("The question that sets the attribute"),
    help: TextSchema.describe("How to answer it; our words, not the law's"),
    citations: z.array(CitationSchema).min(1).describe("Verbatim sources of the concept"),
  })
  .superRefine((a, ctx) => {
    if (a.type === "enum" && (a.values?.length ?? 0) < 2)
      ctx.addIssue({ code: "custom", message: "enum needs ≥ 2 values" });
    if (a.type === "boolean" && a.values) ctx.addIssue({ code: "custom", message: "boolean has no values" });
    const ids = (a.values ?? []).map((v) => v.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate value id" });
  });

export type Attribute = z.infer<typeof AttributeSchema>;

export const AttributeRegistrySchema = z
  .strictObject({ attributes: z.array(AttributeSchema).min(1) })
  .superRefine((r, ctx) => {
    const ids = r.attributes.map((a) => a.id);
    for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) {
      ctx.addIssue({ code: "custom", message: `duplicate attribute id ${id}` });
    }
  });

export type AttributeRegistry = z.infer<typeof AttributeRegistrySchema>;

/** A device profile: attribute id → value. Missing or null = unknown ("don't know"). */
export type AttributeValue = boolean | string;
export type Profile = Readonly<Record<string, AttributeValue | null | undefined>>;

/** The values an attribute can take. */
export function domain(attribute: Attribute): AttributeValue[] {
  return attribute.type === "boolean" ? [true, false] : (attribute.values ?? []).map((v) => v.id);
}

/** Problems with a profile: unknown attributes, values outside the domain. */
export function profileIssues(registry: AttributeRegistry, profile: Profile): string[] {
  const byId = new Map(registry.attributes.map((a) => [a.id, a]));
  const issues: string[] = [];
  for (const [id, value] of Object.entries(profile)) {
    const attribute = byId.get(id);
    if (!attribute) issues.push(`unknown attribute ${id}`);
    else if (value !== null && value !== undefined && !domain(attribute).includes(value)) {
      issues.push(`${id}: ${JSON.stringify(value)} is not one of ${JSON.stringify(domain(attribute))}`);
    }
  }
  return issues;
}
