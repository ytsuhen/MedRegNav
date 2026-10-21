// The obligations catalogue: valid references, a citation for every obligation and every date, and for every class
// the full, determined list with the class-specific items.
import { navigate, type ObligationResult, type Profile } from "@mrn/core";
import { describe, expect, it } from "vitest";
import { checkObligations } from "../src/checks.ts";
import { readExamples, readModel } from "../src/data.ts";

const model = readModel();
const examples = new Map(readExamples().map((e) => [e.id, e]));
const profileOf = (id: string): Profile => {
  const e = examples.get(id);
  if (!e) throw new Error(`no example ${id}`);
  return e.profile;
};
const known = { manufacturerOutsideEu: false, isAiSystem: false };
const applying = (list: ObligationResult[]) => list.filter((o) => o.applies === true).map((o) => o.id);

describe("data/obligations", () => {
  it("reference only registered attributes, existing rule outcomes and known standards", () => {
    expect(checkObligations()).toEqual([]);
  });

  it("cover all six branches, each obligation with its legal basis and the source of its date", () => {
    const branches = new Set(model.obligations.map((o) => o.branch));
    expect([...branches].sort()).toEqual(["ai", "class", "clinical", "cyber", "market", "qms"]);
    for (const o of model.obligations) {
      expect(o.citations.length).toBeGreaterThan(0);
      expect(o.effective.citations.length).toBeGreaterThan(0);
    }
  });
});

describe("the full list for every class", () => {
  const cases: { example: string; extra?: Profile; cls: string; nb: string; has: string[]; not: string[] }[] = [
    {
      example: "fertility-app",
      extra: { measuringFunction: false },
      cls: "I",
      nb: "none",
      has: ["route-i", "pms-report", "udi-carrier-i"],
      not: ["psur", "sscp"],
    },
    {
      example: "ai-class-i-measuring",
      cls: "I",
      nb: "limited",
      has: ["route-im", "pms-report", "class-dispute"],
      not: ["route-i", "psur"],
    },
    {
      example: "chemotherapy-ranking",
      cls: "IIa",
      nb: "full",
      has: ["route-iia", "psur", "udi-carrier-iia-iib"],
      not: ["pms-report", "sscp"],
    },
    {
      example: "heartbeat-app",
      cls: "IIb",
      nb: "full",
      has: ["route-iib", "psur"],
      not: ["route-iia", "clinical-investigation-iii"],
    },
    {
      example: "stroke-image-analysis",
      cls: "III",
      nb: "full",
      has: ["route-iii", "psur", "sscp", "clinical-investigation-iii", "udi-carrier-iii"],
      not: ["pms-report"],
    },
  ];

  it.each(cases.map((c) => [`${c.example} (class ${c.cls}, notified body ${c.nb})`, c] as const))("%s", (_name, c) => {
    const extra: Profile = ("extra" in c ? c.extra : undefined) ?? {};
    const nav = navigate(model, { ...profileOf(c.example), ...known, ...extra }, { asOf: "2026-10-21" });
    expect(nav.results["eu-mdr-classification"]?.value).toBe(c.cls);
    expect(nav.results["eu-mdr-notified-body"]?.value).toBe(c.nb);
    // Every obligation is decided: no "depends on an unknown answer" left for a fully described device.
    expect(nav.obligations.filter((o) => o.applies === null)).toEqual([]);
    const ids = applying(nav.obligations);
    for (const id of [
      ...c.has,
      "classify-justify",
      "declaration",
      "ce-marking",
      "qms",
      "risk-management",
      "software-lifecycle",
      "clinical-evaluation",
      "pmcf",
      "vigilance",
      "information-security",
      "eudamed-device",
    ]) {
      expect(ids).toContain(id);
    }
    for (const id of c.not) expect(ids).not.toContain(id);
    expect(nav.questions).toEqual([]);
  });

  it("asks only what is still open, e.g. whether the manufacturer is outside the EU", () => {
    const nav = navigate(model, { ...profileOf("heartbeat-app"), isAiSystem: false }, { asOf: "2026-10-21" });
    expect(nav.questions.map((q) => q.attr)).toEqual(["manufacturerOutsideEu"]);
    expect(nav.obligations.find((o) => o.id === "authorised-representative")?.applies).toBe(null);
  });

  it("gives a software-level UDI only to software sold on its own or a device in itself (Annex VI C 6.5.1)", () => {
    // Embedded software that only drives a class IIa device: part of that device, class IIa by rule 3.3.
    const driver: Profile = {
      isSoftware: true,
      actsOnData: false,
      medicalPurpose: false,
      drivesDevice: true,
      accessory: false,
      annexXvi: false,
      drivenDeviceClass: "IIa",
      ...known,
    };
    const udi = (p: Profile) =>
      navigate(model, p, { asOf: "2026-10-21" }).obligations.find((o) => o.id === "udi-assign");
    expect(navigate(model, driver, { asOf: "2026-10-21" }).results["eu-mdr-qualification"]?.value).toBe(
      "device-software",
    );
    expect(udi(driver)?.applies).toBe(null);
    expect(navigate(model, driver, { asOf: "2026-10-21" }).questions.map((q) => q.attr)).toContain("soldSeparately");
    expect(udi({ ...driver, soldSeparately: false })?.applies).toBe(false);
    expect(udi({ ...driver, soldSeparately: true })?.applies).toBe(true);
    expect(udi({ ...profileOf("heartbeat-app"), ...known })?.applies).toBe(true);
  });

  it("gives nothing to a product that is not a medical device", () => {
    const nav = navigate(model, { ...profileOf("lab-performance-metrics"), ...known }, { asOf: "2026-10-21" });
    expect(applying(nav.obligations)).toEqual([]);
  });
});

describe("dates: the as-of slider", () => {
  const ai = { ...profileOf("ai-class-iia"), manufacturerOutsideEu: false, interactsWithPersons: true };
  const status = (asOf: string, id: string) => {
    const o = navigate(model, ai, { asOf }).obligations.find((x) => x.id === id);
    return o ? `${String(o.applies)}/${o.timing}` : "missing";
  };

  it("AI Act high-risk requirements apply to the device but come into force on 2 August 2028", () => {
    expect(status("2026-10-21", "ai-risk-art9")).toBe("true/upcoming");
    expect(status("2028-08-01", "ai-oversight-art14")).toBe("true/upcoming");
    expect(status("2028-08-02", "ai-oversight-art14")).toBe("true/in-force");
    expect(navigate(model, ai, { asOf: "2026-10-21" }).results["eu-ai-act-high-risk"]?.inForce).toBe(false);
    expect(navigate(model, ai, { asOf: "2028-08-02" }).results["eu-ai-act-high-risk"]?.inForce).toBe(true);
  });

  it("Article 50 transparency applies from 2 August 2026, whatever the MDR class", () => {
    expect(status("2026-08-01", "ai-transparency-art50")).toBe("true/upcoming");
    expect(status("2026-08-02", "ai-transparency-art50")).toBe("true/in-force");
    const chatbot = navigate(
      model,
      { isAiSystem: true, interactsWithPersons: true, isSoftware: false },
      { asOf: "2026-10-21" },
    );
    expect(chatbot.obligations.find((o) => o.id === "ai-transparency-art50")?.applies).toBe(true);
  });

  it("EUDAMED registration and the UDI carrier follow their transition dates", () => {
    expect(status("2026-05-27", "eudamed-actor")).toBe("true/upcoming");
    expect(status("2026-05-28", "eudamed-actor")).toBe("true/in-force");
    expect(status("2023-05-25", "udi-carrier-iia-iib")).toBe("true/upcoming");
    expect(status("2023-05-26", "udi-carrier-iia-iib")).toBe("true/in-force");
  });

  it("the SSCP (Article 32) is tied to Eudamed, so it applies from 28 May 2026 (Article 123(3)(d))", () => {
    const iii = { ...profileOf("stroke-image-analysis"), ...known };
    const sscp = (asOf: string) => navigate(model, iii, { asOf }).obligations.find((o) => o.id === "sscp")?.timing;
    expect([sscp("2026-05-27"), sscp("2026-05-28")]).toEqual(["upcoming", "in-force"]);
  });
});
