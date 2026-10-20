// `pnpm mrn rules [--rehash]`: validates the rule set (and refreshes metadata.irHash with --rehash);
// `pnpm mrn eval <example-id | profile.json> [--asof YYYY-MM-DD]`: evaluates a device profile.
import { existsSync } from "node:fs";
import {
  attributesRead,
  type DeviceIr,
  DeviceIrSchema,
  decisiveUnknowns,
  evaluateRules,
  irHash,
  type Profile,
  profileIssues,
  ruleSignature,
  validateRules,
} from "@mrn/core";
import type { Out } from "../cli.ts";
import { readExamples, readJson, readRegistry, readRuleFiles, readRules, repoPath, writeJson } from "../data.ts";

export async function rules(args: string[], out: Out): Promise<number> {
  const files = readRuleFiles();
  if (args.includes("--rehash")) {
    for (const { path, json } of files) {
      const parsed = DeviceIrSchema.safeParse(json);
      if (!parsed.success) continue;
      const ir: DeviceIr = parsed.data;
      const hash = irHash(ir);
      if (ir.metadata.irHash !== hash) {
        writeJson(path, { ...ir, metadata: { ...ir.metadata, irHash: hash } });
        out.write(`${repoPath(path)}: irHash ${hash.slice(0, 12)}…\n`);
      }
    }
  }
  const issues = validateRules(
    readRuleFiles().map((f) => f.json),
    readRegistry(),
  );
  for (const i of issues) out.write(`${i.rule}${i.nodeId ? `/${i.nodeId}` : ""}: ${i.code}: ${i.message}\n`);
  if (issues.length === 0) {
    for (const ir of readRules()) {
      out.write(
        `${ir.id.padEnd(28)} ${ir.role.padEnd(12)} r${ir.metadata.revision} ${ir.metadata.status} · ${ir.nodes.length} nodes, ${ir.criteria.length} criteria, outcomes ${ir.outcomes.map((o) => o.id).join("/")}\n`,
      );
    }
  }
  return issues.length > 0 ? 1 : 0;
}

export async function evalCommand(args: string[], out: Out): Promise<number> {
  const [target] = args.filter((a) => !a.startsWith("--"));
  const asOfAt = args.indexOf("--asof");
  const asOf = asOfAt >= 0 ? args[asOfAt + 1] : undefined;
  if (!target) {
    out.write("usage: pnpm mrn eval <example-id | profile.json> [--asof YYYY-MM-DD]\n");
    return 2;
  }
  const example = readExamples().find((e) => e.id === target);
  const profile: Profile = example ? example.profile : existsSync(target) ? (readJson(target) as Profile) : {};
  if (!example && !existsSync(target)) {
    out.write(`no example or file ${target}\n`);
    return 2;
  }
  const registry = readRegistry();
  const problems = profileIssues(registry, profile);
  for (const p of problems) out.write(`profile: ${p}\n`);
  const ruleSet = readRules();
  const primary = ruleSet.filter((r) => r.role !== "hypothetical");
  const results = evaluateRules(primary, profile, asOf);
  for (const r of Object.values(results)) {
    out.write(
      `${r.ruleId.padEnd(28)} ${r.status.padEnd(14)} ${r.value ?? `{${r.possible.join(", ")}}`}${r.inForce ? "" : " (not in force)"}  ← ${r.support.join(", ")}\n`,
    );
  }
  const questions = decisiveUnknowns(registry, profile, ruleSignature(primary, asOf), attributesRead(primary));
  if (questions.length > 0)
    out.write(`decisive unknowns: ${questions.map((q) => `${q.attr} (${q.affects.join(", ")})`).join("; ")}\n`);
  if (example) {
    for (const e of example.expected) {
      const got = results[e.rule]?.value;
      out.write(`expected ${e.rule} = ${e.outcome}: ${got === e.outcome ? "ok" : `got ${got ?? "undetermined"}`}\n`);
    }
  }
  return problems.length > 0 ? 1 : 0;
}
