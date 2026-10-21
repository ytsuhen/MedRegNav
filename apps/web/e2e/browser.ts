// Shared by the e2e tests: the preinstalled Chromium (never downloaded) and a minimal static file server that serves
// a directory under a sub-path, as GitHub Pages serves a project site (/MedRegNav/).
// Adapted from vlk-engine (apps/demo/e2e/browser.ts), Apache-2.0, same author.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";

/** The preinstalled Chromium (MRN_CHROMIUM, else PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers). */
export function chromiumPath(): string {
  if (process.env.MRN_CHROMIUM) return process.env.MRN_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  const dir = existsSync(root) ? readdirSync(root).find((d) => /^chromium-\d+$/.test(d)) : undefined;
  const exe = dir ? join(root, dir, "chrome-linux", "chrome") : "";
  if (!exe || !existsSync(exe)) {
    throw new Error(`no Chromium under ${root}: set MRN_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH`);
  }
  return exe;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
};

export interface StaticServer {
  /** The site's URL, ending in the sub-path and a slash. */
  url: string;
  /** Every path requested, in order. */
  requests: string[];
  close(): Promise<void>;
}

/** Serves `root` under `base` (e.g. "/MedRegNav/"); anything outside it is 404. */
export async function serveDirectory(root: string, base: string): Promise<StaticServer> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    requests.push(path);
    let file = path.startsWith(base) ? normalize(join(root, decodeURIComponent(path.slice(base.length)))) : "";
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file || !(file === root || file.startsWith(root + sep)) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${base}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
