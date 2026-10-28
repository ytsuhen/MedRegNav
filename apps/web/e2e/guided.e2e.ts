// The guided run (DECISIONS U13) in the preinstalled Chromium, on the three descriptions the demo is shown with: the
// heartbeat app (it reaches class IIb from the description alone), a blank sheet (every question asked in the card)
// and a wearable recorder's link with most answers unknown. Each question comes once; the step is in the link; the
// keys work; the card is a live region between the description and the map, brought to the top when the run starts;
// it works on a phone and in the checklist; a step shimmers what it changed.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webConfig } from "../vite.config.ts";
import { chromiumPath, type StaticServer, serveDirectory } from "./browser.ts";

const DATE = "d=2026-10-21";
const WEARABLE = "p=isSoftware.y_actsOnData.y_individualPatients.y_isAiSystem.y";

describe("the guided run in Chromium", () => {
  let dir = "";
  let site: StaticServer;
  let browser: Browser;
  const errors: string[] = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "mrn-web-"));
    await build({ ...webConfig({ outDir: dir }), configFile: false, logLevel: "warn" });
    site = await serveDirectory(dir, "/MedRegNav/");
    browser = await chromium.launch({ executablePath: chromiumPath() });
  });

  afterAll(async () => {
    await browser?.close();
    await site?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function open(hash: string, options: { width?: number; height?: number; motion?: boolean } = {}) {
    const context = await browser.newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
      reducedMotion: options.motion ? "no-preference" : "reduce",
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

  const card = (page: Page) => page.getByTestId("guided");
  const position = (page: Page) => card(page).getByTestId("guided-position").textContent();

  /** Ticks the run on: its row comes up at the blank sheet, paused. */
  async function start(page: Page) {
    await page.getByTestId("guided-check").check();
    await card(page).waitFor();
    expect(await card(page).getByTestId("guided-play").getAttribute("aria-pressed")).toBe("false");
    expect(await position(page)).toBe("Початок");
  }

  /**
   * Walks to the summary: Next on a step, "don't know" on a question the description leaves open. Returns each
   * step's question and answer line, and the class on the ladder after each step (map only).
   */
  async function walk(page: Page) {
    const steps: { question: string; answer: string; ladder: string | null }[] = [];
    for (let i = 0; i < 60; i++) {
      if ((await card(page).getByTestId("guided-summary").count()) > 0) return steps;
      const question = card(page).getByTestId("guided-question");
      if ((await question.count()) > 0) {
        if ((await position(page))?.includes("Чекає на вашу відповідь")) {
          await card(page).getByTestId("guided-ask").getByLabel("Не знаю").check();
          expect(await position(page)).not.toContain("Чекає");
        }
        const ladder = page.getByTestId("ladder");
        steps.push({
          question: (await question.textContent()) ?? "",
          answer: (await card(page).getByTestId("guided-answer").textContent()) ?? "",
          ladder: (await ladder.count()) > 0 ? await ladder.getAttribute("aria-label") : null,
        });
      }
      await card(page).getByTestId("guided-next").click();
    }
    throw new Error("the run did not reach its summary");
  }

  it("takes the heartbeat app to class IIb from the description, then asks what the description lacks", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`);
    await start(page);
    expect(await card(page).getByTestId("guided-blank").getAttribute("aria-live")).toBe("polite");
    // Started with a press, the card comes to the top of the window (as far as the page scrolls), the map under it.
    const atTop = () =>
      card(page).evaluate((el) => {
        const top = el.getBoundingClientRect().top;
        const end = document.documentElement.scrollHeight - window.innerHeight;
        return (
          window.scrollY > 0 && top >= 0 && top < window.innerHeight / 3 && (top < 20 || window.scrollY >= end - 1)
        );
      });
    await expect.poll(atTop).toBe(true);
    expect(await page.getByTestId("ladder").getAttribute("aria-label")).toBe(
      "Можливі класи: I, IIa, IIb, III. Відкрити пояснення",
    );
    const steps = await walk(page);
    const questions = steps.map((s) => s.question);
    expect(new Set(questions).size).toBe(questions.length);
    const iib = steps.findIndex((s) => s.ladder === "Клас IIb. Відкрити пояснення");
    expect(iib).toBeGreaterThan(0);
    // Up to the class every answer is the description's; then the questions it leaves open, answered "don't know".
    expect(steps.slice(0, iib + 1).every((s) => s.answer.startsWith("З опису:"))).toBe(true);
    expect(steps.slice(iib + 1).some((s) => s.answer.startsWith("Не знаю"))).toBe(true);
    const results = card(page).getByTestId("guided-results");
    expect(await results.textContent()).toContain("Клас за MDR (додаток VIII, правило 11): Клас IIb");
    const acts = (await card(page).getByTestId("guided-acts").textContent()) ?? "";
    expect(acts).toContain("MDR");
    expect(acts).toContain("Article 52");
    expect(acts).toMatch(/чинне з 26\.05\.2021/);
    expect(await position(page)).toBe("Підсумок");
    expect(page.url()).toMatch(/[#&]g=\d+/);
    // Ticking the run off keeps the description and the answers given on the way.
    await page.getByTestId("guided-check").uncheck();
    expect(await page.getByTestId("guided").count()).toBe(0);
    expect(await page.getByTestId("ladder").getAttribute("aria-label")).toBe("Клас IIb. Відкрити пояснення");
    expect(page.url()).not.toContain("g=");
    await page.context().close();
  });

  it("asks every question on a blank sheet, in the card, each once", async () => {
    const page = await open(`p=&${DATE}`);
    await start(page);
    const steps = await walk(page);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.every((s) => s.answer.startsWith("Не знаю"))).toBe(true);
    const questions = steps.map((s) => s.question);
    expect(new Set(questions).size).toBe(questions.length);
    expect(await page.getByTestId("ladder").getAttribute("aria-label")).toBe(
      "Можливі класи: I, IIa, IIb, III. Відкрити пояснення",
    );
    expect(await card(page).getByTestId("guided-unknown").locator("li").count()).toBeGreaterThan(0);
    await page.context().close();
  });

  it("walks the wearable recorder's link with most answers unknown", async () => {
    const page = await open(`${WEARABLE}&${DATE}`);
    await start(page);
    const steps = await walk(page);
    const fromLink = steps.filter((s) => s.answer.startsWith("З опису:"));
    expect(fromLink.length).toBe(4);
    expect(steps.filter((s) => s.answer.startsWith("Не знаю")).length).toBeGreaterThan(4);
    expect(await card(page).getByTestId("guided-summary").textContent()).toMatch(/з опису — 4/);
    await page.context().close();
  });

  it("keeps the step in the link, and steps with the keys", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`);
    await start(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect(await position(page)).toMatch(/^Крок 2 з \d+$/);
    await page.keyboard.press("ArrowLeft");
    expect(await position(page)).toMatch(/^Крок 1 з \d+$/);
    await expect.poll(() => page.url()).toContain("g=1");
    await page.keyboard.press(" ");
    expect(await card(page).getByTestId("guided-play").getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press(" ");
    expect(await card(page).getByTestId("guided-play").getAttribute("aria-pressed")).toBe("false");
    // The link opens the same step, paused, and leaves the page at its top, with the banner.
    const again = await open(new URL(page.url()).hash.slice(1));
    expect(await again.getByTestId("guided").getByTestId("guided-position").textContent()).toMatch(/^Крок 1 з \d+$/);
    expect(await again.getByTestId("guided-play").getAttribute("aria-pressed")).toBe("false");
    expect(await again.evaluate(() => window.scrollY)).toBe(0);
    await again.context().close();
    await page.context().close();
  });

  it("works with the keys right after the tick, and turns off from its own row", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`);
    // A real click: the focus moves on from the tick (scrolled away) to ▶, so space plays rather than ticks it off.
    await page.getByTestId("guided-check").click();
    await card(page).waitFor();
    await page.keyboard.press(" ");
    expect(await card(page).getByTestId("guided-play").getAttribute("aria-pressed")).toBe("true");
    expect(await page.getByTestId("guided").count()).toBe(1);
    await page.keyboard.press(" ");
    await page.keyboard.press("ArrowRight");
    expect(await position(page)).toMatch(/^Крок 1 з \d+$/);
    await card(page).getByTestId("guided-off").click();
    expect(await page.getByTestId("guided").count()).toBe(0);
    expect(await page.getByTestId("guided-check").isChecked()).toBe(false);
    // The focus goes back to the tick.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
      .toBe("guided-check");
    await page.context().close();
  });

  it("folds down to its one row and keeps going", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`);
    await start(page);
    const fold = card(page).getByTestId("guided-fold");
    const body = card(page).locator("#guided-body");
    const height = () => card(page).evaluate((el) => el.getBoundingClientRect().height);
    const unfolded = await height();
    await fold.click();
    expect(await fold.getAttribute("aria-expanded")).toBe("false");
    expect(await body.isVisible()).toBe(false);
    expect(await height()).toBeLessThan(Math.min(unfolded, 60));
    await card(page).getByTestId("guided-next").click();
    expect(await position(page)).toMatch(/^Крок 1 з \d+$/);
    // Folded, the card still opens at a question that waits for an answer, with the answers to pick from.
    for (let i = 0; i < 30 && !(await position(page))?.includes("Чекає"); i++)
      await card(page).getByTestId("guided-next").click();
    expect(await position(page)).toContain("Чекає на вашу відповідь");
    expect(await body.isVisible()).toBe(true);
    expect(await card(page).getByTestId("guided-ask").isVisible()).toBe(true);
    await page.context().close();
  });

  it("plays a step every four seconds", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`);
    await start(page);
    await card(page).getByTestId("guided-play").click();
    expect(await position(page)).toBe("Початок");
    await expect.poll(() => position(page), { timeout: 6000 }).toMatch(/^Крок 1 з \d+$/);
    await card(page).getByTestId("guided-play").click();
    await page.context().close();
  });

  it("works on a phone, in the checklist, between the description and the checklist", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`, { width: 390, height: 844 });
    await page.getByTestId("checklist").waitFor();
    await start(page);
    const between = await page.evaluate(() => {
      const [chips, guided, list] = ["device-chips", "guided", "checklist"].map((id) =>
        document.querySelector(`[data-testid=${id}]`),
      );
      const before = (a: Element | null | undefined, b: Element | null | undefined) =>
        !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return before(chips, guided) && before(guided, list);
    });
    expect(between).toBe(true);
    for (let i = 0; i < 6; i++) await card(page).getByTestId("guided-next").click();
    expect(await page.getByTestId("check-r.eu-mdr-classification").textContent()).toContain("Клас IIb");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await walk(page);
    expect(await card(page).getByTestId("guided-acts").textContent()).toContain("Article 52");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  it("shimmers the chip and the branches a step changed", async () => {
    const page = await open(`x=heartbeat-app&${DATE}`, { motion: true });
    await start(page);
    await card(page).getByTestId("guided-next").click();
    await expect.poll(() => page.getByTestId("sheen").count()).toBeGreaterThan(1);
    await page.context().close();
  });

  it("logs no error", () => {
    expect(errors).toEqual([]);
  });
});
