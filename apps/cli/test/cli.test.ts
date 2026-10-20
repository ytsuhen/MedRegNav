import { describe, expect, it } from "vitest";
import { COMMANDS, runCli } from "../src/cli.ts";

function capture() {
  let text = "";
  return { out: { write: (s: string) => (text += s) }, text: () => text };
}

describe("runCli", () => {
  it("lists every command in help", async () => {
    const { out, text } = capture();
    expect(await runCli(["help"], out)).toBe(0);
    for (const name of Object.keys(COMMANDS)) expect(text()).toContain(name);
  });

  it("rejects an unknown command with a usage error", async () => {
    const { out, text } = capture();
    expect(await runCli(["nope"], out)).toBe(2);
    expect(text()).toContain("unknown command: nope");
  });
});
