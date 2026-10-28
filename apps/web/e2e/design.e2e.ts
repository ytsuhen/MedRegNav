// The look of DECISIONS U12 in the preinstalled Chromium: the three voices are the bundled fonts, the waves draw — the
// river in the masthead, the sea under the work area that stays in view as the page scrolls, none inside the islands —
// (on a 2D canvas without a graphics card, in WebGL2 when a software one is allowed, where the sea whirls round the
// device and its wavelets run along the lines to the branches), the legend stays on the map, a press shimmers and the
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
    options: { motion?: boolean; width?: number; height?: number; anyGl?: boolean; on?: Browser; dark?: boolean } = {},
  ): Promise<Page> {
    const context = await (options.on ?? browser).newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
      reducedMotion: options.motion ? "no-preference" : "reduce",
      colorScheme: options.dark ? "dark" : "light",
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

  type Clip = { x: number; y: number; width: number; height: number };

  /**
   * How much each clip of the page changes from one screenshot to the next, `n` shots `every` ms apart: the mean of
   * |Δr| + |Δg| + |Δb| per pixel and step (0..765), decoded in a blank page of the same browser.
   */
  async function motion(page: Page, clips: Record<string, Clip>, n = 6, every = 400): Promise<Record<string, number>> {
    const shots: Record<string, string[]> = {};
    for (let i = 0; i < n; i++) {
      for (const [name, clip] of Object.entries(clips))
        shots[name] = [...(shots[name] ?? []), (await page.screenshot({ clip })).toString("base64")];
      await page.waitForTimeout(every);
    }
    const blank = await page.context().newPage();
    const result = await blank.evaluate(async (all: Record<string, string[]>) => {
      const pixels = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const out: Record<string, number> = {};
      for (const [name, list] of Object.entries(all)) {
        const frames = await Promise.all(list.map(pixels));
        let sum = 0;
        for (let k = 1; k < frames.length; k++) {
          const [a, b] = [frames[k - 1] as Uint8ClampedArray, frames[k] as Uint8ClampedArray];
          for (let i = 0; i < a.length; i += 4)
            sum +=
              Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
              Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
              Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
        }
        out[name] = sum / ((frames[0]?.length ?? 4) / 4) / Math.max(1, frames.length - 1);
      }
      return out;
    }, shots);
    await blank.close();
    return result;
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

  it("draws the river in the masthead and the sea under the work area on a 2D canvas without a graphics card", async () => {
    const page = await open("x=heartbeat-app", { motion: true });
    for (const id of ["waves-river", "waves-sea"])
      await expect.poll(() => page.getByTestId(id).getAttribute("data-renderer")).toBe("2d");
    expect(await page.locator("header.masthead [data-testid=waves-river]").count()).toBe(1);
    expect(await page.locator("main.workspace > .page-sea > [data-testid=waves-sea]").count()).toBe(1);
    // Text stands on islands: no water inside the description, the map or the card.
    expect(await page.locator(".island canvas, [data-testid=map] canvas, [data-testid=card] canvas").count()).toBe(0);
    await page.context().close();
    // One screen of water that stays in view as a long page scrolls.
    const long = await open("x=heartbeat-app&v=checklist", { motion: true });
    const sea = await long.evaluate(() => {
      window.scrollTo(0, 600);
      const box = document.querySelector("[data-testid=waves-sea]")?.getBoundingClientRect();
      return { top: box?.top, height: box?.height, page: document.documentElement.scrollHeight };
    });
    expect(sea.page).toBeGreaterThan(2 * 900);
    expect(sea).toMatchObject({ top: 0, height: 900 });
    await long.context().close();
  });

  it("draws them in WebGL2 when a software graphics card is allowed: the sea whirls round the device, wavelets run to the branches", async () => {
    const page = await open("x=heartbeat-app&b=market", { motion: true, anyGl: true, on: softwareGl });
    for (const id of ["waves-river", "waves-sea"])
      await expect.poll(() => page.getByTestId(id).getAttribute("data-renderer")).toBe("webgl2");
    const sea = page.getByTestId("waves-sea");
    // The whirlpool turns round the device's node, within its corners' circle (not round the whole window): the
    // largest gap between where the water turns and the node, in px.
    const gap = async () => {
      const [x, y, r] = ((await sea.getAttribute("data-whirlpool")) ?? "").split(" ").map(Number);
      const d = await page.getByTestId("device-node").evaluate((el) => {
        const b = el.getBoundingClientRect();
        return [b.left + b.width / 2 + scrollX, b.top + b.height / 2 + scrollY, Math.hypot(b.width, b.height) / 2];
      });
      return Math.max(...[x, y, r].map((v, i) => Math.abs((v ?? Number.NaN) - (d[i] ?? 0))));
    };
    await expect.poll(gap, { timeout: 8000 }).toBeLessThan(3);
    // The wavelets run along the six lines from the device to the branches, not along the lines to the leaves.
    await expect.poll(() => sea.getAttribute("data-wavelines")).toBe("6");
    await page.context().close();
  });

  it("moves the water right round the device and along its lines, keeps the open sea calm, and stands still under reduced motion", async () => {
    // A blank description: the margin card is short, so the right column under it is open sea.
    const page = await open("p=", { motion: true, anyGl: true, on: softwareGl, dark: true });
    await expect.poll(() => page.getByTestId("waves-sea").getAttribute("data-wavelines")).toBe("6");
    await page.evaluate(() => {
      const r = document.querySelector(".react-flow [data-whirl]")?.getBoundingClientRect();
      if (r) window.scrollTo(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
    });
    await page.waitForTimeout(800);
    const [device, card] = await page.evaluate(() =>
      [".react-flow [data-whirl]", "[data-testid=card]"].map((s) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return { left: r?.left ?? 0, top: r?.top ?? 0, right: r?.right ?? 0, bottom: r?.bottom ?? 0 };
      }),
    );
    if (!device || !card) throw new Error("no device or card");
    const clips = {
      // Just above the device: the whirlpool, and no line.
      whirl: { x: device.left + 40, y: device.top - 34, width: device.right - device.left - 80, height: 24 },
      // The gutter right of the device: the whirlpool too, and three lines with their wavelets.
      gutter: { x: device.right + 4, y: device.top + 10, width: 28, height: device.bottom - device.top - 20 },
      // Open sea in the right column, under the margin card.
      far: { x: card.left + 20, y: card.bottom + 24, width: card.right - card.left - 40, height: 160 },
    };
    const moving = await motion(page, clips);
    const [whirl, gutter, far] = [moving.whirl ?? 0, moving.gutter ?? 0, moving.far ?? 0];
    expect(far).toBeLessThan(3);
    expect(whirl).toBeGreaterThan(2 * far);
    expect(gutter).toBeGreaterThan(1.3 * whirl);
    await page.context().close();
    // Reduced motion: the same water in two frames is the same.
    const still = await open("p=", { anyGl: true, on: softwareGl, dark: true });
    await expect.poll(() => still.getByTestId("waves-sea").getAttribute("data-renderer")).toBe("webgl2");
    await still.evaluate(() => {
      const r = document.querySelector(".react-flow [data-whirl]")?.getBoundingClientRect();
      if (r) window.scrollTo(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
    });
    await still.waitForTimeout(500);
    const frozen = await motion(still, { whirl: clips.whirl, gutter: clips.gutter }, 3, 600);
    expect(frozen).toEqual({ whirl: 0, gutter: 0 });
    await still.context().close();
  });

  it("keeps the legend on the map, beside a requirement's card and while the guided run is on", async () => {
    const page = await open("x=heartbeat-app&b=market&s=o.route-iib");
    const legend = page.getByTestId("map-legend");
    expect(await legend.isVisible()).toBe(true);
    expect(await page.locator("[data-testid=card] [data-testid=map-legend]").count()).toBe(0);
    await page.getByTestId("guided-start").click();
    await page.getByTestId("guided").waitFor();
    // The run's card stands between the description and the map; the legend stays in view under it.
    const top = await legend.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(900 - 100);
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
