// `pnpm mrn <command>`: the command line. All file I/O lives in apps/; @mrn/core stays pure.
import { argv, exit, stdout } from "node:process";
import { pathToFileURL } from "node:url";

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
