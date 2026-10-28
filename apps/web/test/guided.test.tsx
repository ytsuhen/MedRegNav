// @vitest-environment happy-dom
// The guided run on screen (DECISIONS U13): its place in the link, where a position puts the screen, the summary's
// acts by act and article, the keys a step makes shimmer, and in a DOM the playback — a step every four seconds, a
// stop at a question the description leaves open, an answer from anywhere on the screen going into the run, and the
// description kept when the run stops.
import { navigate } from "@mrn/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { STEP_MS } from "../src/components/Guided.tsx";
import { DataProvider } from "../src/data.tsx";
import { actsOf, guidedState, lastReachable, profileAt } from "../src/lib/guided.ts";
import { EMPTY_ROUTE, encodeRoute, parseRoute } from "../src/lib/route.ts";
import { changedKeys } from "../src/lib/view.ts";
import { AppProvider, type AppState, knownIds } from "../src/state.tsx";
import { example, screen as screenOf, sections, snapshot } from "./fixtures.ts";

const asOf = "2026-10-21";
const heartbeat = example("heartbeat-app");

describe("the guided run's place in a link", () => {
  it("round-trips the description, the answers given on the way ('don't know' too) and the position", () => {
    const route = {
      ...EMPTY_ROUTE,
      example: "heartbeat-app",
      profile: { isSoftware: true },
      guided: { target: heartbeat, answers: { isAiSystem: null, manufacturerOutsideEu: false }, at: 3 },
    };
    const hash = encodeRoute(route);
    expect(hash).toContain("g=3");
    expect(hash).toContain("ga=isAiSystem.~_manufacturerOutsideEu.n");
    expect(parseRoute(hash, knownIds(snapshot))).toEqual(route);
    expect(parseRoute("#p=&g=-1", knownIds(snapshot)).guided).toBeNull();
  });
});

describe("a position of the run", () => {
  const g = guidedState(snapshot.model, { target: heartbeat, answers: {}, at: 99, playing: true }, asOf);

  it("goes no further than a question the description leaves open, and stops playing at the summary", () => {
    expect(g.run.pending).toBeGreaterThan(0);
    expect(g.at).toBe(lastReachable(g.run));
    expect(g.run.steps[g.at - 1]?.source).toBe("pending");
    expect(profileAt(g.run, g.at)).toEqual(g.run.steps[g.at - 1]?.before);
    expect(profileAt(g.run, 0)).toEqual({});
    const done = guidedState(
      snapshot.model,
      { target: heartbeat, answers: { isAiSystem: false, manufacturerOutsideEu: false }, at: 99, playing: true },
      asOf,
    );
    expect(done.at).toBe(done.run.steps.length + 1);
    expect(done.playing).toBe(false);
    expect(profileAt(done.run, done.at)).toEqual(done.run.final);
  });

  it("groups the requirements that apply by act and article, regulations first, articles in reading order", () => {
    const nav = navigate(snapshot.model, { ...heartbeat, isAiSystem: true, aiRole: "device" }, { asOf });
    const acts = actsOf(snapshot, nav);
    expect(acts.map((a) => a.title)).toEqual(["MDR", "AI Act", "Decision (EU) 2025/2371"]);
    const mdr = acts[0]?.articles.map((a) => a.ref) ?? [];
    expect(mdr.indexOf("Article 10")).toBeLessThan(mdr.indexOf("Article 52"));
    expect(mdr.indexOf("Article 123")).toBe(-1); // a date's source is not a legal basis
    expect(mdr.findIndex((r) => r.startsWith("Annex"))).toBeGreaterThan(mdr.lastIndexOf("Article 88"));
    const applying = new Set(nav.obligations.filter((o) => o.applies === true).map((o) => o.id));
    for (const a of acts)
      for (const art of a.articles) for (const item of art.items) expect(applying.has(item.id)).toBe(true);
    const ai = acts[1]?.articles.find((a) => a.ref === "Article 9")?.items[0];
    expect(ai?.timing).toBe("upcoming");
  });

  it("names what a step changed: the chip, the branches, the rules", () => {
    const keys = changedKeys(screenOf({}).view, screenOf({ isSoftware: false }).view);
    expect(keys).toContain("chip:isSoftware");
    expect(keys).toContain("rule:eu-mdr-qualification");
    expect(keys).toContain("rule:eu-mdr-classification");
    expect(keys.some((k) => k.startsWith("branch:"))).toBe(true);
    expect(changedKeys(screenOf(heartbeat).view, screenOf(heartbeat).view)).toEqual([]);
  });
});

describe("the guided run in the app", () => {
  const loadSections = () => Promise.resolve(sections);
  const renderApp = (initial: Partial<AppState>) =>
    render(
      <DataProvider snapshot={snapshot} loadSections={loadSections}>
        <AppProvider snapshot={snapshot} initial={{ lang: "uk", ...initial }} today={asOf} syncUrl={false}>
          <App />
        </AppProvider>
      </DataProvider>,
    );
  const position = () => screen.getByTestId("guided-position").textContent ?? "";

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    window.localStorage.clear();
  });

  // A run plays through two dozen renders of the whole app: room for a slower machine (CI took 5.2 s).
  it("plays a step every four seconds and waits at a question the description leaves open", {
    timeout: 30_000,
  }, async () => {
    renderApp({ example: "heartbeat-app", profile: heartbeat, view: "checklist", selection: null });
    await act(async () => fireEvent.click(screen.getByTestId("guided-start")));
    expect(position()).toBe("Початок");
    await act(async () => vi.advanceTimersByTime(STEP_MS));
    expect(position()).toMatch(/^Крок 1 з \d+$/);
    // Each step sets its timer once it is on screen.
    for (let i = 0; i < 20; i++) await act(async () => vi.advanceTimersByTime(STEP_MS));
    expect(position()).toMatch(/Чекає на вашу відповідь$/);
    const waiting = position();
    for (let i = 0; i < 3; i++) await act(async () => vi.advanceTimersByTime(STEP_MS));
    expect(position()).toBe(waiting);
    // "Don't know" in the card: the attribute stays unknown and the run goes on.
    const ask = screen.getByTestId("guided-ask");
    await act(async () => fireEvent.click(within(ask).getByLabelText("Не знаю")));
    expect(screen.getByTestId("guided-answer").textContent).toMatch(/^Не знаю/);
    await act(async () => vi.advanceTimersByTime(STEP_MS));
    expect(position()).not.toBe(waiting);
  });

  it("takes an answer from a chip into the run and keeps the description when the run stops", {
    timeout: 30_000,
  }, async () => {
    renderApp({ example: "heartbeat-app", profile: heartbeat, view: "checklist", selection: null });
    await act(async () => fireEvent.click(screen.getByTestId("guided-start")));
    await act(async () => fireEvent.click(screen.getByTestId("guided-play")));
    // An answer the description lacks, from the chip's editor while the run is on.
    await act(async () => fireEvent.click(screen.getByTestId("chip-manufacturerOutsideEu")));
    const editor = screen.getByTestId("attribute-editor");
    await act(async () => fireEvent.click(within(editor).getByLabelText("Ні")));
    expect(screen.getByTestId("guided-position").textContent).toBe("Початок");
    await act(async () => fireEvent.click(screen.getByTestId("guided-stop")));
    expect(screen.queryByTestId("guided")).toBeNull();
    expect(screen.getByTestId("chip-manufacturerOutsideEu").textContent).toBe("Виробник поза ЄСні");
    expect(screen.getByTestId("chip-decisionInfo").textContent).toBe("Інформація для рішеньтак");
  });
});
