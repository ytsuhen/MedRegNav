// `pnpm mrn obligations <example-id | profile.json> [--asof YYYY-MM-DD] [--proposals]`: the full catalogue for a
// device, branch by branch: what applies, from when, how to comply, and the citations behind it.
import { existsSync } from "node:fs";
import { BRANCHES, navigate, type Profile } from "@mrn/core";
import type { Out } from "../cli.ts";
import { readExamples, readJson, readModel } from "../data.ts";

const mark = { true: "✔", false: "·", null: "?" } as const;

export async function obligationsCommand(args: string[], out: Out): Promise<number> {
  const [target] = args.filter((a) => !a.startsWith("--") && !/^\d{4}-\d{2}-\d{2}$/.test(a));
  const at = args.indexOf("--asof");
  const asOf = at >= 0 ? (args[at + 1] ?? "") : new Date().toISOString().slice(0, 10);
  const example = target ? readExamples().find((e) => e.id === target) : undefined;
  if (!target || (!example && !existsSync(target))) {
    out.write("usage: pnpm mrn obligations <example-id | profile.json> [--asof YYYY-MM-DD] [--proposals]\n");
    return 2;
  }
  const profile: Profile = example ? example.profile : (readJson(target) as Profile);
  const model = readModel();
  const nav = navigate(model, profile, { asOf, proposals: args.includes("--proposals") });
  const byId = new Map(model.obligations.map((o) => [o.id, o]));
  const cls = nav.results["eu-mdr-classification"];
  out.write(`as of ${asOf} · class ${cls?.value ?? `{${cls?.possible.join(", ") ?? ""}}`} (${cls?.status})\n`);
  for (const branch of BRANCHES) {
    const items = nav.obligations.filter((o) => o.branch === branch && o.applies !== false);
    if (items.length === 0) continue;
    out.write(`\n[${branch}]\n`);
    for (const r of items) {
      const o = byId.get(r.id);
      if (!o) continue;
      const when = r.timing === "in-force" ? `since ${o.effective.from}` : `${r.timing} ${o.effective.from}`;
      out.write(`  ${mark[String(r.applies) as keyof typeof mark]} ${o.title.en} (${when})\n`);
      out.write(`      → ${o.how.deliverable.en}${o.how.standards.length ? ` · ${o.how.standards.join(", ")}` : ""}\n`);
      for (const c of o.citations)
        out.write(`      “${c.quote.slice(0, 110)}${c.quote.length > 110 ? "…" : ""}” — ${c.source}/${c.section}\n`);
    }
  }
  if (nav.questions.length > 0) out.write(`\nopen questions: ${nav.questions.map((q) => q.attr).join(", ")}\n`);
  return 0;
}
