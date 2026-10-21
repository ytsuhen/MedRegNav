// The screen view: what the device node, the branches and the chips show for real examples, and that each question
// appears once on the map.
import { describe, expect, it } from "vitest";
import { example, screen } from "./fixtures.ts";

const branch = (s: ReturnType<typeof screen>, id: string) => {
  const b = s.view.branches.find((x) => x.id === id);
  if (!b) throw new Error(`no branch ${id}`);
  return b;
};

describe("the device node", () => {
  it("shows the class on the ladder and the qualification line", () => {
    const s = screen(example("heartbeat-app"));
    expect(s.view.device.ladder.steps.map((x) => [x.id, x.state])).toEqual([
      ["I", "excluded"],
      ["IIa", "excluded"],
      ["IIb", "value"],
      ["III", "excluded"],
    ]);
    expect(s.view.device.qualification.result.value).toBe("mdsw");
    expect(s.view.device.questions).toEqual([]);
  });

  it("keeps every class possible and asks first what settles it when nothing is known", () => {
    const s = screen({});
    expect(s.view.device.ladder.steps.every((x) => x.state === "possible")).toBe(true);
    expect(s.view.device.ladder.maybeNone).toBe(true);
    expect(s.view.device.questions[0]?.attr).toBe("isSoftware");
  });

  it("has no class for a product that is not a medical device", () => {
    const s = screen({ ...example("lab-performance-metrics"), isAiSystem: false });
    expect(s.view.device.ladder.result.status).toBe("not-applicable");
    expect(s.view.device.ladder.steps.every((x) => x.state === "excluded")).toBe(true);
    // Only the qualification result itself remains, on the class branch.
    expect(s.view.branches.filter((b) => b.state !== "none").map((b) => b.id)).toEqual(["class"]);
    expect(s.view.branches[0]?.leaves.map((l) => [l.id, l.outcomes.map((o) => o.en)])).toEqual([
      ["eu-mdr-qualification", ["Not a medical device"]],
    ]);
  });
});

describe("the branches", () => {
  it("are six, the first three on the left, in the presentation's order", () => {
    const s = screen(example("heartbeat-app"));
    expect(s.view.branches.map((b) => `${b.id}:${b.side}`)).toEqual([
      "class:left",
      "market:left",
      "qms:left",
      "clinical:right",
      "cyber:right",
      "ai:right",
    ]);
  });

  it("depend on an answer (pencil) with the question that settles them next to them", () => {
    const s = screen(example("heartbeat-app"));
    const m = branch(s, "market");
    expect(m.state).toBe("open");
    expect(m.counts.open).toBe(1);
    expect(m.questions.map((q) => q.attr)).toEqual(["manufacturerOutsideEu"]);
    expect(branch(s, "class").state).toBe("in-force");
    expect(branch(s, "ai").questions[0]?.attr).toBe("isAiSystem");
  });

  it("settle once the answer is given", () => {
    const s = screen({ ...example("heartbeat-app"), manufacturerOutsideEu: false, isAiSystem: false });
    expect(s.view.branches.map((b) => `${b.id}:${b.state}`)).toEqual([
      "class:in-force",
      "market:in-force",
      "qms:in-force",
      "clinical:in-force",
      "cyber:in-force",
      "ai:none",
    ]);
    expect(branch(s, "market").hidden.map((l) => l.id)).toContain("authorised-representative");
  });

  it("show each question at most once on the map", () => {
    for (const profile of [{}, example("heartbeat-app"), example("fertility-app"), { isSoftware: true }]) {
      const s = screen(profile);
      const shown = [s.view.device.questions[0], ...s.view.branches.map((b) => b.questions[0])]
        .filter((q) => q !== undefined)
        .map((q) => q.attr);
      expect(new Set(shown).size).toBe(shown.length);
    }
  });

  it("put the AI Act requirements in force on 2 August 2028 (dotted before, ink after)", () => {
    const ai = { ...example("ai-class-iia"), manufacturerOutsideEu: false, interactsWithPersons: false };
    expect(branch(screen(ai, "2028-08-01"), "ai")).toMatchObject({ state: "upcoming", from: "2028-08-02" });
    expect(branch(screen(ai, "2028-08-02"), "ai").state).toBe("in-force");
    const leaf = screen(ai, "2028-08-01").view.leaves.get("r.eu-ai-act-high-risk");
    expect([leaf?.state, leaf?.outcomes.map((o) => o.en)]).toEqual(["upcoming", ["High-risk (Article 6(1))"]]);
  });

  it("treat a guidance cross-check as optional: waiting for its answers does not make a branch depend on them", () => {
    const s = screen({ ...example("heartbeat-app"), imdrfSituation: null, imdrfSignificance: null });
    const check = s.view.leaves.get("r.mdcg-2019-11-table-1");
    expect([check?.state, check?.optional]).toEqual(["open", true]);
    expect(branch(s, "class").state).toBe("in-force");
  });
});

describe("the chips", () => {
  it("show the answers and the unanswered questions that matter, and fold the rest away", () => {
    const s = screen(example("heartbeat-app"));
    const shown = s.view.chips.groups.flatMap((g) => g.chips);
    expect(shown.filter((c) => c.value === null).every((c) => c.decisive || c.forCheck)).toBe(true);
    expect(shown.find((c) => c.attribute.id === "manufacturerOutsideEu")?.decisive).toBe(true);
    expect(s.view.chips.rest.every((c) => c.value === null && !c.decisive && !c.forCheck)).toBe(true);
    expect(s.view.chips.rest.map((c) => c.attribute.id)).toContain("drivenDeviceClass");
  });
});
