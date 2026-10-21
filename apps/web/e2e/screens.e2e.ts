// The README's screenshots, taken from the static build (Ukrainian unless noted, 1440 × 900 unless noted, as of
// 21 Oct 2026).
// Opt-in, because it writes files:
//   MRN_DOCS_SCREENS=docs/screens pnpm e2e apps/web/e2e/screens.e2e.ts
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, it } from "vitest";
import { webConfig } from "../vite.config.ts";
import { chromiumPath, type StaticServer, serveDirectory } from "./browser.ts";

const out = process.env.MRN_DOCS_SCREENS ? resolve(process.env.MRN_DOCS_SCREENS) : "";
const DATE = "d=2026-10-21";
const AI_PROFILE =
  "p=isSoftware.y_medicalPurpose.y_actsOnData.y_individualPatients.y_drivesDevice.n_accessory.n_annexXvi.n_decisionInfo.y_decisionImpact.other_monitorsPhysiological.n_isAiSystem.y_aiRole.device_manufacturerOutsideEu.n_interactsWithPersons.n";
// IIa under Rule 11 (decision information, no serious impact); I under COM(2025) 1023 (non-serious, informs).
const INFORMS =
  "p=isSoftware.y_medicalPurpose.y_actsOnData.y_individualPatients.y_drivesDevice.n_decisionInfo.y_decisionImpact.other_monitorsPhysiological.n_imdrfSituation.non-serious_imdrfSignificance.inform_clinicalBenefitOutput.y_manufacturerOutsideEu.n_isAiSystem.n";

describe.skipIf(!out)("README screenshots", () => {
  let dir = "";
  let site: StaticServer;
  let browser: Browser;

  beforeAll(async () => {
    mkdirSync(out, { recursive: true });
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

  async function open(
    hash: string,
    options: { width?: number; height?: number; dark?: boolean; lang?: "uk" | "en" } = {},
  ): Promise<Page> {
    const context = await browser.newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
      reducedMotion: "reduce",
      colorScheme: options.dark ? "dark" : "light",
    });
    await context.addInitScript((lang) => window.localStorage.setItem("mrn.lang", lang), options.lang ?? "uk");
    const page = await context.newPage();
    await page.goto(`${site.url}#${hash}`);
    await page.locator("[data-testid=ladder], [data-testid=checklist]").first().waitFor();
    await page.waitForTimeout(400);
    return page;
  }
  const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) });

  it("the map: a requirement's card, cause and effect on hover", async () => {
    const page = await open(`x=heartbeat-app&${DATE}&b=market&s=o.route-iib`);
    await page.locator('[data-testid=quote][data-verified="true"]').first().waitFor({ state: "attached" });
    await page.getByTestId("leaf-o.route-iib").getByRole("button").hover();
    await shot(page, "01-map");
    await page.context().close();
  });

  it("why this class: the rule's witnesses with their quotes", async () => {
    const page = await open(`x=heartbeat-app&${DATE}&b=class&s=r.eu-mdr-classification`);
    await shot(page, "02-why-class");
    await page.context().close();
  });

  it("the as-of date: AI Act requirements in force from 2 August 2028", async () => {
    const page = await open(`${AI_PROFILE}&d=2028-08-02&b=ai&s=o.ai-oversight-art14`);
    await shot(page, "03-ai-2028");
    await page.context().close();
  });

  it("a blank sheet: every class possible, a question on every pencil branch", async () => {
    const page = await open(`p=&${DATE}`);
    await shot(page, "04-blank");
    await page.context().close();
  });

  it("the checklist, on a desktop and on a phone", async () => {
    const page = await open(`x=heartbeat-app&${DATE}&v=checklist`);
    await shot(page, "05-checklist");
    await page.context().close();
    const phone = await open(`x=heartbeat-app&${DATE}`, { width: 390, height: 844 });
    await shot(phone, "06-phone");
    await phone.context().close();
  });

  it("proposed changes: the class under COM(2025) 1023 in red pen, the card's comparison", async () => {
    const page = await open(`${INFORMS}&${DATE}&b=class&s=r.eu-mdr-classification&w=1`, { height: 1200 });
    // Scroll the card alone (the page keeps its banner) to what would change: the requirements and the cohort.
    await page
      .getByTestId("card")
      .locator(".proposal-changes")
      .evaluate((list) => {
        const card = list.closest<HTMLElement>(".card");
        if (card) card.scrollTop = (list as HTMLElement).offsetTop - 64;
      });
    await shot(page, "08-proposal");
    await page.context().close();
  });

  it("the dark scheme, in English", async () => {
    const page = await open(`x=heartbeat-app&${DATE}&b=qms&s=o.software-lifecycle`, { dark: true, lang: "en" });
    await page.locator('[data-testid=quote][data-verified="true"]').first().waitFor({ state: "attached" });
    await shot(page, "07-dark-en");
    await page.context().close();
  });
});
