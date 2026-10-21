// @vitest-environment happy-dom
// The proposed changes in a DOM: the switch puts the red pen on the map (the class under the proposal on the ladder,
// a red line in each leaf it changes), the class card gains the proposal's section with the cohort's transition
// matrix, and the checklist carries the same marks and section.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { Card } from "../src/components/Card.tsx";
import { DataProvider } from "../src/data.tsx";
import { AppProvider, type AppState } from "../src/state.tsx";
import { example, sections, snapshot } from "./fixtures.ts";

const loadSections = () => Promise.resolve(sections);

function renderWith(children: React.ReactNode, initial: Partial<AppState>) {
  return render(
    <DataProvider snapshot={snapshot} loadSections={loadSections}>
      <AppProvider snapshot={snapshot} initial={{ lang: "uk", ...initial }} today="2026-10-21" syncUrl={false}>
        {children}
      </AppProvider>
    </DataProvider>,
  );
}

// IIa under Rule 11 (decision information, no serious impact); I under the proposal (a non-serious situation, the
// output informs — IMDRF I, which the MDCG cross-check agrees with).
const informs = {
  example: null,
  profile: {
    ...example("heartbeat-app"),
    decisionImpact: "other",
    monitorsPhysiological: false,
    imdrfSituation: "non-serious",
    imdrfSignificance: "inform",
    clinicalBenefitOutput: true,
    manufacturerOutsideEu: false,
    isAiSystem: false,
  },
  selection: null,
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the proposals switch", () => {
  it("puts the class under the proposal on the ladder and a red line in the leaves it changes", async () => {
    renderWith(<App />, { ...informs, view: "map", branch: "market" });
    const ladder = await screen.findByTestId("ladder");
    expect(ladder.dataset.proposal).toBeUndefined();
    expect(screen.queryByTestId("ladder-proposal")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(screen.getByTestId("ladder").dataset.proposal).toBe("changed");
    expect(screen.getByTestId("ladder-proposal").textContent).toBe("За проєктом: I");
    const steps = [...screen.getByTestId("ladder").querySelectorAll<HTMLElement>(".ladder-step")];
    expect(steps.map((s) => [s.textContent, s.dataset.state, s.dataset.proposal])).toEqual([
      ["I", "excluded", "value"],
      ["IIa", "value", "excluded"],
      ["IIb", "excluded", "excluded"],
      ["III", "excluded", "excluded"],
    ]);
    const leaf = screen.getByTestId("leaf-o.route-iia");
    expect(leaf.dataset.proposal).toBe("changed");
    expect(leaf.querySelector(".leaf-proposal")?.textContent).toBe("за проєктом: не застосовувалося б");
    expect(within(screen.getByTestId("branch-market")).getByText(/проєкт змінює \d+ пункт/)).toBeTruthy();
    // A question only the proposal needs says so in words, not only in red.
    const chip = screen.getByTestId("chip-measuringFunction");
    expect([chip.dataset.forProposal, chip.textContent]).toEqual(["true", "Функція вимірюванняне знаюдля проєкту"]);
  });
});

describe("the class card under the proposal", () => {
  it("adds the proposal's result, what decided it, and the cohort's transition matrix", () => {
    renderWith(<Card />, { ...informs, proposals: true, selection: { kind: "rule", id: "eu-mdr-classification" } });
    const section = screen.getByTestId("proposal");
    expect(within(section).getByRole("heading", { level: 3 }).textContent).toBe("Якби проєкт ухвалили");
    expect(within(section).getByText("Клас I", { selector: ".card-result" })).toBeTruthy();
    expect(
      within(section)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toContain("Що вирішило");
    const matrix = within(section).getByTestId("transition-matrix");
    const cells = [...matrix.querySelectorAll("td")]
      .map((td) => Number(td.textContent))
      .filter((n) => !Number.isNaN(n));
    expect(cells.reduce((a, b) => a + b, 0)).toBe(162);
    expect(matrix.querySelectorAll("td[data-changed]").length).toBeGreaterThan(0);
    expect(section.textContent).toContain("Оцінка відповідності для класу IIa");
  });

  it("is absent with the switch off", () => {
    renderWith(<Card />, { ...informs, selection: { kind: "rule", id: "eu-mdr-classification" } });
    expect(screen.queryByTestId("proposal")).toBeNull();
  });
});

describe("the checklist under the proposal", () => {
  it("marks the results and requirements the proposal would change and shows the proposal's section", () => {
    renderWith(<App />, { ...informs, view: "checklist", proposals: true });
    expect(screen.getByTestId("proposal-r.eu-mdr-classification").textContent).toBe("за проєктом: Клас I");
    expect(screen.getByTestId("check-o.route-iia").dataset.proposal).toBe("changed");
    expect(screen.getByTestId("proposal-o.route-iia").textContent).toBe("за проєктом: не застосовувалося б");
    const section = within(screen.getByTestId("check-r.eu-mdr-classification")).getByTestId("proposal");
    expect(within(section).getByRole("heading", { level: 5 }).textContent).toBe("Якби проєкт ухвалили");
    expect(within(section).getByTestId("transition-matrix")).toBeTruthy();
  });
});
