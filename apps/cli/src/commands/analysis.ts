// `pnpm mrn coverage | mcdc | whatif`: the analyses of the rule set (core/analysis) as text reports.
import { mcdcPairs, NO_OUTCOME, ruleCoverage, whatIf } from "@mrn/core";
import type { Out } from "../cli.ts";
import { readExamples, readRegistry, readRules, readWhatIf } from "../data.ts";

const show = (id: string) => (id === NO_OUTCOME ? "—" : id);

/** `coverage`: every rule on every combination of its inputs; fails when one ends with no possible outcome. */
export async function coverageCommand(_args: string[], out: Out): Promise<number> {
  const report = ruleCoverage(readRules(), readRegistry());
  let failures = 0;
  for (const r of report) {
    failures += r.failureCount;
    const reads = [...r.attributes, ...r.dependencies.map((d) => `result of ${d}`)].join(", ");
    out.write(
      `${r.ruleId} [${r.role}] — ${r.inputs} distinct inputs (${reads}), standing for ${r.profiles.toLocaleString("en")} profiles with "unknown"\n`,
    );
    for (const x of r.results.slice(0, 8)) {
      const set = x.possible.length === 0 ? "∅" : x.possible.join(", ");
      const scope = x.scope === null ? " (may not apply)" : "";
      out.write(`  ${x.status.padEnd(14)} ${`{${set}}${scope}`.padEnd(44)} ×${x.count}\n`);
    }
    if (r.results.length > 8) out.write(`  … ${r.results.length - 8} more distinct results\n`);
    const dead = r.leaves.filter((l) => l.true === 0 || l.false === 0);
    out.write(
      dead.length === 0
        ? `  every leaf seen true, false and unknown\n`
        : `  leaves never true or never false: ${dead.map((l) => l.nodeId).join(", ")}\n`,
    );
    out.write(
      r.failureCount === 0
        ? `  ✓ every combination gives an outcome or an explicit set of possible outcomes\n\n`
        : `  ✗ ${r.failureCount} combinations with no possible outcome, e.g. ${JSON.stringify(r.failures[0])}\n\n`,
    );
  }
  return failures > 0 ? 1 : 0;
}

/** `mcdc`: per rule and leaf, the pair of inputs that shows the leaf deciding the outcome on its own. */
export async function mcdcCommand(_args: string[], out: Out): Promise<number> {
  for (const r of mcdcPairs(readRules(), readRegistry())) {
    const unique = r.leaves.filter((l) => l.status === "unique").length;
    const masking = r.leaves.filter((l) => l.status === "masking").length;
    out.write(
      `${r.ruleId} [${r.role}] — ${r.inputs} real inputs; MC/DC ${r.achieved}/${r.total} leaves (unique-cause ${unique}, masking ${masking})\n`,
    );
    const width = Math.max(...r.leaves.map((l) => l.nodeId.length));
    for (const l of r.leaves) {
      const head = `  ${l.nodeId.padEnd(width)}  ${l.reads.padEnd(22)} ${l.status.padEnd(8)}`;
      if (!l.pair) {
        out.write(`${head} never decides the outcome on its own\n`);
        continue;
      }
      const context = [
        ...Object.entries(l.pair.profile).map(([k, v]) => `${k}=${String(v)}`),
        ...Object.entries(l.pair.dependencies).map(([k, v]) => `${k}=${show(v)}`),
      ].join(" ");
      out.write(
        `${head} ${l.pair.values[0]} → ${l.pair.values[1]}: ${show(l.pair.outcomes[0])} → ${show(l.pair.outcomes[1])}  [${context}]\n`,
      );
    }
    out.write("\n");
  }
  return 0;
}

/** `whatif`: each proposed revision against the rule in force — the diff, the cohort's transitions, the examples. */
export async function whatifCommand(_args: string[], out: Out): Promise<number> {
  const rules = readRules();
  const registry = readRegistry();
  const examples = readExamples();
  for (const proposal of readWhatIf().proposals) {
    const w = whatIf(rules, registry, proposal, examples);
    const d = w.diff;
    const changes = (c: { added: string[]; removed: string[]; changed: string[] }) =>
      `+${c.added.length} −${c.removed.length} ~${c.changed.length}`;
    out.write(`${w.revision} revises ${w.revises} (r${d.from.revision} → r${d.to.revision})\n`);
    out.write(`  nodes ${changes(d.nodes)}, outcomes ${changes(d.outcomes)}, criteria ${changes(d.criteria)}\n`);
    out.write(
      `  attributes read: +${d.attributes.added.join(", +") || "none"}; −${d.attributes.removed.join(", −") || "none"}\n`,
    );
    const m = w.matrix;
    out.write(
      `  cohort from example ${proposal.base}, varying ${w.attributes.length} attributes: ${m.cohort} distinct situations; the class changes in ${m.changed} (up ${m.up}, down ${m.down})\n`,
    );
    out.write(`  ${"in force ↓ / proposal →".padEnd(26)}${m.outcomes.map((o) => show(o).padStart(6)).join("")}\n`);
    for (const from of m.outcomes) {
      const row = m.cells[from] ?? {};
      if (Object.keys(row).length === 0) continue;
      out.write(`  ${show(from).padEnd(26)}${m.outcomes.map((to) => String(row[to] ?? "·").padStart(6)).join("")}\n`);
    }
    out.write("  reference examples:\n");
    for (const e of w.examples) {
      const fmt = (s: string[]) => (s.length === 1 ? show(s[0] ?? "") : `{${s.map(show).join(", ")}}`);
      const mark = fmt(e.from) === fmt(e.to) ? " " : "*";
      const implied = e.implied.length > 0 ? `  (implied: ${e.implied.join(", ")})` : "";
      out.write(`   ${mark} ${e.example.padEnd(30)} ${fmt(e.from).padEnd(18)} → ${fmt(e.to)}${implied}\n`);
    }
    out.write("\n");
  }
  return 0;
}
