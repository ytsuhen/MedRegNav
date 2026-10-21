// @vitest-environment happy-dom
// The map in a DOM: the device label with its class ladder, six branches, one expanded at a time, a leaf opening its
// card, an inline answer settling a branch, and the hover that links an attribute chip with the nodes it causes.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { DataProvider } from "../src/data.tsx";
import { AppProvider, type AppState } from "../src/state.tsx";
import { example, sections, snapshot } from "./fixtures.ts";

const loadSections = () => Promise.resolve(sections);

function renderApp(initial: Partial<AppState>) {
  return render(
    <DataProvider snapshot={snapshot} loadSections={loadSections}>
      <AppProvider
        snapshot={snapshot}
        initial={{ lang: "uk", view: "map", ...initial }}
        today="2026-10-21"
        syncUrl={false}
      >
        <App />
      </AppProvider>
    </DataProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the map", () => {
  const heartbeat = { example: "heartbeat-app", profile: example("heartbeat-app"), selection: null };

  it("shows the device with its class and six collapsed branches", async () => {
    renderApp(heartbeat);
    const ladder = await screen.findByTestId("ladder");
    expect(ladder.getAttribute("aria-label")).toBe("Клас IIb. Відкрити пояснення");
    for (const id of ["class", "market", "qms", "clinical", "cyber", "ai"])
      expect(screen.getByTestId(`branch-${id}`).dataset.expanded).toBeUndefined();
    expect(screen.queryByTestId("leaf-o.route-iib")).toBeNull();
  });

  it("expands one branch at a time; a leaf opens its card", async () => {
    renderApp(heartbeat);
    // React Flow keeps a node hidden until it has measured it; happy-dom does not measure, so hidden nodes count.
    const toggle = (id: string) =>
      within(screen.getByTestId(`branch-${id}`)).getByRole("button", { expanded: false, hidden: true });
    await act(async () => fireEvent.click(toggle("market")));
    expect(screen.getByTestId("branch-market").dataset.expanded).toBe("true");
    const leaf = await screen.findByTestId("leaf-o.route-iib");
    await act(async () => fireEvent.click(within(leaf).getByRole("button", { hidden: true })));
    expect(screen.getByTestId("obligation-card")).toBeTruthy();
    await act(async () => fireEvent.click(toggle("qms")));
    expect(screen.getByTestId("branch-market").dataset.expanded).toBeUndefined();
    expect(screen.queryByTestId("leaf-o.route-iib")).toBeNull();
    expect(await screen.findByTestId("leaf-o.qms")).toBeTruthy();
  });

  it("settles a pencil branch from its inline question", async () => {
    renderApp(heartbeat);
    const market = await screen.findByTestId("branch-market");
    expect(market.dataset.state).toBe("open");
    await act(async () => fireEvent.click(within(within(market).getByTestId("branch-question")).getByText("Ні")));
    expect(screen.getByTestId("branch-market").dataset.state).toBe("in-force");
    expect(screen.getByTestId("chip-manufacturerOutsideEu").textContent).toBe("Виробник поза ЄСні");
  });

  it("marks the nodes an attribute causes when its chip is hovered, and the causes of a hovered node", async () => {
    renderApp({ ...heartbeat, profile: { ...heartbeat.profile, manufacturerOutsideEu: false, isAiSystem: false } });
    await screen.findByTestId("ladder");
    await act(async () => fireEvent.mouseEnter(screen.getByTestId("chip-decisionImpact")));
    expect(screen.getByTestId("device-node").dataset.marked).toBe("true");
    expect(screen.getByTestId("branch-market").dataset.marked).toBe("true");
    expect(screen.getByTestId("branch-ai").dataset.marked).toBeUndefined();
    await act(async () => fireEvent.mouseLeave(screen.getByTestId("chip-decisionImpact")));
    await act(async () =>
      fireEvent.mouseEnter(within(screen.getByTestId("branch-class")).getByRole("button", { hidden: true })),
    );
    expect(screen.getByTestId("chip-decisionImpact").dataset.marked).toBe("true");
    expect(screen.getByTestId("chip-manufacturerOutsideEu").dataset.marked).toBeUndefined();
  });
});
