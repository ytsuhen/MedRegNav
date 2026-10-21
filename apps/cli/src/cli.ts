// `pnpm mrn <command>`: the command line. All file I/O lives in apps/; @mrn/core stays pure.
import { argv, exit, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { coverageCommand, mcdcCommand, whatifCommand } from "./commands/analysis.ts";
import { check, cite } from "./commands/cite.ts";
import { obligationsCommand } from "./commands/obligations.ts";
import { evalCommand, rules } from "./commands/rules.ts";
import { extract, quote, sections } from "./commands/sources.ts";
import { snapshotCommand } from "./snapshot.ts";

export interface Out {
  write(text: string): unknown;
}

export interface Command {
  usage: string;
  summary: string;
  run(args: string[], out: Out): Promise<number>;
}

export const COMMANDS: Record<string, Command> = {
  help: {
    usage: "help",
    summary: "this list",
    run: async (_args, out) => {
      out.write("Usage: pnpm mrn <command> [args]\n\n");
      const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length));
      for (const command of Object.values(COMMANDS))
        out.write(`  ${command.usage.padEnd(width)}  ${command.summary}\n`);
      return 0;
    },
  },
  extract: {
    usage: "extract [<source>…|--all]",
    summary: "original (XHTML/PDF) → data/sources/<id>/text.txt, recorded in meta.json",
    run: extract,
  },
  sections: {
    usage: "sections [<source>…|--all]",
    summary: "text.txt + outline.json → sections.json",
    run: sections,
  },
  quote: {
    usage: "quote <source>[/<section>] [--find <text>|--at a:b]",
    summary: "show a section (or list sections) and highlight a quote",
    run: quote,
  },
  cite: {
    usage: "cite [--write] [<file>…]",
    summary: "pin citations in data files: sha256 + offsets from each quote",
    run: cite,
  },
  rules: {
    usage: "rules [--rehash]",
    summary: "validate data/rules against the schema, each other and the attribute registry",
    run: rules,
  },
  eval: {
    usage: "eval <example-id|profile.json> [--asof YYYY-MM-DD]",
    summary: "evaluate a device profile: every rule's result, its support and the decisive unknowns",
    run: evalCommand,
  },
  obligations: {
    usage: "obligations <example-id|profile.json> [--asof YYYY-MM-DD] [--proposals]",
    summary: "the obligations catalogue for a device: what applies, from when, how, with citations",
    run: obligationsCommand,
  },
  coverage: {
    usage: "coverage",
    summary: "every rule on every combination of its inputs (attributes incl. unknown, results of the rules it reads)",
    run: coverageCommand,
  },
  mcdc: {
    usage: "mcdc",
    summary: "MC/DC: per leaf, a pair of real inputs where the leaf alone changes the outcome",
    run: mcdcCommand,
  },
  whatif: {
    usage: "whatif",
    summary: "proposed revisions (data/whatif.json): diff, cohort transition matrix, reference examples",
    run: whatifCommand,
  },
  snapshot: {
    usage: "snapshot [--out <dir>]",
    summary: "the web app's data: model, presentation, examples and the cited sections' texts",
    run: snapshotCommand,
  },
  check: {
    usage: "check",
    summary: "every data check: originals, text, sections, citations, rules, reference examples",
    run: check,
  },
};

/** Runs one command; resolves to the process exit code (0 ok, 1 failed check, 2 usage error). */
export async function runCli(args: string[], out: Out = stdout): Promise<number> {
  const [name = "help", ...rest] = args;
  const command = COMMANDS[name];
  if (!command) {
    out.write(`unknown command: ${name}\n`);
    await COMMANDS.help?.run([], out);
    return 2;
  }
  return command.run(rest, out);
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  runCli(argv.slice(2)).then(
    (code) => exit(code),
    (error: unknown) => {
      stdout.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      exit(1);
    },
  );
}
