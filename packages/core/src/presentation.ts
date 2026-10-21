// How the main screen presents a market (`data/navigator.json`): which rule gives the device node its qualification
// line, whose outcomes form the class ladder, and which rules' results sit on which first-level branch next to that
// branch's obligations. The UI code names no rule: this file does. A market that is not modelled yet ("next-stage")
// gets a placeholder screen.
import { z } from "zod";
import type { DeviceIr } from "./ir/schema.ts";
import { IdSchema } from "./model/text.ts";
import { BRANCHES } from "./obligations.ts";

const Market = z.enum(["EU", "US"]);

export const MarketViewSchema = z.discriminatedUnion("status", [
  z.strictObject({
    market: Market,
    status: z.literal("modelled"),
    device: z.strictObject({
      qualification: IdSchema.describe("Rule whose result is the device node's first line"),
      ladder: IdSchema.describe("Rule whose outcomes, in rank order, form the class ladder"),
    }),
    branches: z
      .array(z.strictObject({ id: z.enum(BRANCHES), rules: z.array(IdSchema) }))
      .describe("First-level branches in display order (the first half on the left), with the rules shown on each"),
  }),
  z.strictObject({ market: Market, status: z.literal("next-stage") }),
]);

export type MarketView = z.infer<typeof MarketViewSchema>;
export type ModelledMarket = Extract<MarketView, { status: "modelled" }>;

export const PresentationSchema = z.strictObject({ markets: z.array(MarketViewSchema).min(1) });

export type Presentation = z.infer<typeof PresentationSchema>;

/**
 * Problems: a market listed twice; a modelled market without every branch exactly once; a rule that is unknown,
 * of another market, hypothetical, or on two branches; a rule of the market on no branch; device rules that are not
 * primary.
 */
export function presentationIssues(presentation: Presentation, rules: readonly DeviceIr[]): string[] {
  const issues: string[] = [];
  const byId = new Map(rules.map((r) => [r.id, r]));
  const markets = presentation.markets.map((m) => m.market);
  for (const m of markets.filter((x, i) => markets.indexOf(x) !== i)) issues.push(`${m}: listed twice`);
  for (const view of presentation.markets) {
    if (view.status !== "modelled") continue;
    const where = view.market;
    const ids = view.branches.map((b) => b.id);
    if (ids.length !== BRANCHES.length || BRANCHES.some((b) => !ids.includes(b)))
      issues.push(`${where}: branches must list each of ${BRANCHES.join(", ")} once`);
    const placed = new Map<string, string>();
    for (const branch of view.branches) {
      for (const id of branch.rules) {
        const rule = byId.get(id);
        if (!rule) issues.push(`${where}/${branch.id}: unknown rule ${id}`);
        else if (rule.market !== view.market) issues.push(`${where}/${branch.id}: ${id} is a ${rule.market} rule`);
        else if (rule.role === "hypothetical")
          issues.push(`${where}/${branch.id}: ${id} is hypothetical (shown with the rule it revises)`);
        const other = placed.get(id);
        if (other) issues.push(`${where}: ${id} is on both ${other} and ${branch.id}`);
        placed.set(id, branch.id);
      }
    }
    for (const rule of rules) {
      if (rule.market === view.market && rule.role !== "hypothetical" && !placed.has(rule.id))
        issues.push(`${where}: rule ${rule.id} is on no branch`);
    }
    for (const [slot, id] of Object.entries(view.device)) {
      const rule = byId.get(id);
      if (!rule) issues.push(`${where}/device.${slot}: unknown rule ${id}`);
      else if (rule.role !== "primary") issues.push(`${where}/device.${slot}: ${id} is not a primary rule`);
    }
  }
  return issues;
}

/** The view of a market, if it is modelled. */
export function modelledMarket(presentation: Presentation, market: string): ModelledMarket | null {
  const view = presentation.markets.find((m) => m.market === market);
  return view?.status === "modelled" ? view : null;
}
