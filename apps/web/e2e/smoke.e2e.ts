// The static build in the preinstalled Chromium, served under a sub-path as GitHub Pages serves it (/MedRegNav/):
// it works offline (no request leaves the site), always shows the banner, opens the first preset, settles a pencil
// branch from its inline question, shows a requirement's card with a quote verified in the browser, moves the AI
// Act requirements into force with the as-of control, and offers the checklist (the default on a phone).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webConfig } from "../vite.config.ts";
import { chromiumPath, type StaticServer, serveDirectory } from "./browser.ts";

const AI =
  "x=ai-class-iia&p=isSoftware.y_medicalPurpose.y_actsOnData.y_individualPatients.y_drivesDevice.n_accessory.n_annexXvi.n_decisionInfo.y_decisionImpact.other_monitorsPhysiological.n_isAiSystem.y_aiRole.device_manufacturerOutsideEu.n_interactsWithPersons.n";

describe("the static build in Chromium", () => {
  let dir = "";
  let site: StaticServer;
  let browser: Browser;
  let page: Page;
  const outside: string[] = [];
  const errors: string[] = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "mrn-web-"));
    await build({ ...webConfig({ outDir: dir }), configFile: false, logLevel: "warn" });
    site = await serveDirectory(dir, "/MedRegNav/");
    browser = await chromium.launch({ executablePath: chromiumPath() });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page = await context.newPage();
    page.on("request", (r) => {
      if (!r.url().startsWith(site.url) && !r.url().startsWith("data:")) outside.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  });

  afterAll(async () => {
    await browser?.close();
    await site?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const go = async (hash: string) => {
    await page.goto(`${site.url}#${hash}`);
    await page.getByTestId("ladder").waitFor();
  };
  const state = (testId: string) => page.getByTestId(testId).getAttribute("data-state");

  it("opens the first preset with the banner", async () => {
    await page.goto(site.url);
    await page.getByTestId("ladder").waitFor();
    expect(await page.getByTestId("banner").textContent()).toContain("Демо, не юридична консультація.");
    expect(await page.getByTestId("ladder").getAttribute("aria-label")).toBe("Клас III. Відкрити пояснення");
    expect(page.url()).toContain("x=stroke-image-analysis");
  });

  it("settles a pencil branch from its inline question", async () => {
    await go("x=heartbeat-app");
    expect(await state("branch-market")).toBe("open");
    await page.getByTestId("branch-market").getByRole("button", { name: "Ні" }).click();
    expect(await state("branch-market")).toBe("in-force");
    expect(page.url()).toContain("manufacturerOutsideEu.n");
  });

  it("shows a requirement's card with its quote verified in the browser", async () => {
    await go("x=heartbeat-app&b=market");
    await page.getByTestId("leaf-o.route-iib").getByRole("button").click();
    const card = page.getByTestId("obligation-card");
    await expect.poll(() => card.getByTestId("quote").first().getAttribute("data-verified")).toBe("true");
    expect(await card.textContent()).toMatch(/Перевірено в браузері: sha256 секції [0-9a-f]{12}… збігається/);
  });

  it("puts the AI Act requirements into force on 2 August 2028", async () => {
    await go(`${AI}&d=2028-08-01`);
    expect(await state("branch-ai")).toBe("upcoming");
    await page.getByRole("button", { name: "Наступна ключова дата" }).click();
    await expect.poll(() => state("branch-ai")).toBe("in-force");
    expect(await page.getByTestId("asof").textContent()).toContain("02.08.2028");
  });

  it("switches to the checklist and to English", async () => {
    await go("x=heartbeat-app");
    await page.getByTestId("view").getByRole("radio", { name: "Чекліст" }).check();
    await page.getByTestId("checklist").waitFor();
    expect(await page.getByTestId("check-o.route-iib").getAttribute("data-state")).toBe("in-force");
    await page.getByTestId("lang").getByRole("radio", { name: "Eng" }).check();
    expect(await page.locator("h1").textContent()).toBe("Medical device regulatory navigator");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  it("defaults to the checklist on a phone", async () => {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(`${site.url}#x=heartbeat-app`);
    await phone.getByTestId("checklist").waitFor();
    expect(await phone.getByTestId("map").count()).toBe(0);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await phone.close();
  });

  it("makes no request outside the site and logs no error", () => {
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
