// Developer aid (not a test): serves the built site and saves screenshots of the given hashes.
//   pnpm exec tsx apps/web/e2e/peek.ts <outDir> <width>x<height> [hash…]
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromiumPath, serveDirectory } from "./browser.ts";

const [out = ".", size = "1440x900", ...hashes] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const site = await serveDirectory(resolve("apps/web/dist"), "/MedRegNav/");
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({
  viewport: { width: width ?? 1440, height: height ?? 900 },
  reducedMotion: "reduce",
  colorScheme: process.env.PEEK_DARK === "1" ? "dark" : "light",
  deviceScaleFactor: Number(process.env.PEEK_SCALE ?? 1),
});
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
for (const [i, hash] of (hashes.length > 0 ? hashes : [""]).entries()) {
  await page.goto(`${site.url}${hash ? `#${hash}` : ""}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, `peek-${i}.png`), fullPage: process.env.PEEK_FULL !== "0" });
}
const foreign = site.requests.filter((p) => !p.startsWith("/MedRegNav/"));
console.log(JSON.stringify({ errors, foreign, requests: site.requests.length }));
await browser.close();
await site.close();
