// The look of DECISIONS U12 in the preinstalled Chromium: the three voices are the bundled fonts, the masthead's waves
// draw (on a 2D canvas without a graphics card, in WebGL2 when a software one is allowed), a press shimmers and the
// shimmer leaves nothing behind, reduced motion has no shimmer, and the map's labels stay inside their nodes on a
// desktop and on a phone.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webConfig } from "../vite.config.ts";
import { chromiumPath, type StaticServer, serveDirectory } from "./browser.ts";

describe("the look in Chromium", () => {
  let dir = "";
  let site: StaticServer;
  let browser: Browser;
  let softwareGl: Browser;
  const errors: string[] = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "mrn-web-"));
    await build({ ...webConfig({ outDir: dir }), configFile: false, logLevel: "warn" });
    site = await serveDirectory(dir, "/MedRegNav/");
    browser = await chromium.launch({ executablePath: chromiumPath() });
    softwareGl = await chromium.launch({
      executablePath: chromiumPath(),
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
  });

  afterAll(async () => {
    await browser?.close();
    await softwareGl?.close();
    await site?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function open(
    hash: string,
    options: { motion?: boolean; width?: number; height?: number; anyGl?: boolean; on?: Browser } = {},
  ): Promise<Page> {
    const context = await (options.on ?? browser).newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
      reducedMotion: options.motion ? "no-preference" : "reduce",
    });
    if (options.anyGl) await context.addInitScript(() => Object.assign(window, { __wavesAnyGL: true }));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${site.url}#${hash}`);
    await page.locator("[data-testid=ladder], [data-testid=checklist]").first().waitFor();
    return page;
  }

  it("sets our text in IBM Plex Sans, the law in Source Serif 4 and hashes in JetBrains Mono", async () => {
    const page = await open("x=heartbeat-app&b=market&s=o.route-iib");
    await page.locator('[data-testid=quote][data-verified="true"]').first().waitFor({ state: "attached" });
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const family = (selector: string) => getComputedStyle(document.querySelector(selector) as Element).fontFamily;
      return {
        ui: family("h1"),
        law: family(".quote-text"),
        ladder: family(".ladder-steps"),
        hash: family(".quote-check code"),
        loaded: [
          document.fonts.check('600 16px "IBM Plex Sans Variable"', "Навігатор"),
          document.fonts.check('16px "Source Serif 4 Variable"', "Article"),
          document.fonts.check('16px "JetBrains Mono"', "0a1b"),
        ],
      };
    });
    expect(fonts.ui).toMatch(/^"IBM Plex Sans Variable"/);
    expect(fonts.law).toMatch(/^"Source Serif 4 Variable"/);
    expect(fonts.ladder).toMatch(/^"Source Serif 4 Variable"/);
    expect(fonts.hash).toMatch(/^"JetBrains Mono"/);
    expect(fonts.loaded).toEqual([true, true, true]);
    await page.context().close();
  });

  it("draws the masthead's waves on a 2D canvas without a graphics card", async () => {
    const page = await open("x=heartbeat-app", { motion: true });
    await expect.poll(() => page.getByTestId("hexwaves").getAttribute("data-renderer")).toBe("2d");
    await page.context().close();
  });

  it("draws them in WebGL2 when a software graphics card is allowed", async () => {
    const page = await open("x=heartbeat-app", { motion: true, anyGl: true, on: softwareGl });
    await expect.poll(() => page.getByTestId("hexwaves").getAttribute("data-renderer")).toBe("webgl2");
    await page.context().close();
  });

  it("shimmers what is pressed, briefly, and leaves nothing behind", async () => {
    const page = await open("x=heartbeat-app", { motion: true });
    await page.getByTestId("branch-qms").getByRole("button").first().click();
    expect(await page.getByTestId("sheen").count()).toBe(1);
    await expect.poll(() => page.getByTestId("sheen").count(), { timeout: 3000 }).toBe(0);
    await page.context().close();
  });

  it("does not shimmer under reduced motion", async () => {
    const page = await open("x=heartbeat-app");
    await page.getByTestId("branch-qms").getByRole("button").first().click();
    await page.waitForTimeout(100);
    expect(await page.getByTestId("sheen").count()).toBe(0);
    expect(await page.getByTestId("branch-qms").getAttribute("data-expanded")).toBe("true");
    await page.context().close();
  });

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    it(`keeps every label of the map inside its node at ${width} px`, async () => {
      for (const hash of ["p=&v=map&b=market", "x=heartbeat-app&v=map&b=market", "x=heartbeat-app&v=map&b=qms"]) {
        const page = await open(hash, { width, height });
        await page.waitForTimeout(300);
        // Every text of a node lies within the node (React Flow's edge handles may stick out; they are not text).
        const outside = await page.evaluate(() => {
          const texts =
            ".device-node-name, .device-node-qual, .ladder-steps, .ladder-note, .branch-name, .branch-status, " +
            ".branch-question p, .quick-answers, .leaf-title, .leaf-meta";
          const out: string[] = [];
          for (const node of document.querySelectorAll(".node-device, .node-branch, .node-leaf")) {
            const box = node.getBoundingClientRect();
            for (const el of node.querySelectorAll(texts)) {
              const r = el.getBoundingClientRect();
              if (r.left < box.left - 1 || r.right > box.right + 1) out.push(el.textContent?.slice(0, 40) ?? "");
            }
          }
          return { out, nodes: document.querySelectorAll(".node-branch").length };
        });
        expect(outside.nodes).toBe(6);
        expect(outside.out).toEqual([]);
        await page.context().close();
      }
    });
  }

  it("logs no error", () => {
    expect(errors).toEqual([]);
  });
});
