// The look of DECISIONS U12 in the preinstalled Chromium: the three voices are the bundled fonts, the waves draw — the
// river in the masthead, the sea under the work area that stays in view as the page scrolls, none inside the islands —
// (on a 2D canvas without a graphics card, in WebGL2 when a software one is allowed, where the sea whirls round the
// device and the lines twinkle in a pigeon's colours, on to the requirements, while the open sea stays calm — on a
// page clock the test steps, so a slow software graphics card does not change what moves between two shots), the
// scheme and the plain look switch, are remembered and paint before the bundle arrives, the plain look stops the waves'
// loops, the legend stays on the map, a press shimmers and the shimmer leaves nothing behind, reduced motion has no
// shimmer, and the map's labels stay inside their nodes on a desktop and on a phone.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webConfig } from "../vite.config.ts";
import { chromiumPath, type StaticServer, serveDirectory } from "./browser.ts";

/** A test that measures the water on screenshots of a software WebGL: a busy machine needs more than the default. */
const SLOW = 120_000;

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
    options: {
      motion?: boolean;
      width?: number;
      height?: number;
      anyGl?: boolean;
      on?: Browser;
      dark?: boolean;
      clock?: boolean;
    } = {},
  ): Promise<Page> {
    const context = await (options.on ?? browser).newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
      reducedMotion: options.motion ? "no-preference" : "reduce",
      colorScheme: options.dark ? "dark" : "light",
    });
    if (options.anyGl) await context.addInitScript(() => Object.assign(window, { __wavesAnyGL: true }));
    // A clock the test steps (`tick`): the page's time (performance.now and the animation frames') stops at the first
    // step and then moves only by steps, so what the water does between two screenshots does not depend on how slowly
    // a software graphics card draws them.
    if (options.clock)
      await context.addInitScript(() => {
        const real = performance.now.bind(performance);
        const frame = window.requestAnimationFrame.bind(window);
        let stopped: number | null = null;
        const now = () => stopped ?? real();
        performance.now = now;
        window.requestAnimationFrame = (callback) => frame(() => callback(now()));
        Object.assign(window, {
          __clock: (ms: number) => {
            stopped = (stopped ?? real()) + ms;
          },
        });
      });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${site.url}#${hash}`);
    await page.locator("[data-testid=ladder], [data-testid=checklist]").first().waitFor();
    return page;
  }

  /** Moves the page's clock on by `ms` and lets the water draw that moment (a page opened with `clock`), or waits. */
  async function tick(page: Page, ms: number): Promise<void> {
    const stepped = await page.evaluate((ms) => {
      const clock = (window as { __clock?: (ms: number) => void }).__clock;
      clock?.(ms);
      return clock !== undefined;
    }, ms);
    if (stepped)
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    else await page.waitForTimeout(ms);
  }

  type Clip = { x: number; y: number; width: number; height: number };

  /**
   * How much each clip of the page changes from one screenshot to the next, `n` shots `every` ms apart (on the page's
   * clock, if it has one): the mean of |Δr| + |Δg| + |Δb| per pixel and step (0..765), decoded in a blank page of the
   * same browser.
   */
  async function motion(page: Page, clips: Record<string, Clip>, n = 6, every = 400): Promise<Record<string, number>> {
    const shots: Record<string, string[]> = {};
    await tick(page, 0);
    for (let i = 0; i < n; i++) {
      for (const [name, clip] of Object.entries(clips))
        shots[name] = [...(shots[name] ?? []), (await page.screenshot({ clip })).toString("base64")];
      await tick(page, every);
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

  /** A spot of the page (viewport px), and the line it lies by with how far along it (px), if any. */
  type Spot = [x: number, y: number, line?: number, along?: number];

  /**
   * At each spot of each group, in `n` screenshots `every` ms apart (on the page's clock, if it has one): whether the
   * pigeon's violet shows there, red and blue both above green by more than 8 (the water's teal and the paper never
   * are). Per group, how many spots show it in some frame, and in each frame; and its drift: how far along the lines
   * (px, within ±40) the violet of one frame best matches the next — 0 if it stays where it is, the way a crest
   * travels if it runs.
   */
  async function violetAt(
    page: Page,
    groups: Record<string, Spot[]>,
    n = 10,
    every = 500,
  ): Promise<Record<string, { ever: number; perFrame: number[]; drift: number }>> {
    const shots: string[] = [];
    await tick(page, 0);
    for (let i = 0; i < n; i++) {
      shots.push((await page.screenshot()).toString("base64"));
      await tick(page, every);
    }
    const blank = await page.context().newPage();
    const result = await blank.evaluate(
      async ({ shots, groups }) => {
        const frames = await Promise.all(
          shots.map(async (b64) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext("2d") as CanvasRenderingContext2D;
            g.drawImage(img, 0, 0);
            return { width: img.width, data: g.getImageData(0, 0, c.width, c.height).data };
          }),
        );
        const out: Record<string, { ever: number; perFrame: number[]; drift: number }> = {};
        const DRIFT = 40;
        for (const [name, spots] of Object.entries(groups)) {
          const ever = new Set<number>();
          // Per frame and line, how many spots show violet at each px along it.
          const longest = new Map<number, number>();
          for (const [, , line, along] of spots)
            if (line !== undefined && along !== undefined) longest.set(line, Math.max(longest.get(line) ?? 0, along));
          const profiles: Map<number, Float32Array>[] = [];
          const perFrame = frames.map(({ width, data }) => {
            const profile = new Map([...longest].map(([line, end]) => [line, new Float32Array(end + 1)]));
            profiles.push(profile);
            let k = 0;
            spots.forEach(([x, y, line, along], i) => {
              const o = (y * width + x) * 4;
              const [r, g, b] = [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0];
              if (Math.min(r - g, b - g) > 8) {
                k++;
                ever.add(i);
                const p = line === undefined ? undefined : profile.get(line);
                if (p && along !== undefined) p[along] = (p[along] ?? 0) + 1;
              }
            });
            return k;
          });
          const match = new Float64Array(2 * DRIFT + 1);
          for (let f = 1; f < profiles.length; f++)
            for (const [line, before] of profiles[f - 1] ?? []) {
              const after = profiles[f]?.get(line);
              if (!after) continue;
              for (let d = -DRIFT; d <= DRIFT; d++)
                for (let s = Math.max(0, -d); s < before.length && s + d < after.length; s++)
                  match[d + DRIFT] = (match[d + DRIFT] ?? 0) + (before[s] ?? 0) * (after[s + d] ?? 0);
            }
          const best = match.indexOf(Math.max(...match));
          out[name] = { ever: ever.size, perFrame, drift: best - DRIFT };
        }
        return out;
      },
      { shots, groups },
    );
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

  it("draws them in WebGL2 when a software graphics card is allowed: the sea whirls round the device, the lines twinkle", async () => {
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
    // The twinkle lies along the six lines from the device to the branches, and on from the open branch along each line
    // to its requirements.
    const leaves = await page.locator(".node-leaf").count();
    expect(leaves).toBeGreaterThan(0);
    await expect.poll(() => sea.getAttribute("data-wavelines")).toBe(`6 ${leaves}`);
    await page.context().close();
  });

  for (const dark of [true, false])
    it(
      `twinkles along the lines in the pigeon's colours, on to the requirements too, and not in the open sea (${dark ? "dark" : "light"})`,
      async () => {
        // A blank description with the market branch open: the margin card is short, so the right column under it is
        // open sea; lines run from the device to the branches and on from the branch to its requirements.
        const page = await open("p=&b=market", {
          motion: true,
          anyGl: true,
          on: softwareGl,
          dark,
          height: 1300,
          clock: true,
        });
        const sea = page.getByTestId("waves-sea");
        await expect.poll(() => sea.getAttribute("data-wavelines")).toMatch(/^6 [1-9]/);
        await page.evaluate(() => {
          const r = document.querySelector(".react-flow [data-whirl]")?.getBoundingClientRect();
          if (r) window.scrollTo(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
        });
        await page.waitForTimeout(800);
        // Spots beside the lines, 6 to 12 px to either side (clear of a line's casing), every px along, none on a
        // node, an island or the card; and a grid of the open sea under the card. The whirlpool only turns the water's
        // teal: the violet is the lines' own.
        const spots = await page.evaluate(() => {
          const covered = [
            ...document.querySelectorAll(".react-flow__node, .island, [data-testid=card], [data-testid=map-legend]"),
          ].map((el) => el.getBoundingClientRect());
          const free = (x: number, y: number) =>
            x >= 0 &&
            y >= 0 &&
            x < innerWidth &&
            y < innerHeight &&
            !covered.some((r) => x > r.left - 4 && x < r.right + 4 && y > r.top - 4 && y < r.bottom + 4);
          const out: Record<"roots" | "onward" | "sea", [number, number, number?, number?][]> = {
            roots: [],
            onward: [],
            sea: [],
          };
          for (const [line, path] of document.querySelectorAll<SVGPathElement>("path[data-wave]").entries()) {
            const m = path.getScreenCTM();
            if (!m) continue;
            const at = (s: number) => {
              const p = path.getPointAtLength(s);
              return [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f] as const;
            };
            const length = path.getTotalLength();
            for (let s = 2; s < length - 2; s++) {
              const [[ax, ay], [bx, by]] = [at(s - 1), at(s + 1)];
              const d = Math.hypot(bx - ax, by - ay) || 1;
              const [nx, ny] = [-(by - ay) / d, (bx - ax) / d];
              for (const off of [-12, -10, -8, -6, 6, 8, 10, 12]) {
                const [x, y] = [Math.round((ax + bx) / 2 + nx * off), Math.round((ay + by) / 2 + ny * off)];
                if (free(x, y)) out[path.dataset.wave === "device" ? "roots" : "onward"].push([x, y, line, s]);
              }
            }
          }
          const card = document.querySelector("[data-testid=card]")?.getBoundingClientRect();
          if (card)
            for (let y = card.bottom + 24; y < Math.min(innerHeight, card.bottom + 224); y += 3)
              for (let x = card.left + 20; x < card.right - 20; x += 3) out.sea.push([Math.round(x), Math.round(y)]);
          return out;
        });
        expect(spots.roots.length).toBeGreaterThan(1000);
        expect(spots.onward.length).toBeGreaterThan(1000);
        expect(spots.sea.length).toBeGreaterThan(2000);
        const violet = await violetAt(page, spots);
        for (const kind of ["roots", "onward"] as const) {
          const { ever, perFrame } = violet[kind] ?? { ever: 0, perFrame: [] };
          // Here and there along the lines from the device and on to the requirements, most of the time, and not all at
          // once: the violet comes and goes, where it is (a crest running along the lines would carry it on).
          expect(ever).toBeGreaterThan(20);
          expect(perFrame.filter((k) => k > 0).length).toBeGreaterThan(2);
          expect(Math.max(...perFrame)).toBeLessThan(ever);
          expect(Math.abs(violet[kind]?.drift ?? 99)).toBeLessThanOrEqual(3);
        }
        // The open sea never takes the pigeon's colours.
        expect(violet.sea?.ever).toBe(0);
        await page.context().close();
      },
      SLOW,
    );

  it(
    "turns the water right round the device, keeps the open sea calm, and stands still under reduced motion",
    async () => {
      // A blank description: the margin card is short, so the right column under it is open sea.
      const page = await open("p=", { motion: true, anyGl: true, on: softwareGl, dark: true, clock: true });
      await expect.poll(() => page.getByTestId("waves-sea").getAttribute("data-wavelines")).toBe("6 0");
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
        // The gutter right of the device, where three lines leave it: the whirlpool's ring.
        gutter: { x: device.right + 4, y: device.top + 10, width: 28, height: device.bottom - device.top - 20 },
        // Open sea in the right column, under the margin card.
        far: { x: card.left + 20, y: card.bottom + 24, width: card.right - card.left - 40, height: 160 },
      };
      const moving = await motion(page, clips);
      const [whirl, gutter, far] = [moving.whirl ?? 0, moving.gutter ?? 0, moving.far ?? 0];
      expect(far).toBeLessThan(3);
      expect(whirl).toBeGreaterThan(2 * far);
      // Beside the device too, well above the open sea (how the lines twinkle, the test above).
      expect(gutter).toBeGreaterThan(2 * far);
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
    },
    SLOW,
  );

  it("switches between light and dark with the masthead's switch, the sea with it, and remembers the choice", async () => {
    // Without motion: the 2D sea is drawn once, so only the switch can redraw it.
    const page = await open("x=heartbeat-app");
    const sea = page.getByTestId("waves-sea");
    await expect.poll(() => sea.getAttribute("data-water")).toBe("shallow");
    const look = () =>
      page.evaluate(() => ({
        theme: document.documentElement.dataset.theme ?? null,
        paper: getComputedStyle(document.body).backgroundColor,
      }));
    const before = await look();
    // The system's scheme until a choice: light here.
    expect(before.theme).toBeNull();
    expect(await page.getByTestId("theme").locator("input[value=light]").isChecked()).toBe(true);
    await page.getByTestId("theme").getByRole("radio", { name: "Темна" }).check();
    const after = await look();
    expect(after.theme).toBe("dark");
    expect(after.paper).not.toBe(before.paper);
    await expect.poll(() => sea.getAttribute("data-water")).toBe("deep");
    // The masthead stays a dark band in both.
    const band = () =>
      page.evaluate(() => getComputedStyle(document.querySelector("header.masthead") as Element).color);
    expect(await band()).toBe("rgb(227, 244, 238)");
    // Remembered in this browser: the next visit opens dark.
    const again = await page.context().newPage();
    await again.goto(page.url());
    await again.locator("[data-testid=ladder]").waitFor();
    expect(await again.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await again.getByTestId("theme").locator("input[value=dark]").isChecked()).toBe(true);
    await page.context().close();
  });

  it("paints the chosen scheme and look before the app's script arrives", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    await context.addInitScript(() => {
      window.localStorage.setItem("mrn.theme", "dark");
      window.localStorage.setItem("mrn.waves", "off");
    });
    const page = await context.newPage();
    // No script but the page's own: what the reader sees while the bundle is on its way.
    await page.route("**/*.js", (route) => route.abort());
    await page.goto(site.url);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await page.evaluate(() => document.documentElement.dataset.waves)).toBe("off");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await context.close();
  });

  it("turns the waves off for the plain look, with either theme, and remembers it", async () => {
    const page = await open("x=heartbeat-app", { motion: true });
    const canvases = () => page.locator("[data-testid=waves-sea], [data-testid=waves-river]").count();
    // How many animation frames the page asks for in a second: the waves' loops ask for every one.
    const frames = () =>
      page.evaluate(async () => {
        let n = 0;
        const ask = window.requestAnimationFrame;
        window.requestAnimationFrame = (callback) => {
          n++;
          return ask.call(window, callback);
        };
        await new Promise((resolve) => setTimeout(resolve, 1000));
        window.requestAnimationFrame = ask;
        return n;
      });
    await expect.poll(canvases).toBe(2);
    expect(await frames()).toBeGreaterThan(20);
    await page.getByTestId("waves").getByRole("radio", { name: "Без хвиль" }).check();
    await expect.poll(canvases).toBe(0);
    expect(await page.evaluate(() => document.documentElement.dataset.waves)).toBe("off");
    // Their loops stopped with them: once the press's own shimmer is over, nothing is left drawing.
    await expect.poll(() => page.getByTestId("sheen").count(), { timeout: 3000 }).toBe(0);
    expect(await frames()).toBe(0);
    // The plain look in the dark scheme too; the islands, the map and the masthead as before.
    await page.getByTestId("theme").getByRole("radio", { name: "Темна" }).check();
    expect(await canvases()).toBe(0);
    expect(await page.getByTestId("map-legend").isVisible()).toBe(true);
    // Remembered: the next visit opens plain; the waves come back with «Хвилі».
    const again = await page.context().newPage();
    await again.goto(page.url());
    await again.locator("[data-testid=ladder]").waitFor();
    expect(await again.locator("[data-testid=waves-sea], [data-testid=waves-river]").count()).toBe(0);
    await again.getByTestId("waves").getByRole("radio", { name: "Хвилі" }).check();
    await expect.poll(() => again.locator("[data-testid=waves-sea], [data-testid=waves-river]").count()).toBe(2);
    await page.context().close();
  });

  it("keeps the legend on the map, beside a requirement's card and while the guided run is on", async () => {
    const page = await open("x=heartbeat-app&b=market&s=o.route-iib");
    const legend = page.getByTestId("map-legend");
    expect(await legend.isVisible()).toBe(true);
    expect(await page.locator("[data-testid=card] [data-testid=map-legend]").count()).toBe(0);
    await page.getByTestId("guided-check").check();
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
