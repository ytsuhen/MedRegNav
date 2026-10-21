// @vitest-environment happy-dom
// The app in a DOM: the banner, the checklist as a full alternative to the map (answers inline, items moving between
// "applies" and "does not apply"), the attribute editor, the card's verified quote, the as-of steps, the language and
// market switches.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { Card } from "../src/components/Card.tsx";
import { DataProvider } from "../src/data.tsx";
import { AppProvider, type AppState } from "../src/state.tsx";
import { example, sections, snapshot } from "./fixtures.ts";

const loadSections = () => Promise.resolve(sections);

function renderWith(children: React.ReactNode, initial: Partial<AppState>, today = "2026-10-21") {
  return render(
    <DataProvider snapshot={snapshot} loadSections={loadSections}>
      <AppProvider snapshot={snapshot} initial={{ lang: "uk", ...initial }} today={today} syncUrl={false}>
        {children}
      </AppProvider>
    </DataProvider>,
  );
}

const heartbeat = { example: "heartbeat-app", profile: example("heartbeat-app"), selection: null };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the app", () => {
  it("always shows the banner", () => {
    renderWith(<App />, { ...heartbeat, view: "checklist" });
    expect(screen.getByTestId("banner").textContent).toBe(
      "Демо, не юридична консультація. Клас визначає виробник; для IIa і вище його підтверджує нотифікований орган. Правила — чернетка, не перевірені регуляторним фахівцем.",
    );
  });

  it("lists every branch in the checklist, with the open question answered inline", async () => {
    renderWith(<App />, { ...heartbeat, view: "checklist" });
    const list = screen.getByTestId("checklist");
    for (const name of ["Клас", "Шлях на ринок", "Система якості", "Клінічні докази", "Кібербезпека й дані", "AI"])
      expect(within(list).getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByTestId("check-o.route-iib").dataset.state).toBe("in-force");
    expect(screen.getByTestId("check-o.authorised-representative").dataset.state).toBe("open");
    const question = screen.getByText(/Чи виробник не має зареєстрованого місця діяльності/).closest("li");
    if (!question) throw new Error("no question");
    await act(async () => fireEvent.click(within(question).getByLabelText("Ні")));
    expect(screen.queryByTestId("check-o.authorised-representative")).toBeNull();
    expect(screen.getByText(/Уповноважений представник у ЄС/, { selector: ".check-hidden li" })).toBeTruthy();
  });

  it("edits an attribute from its chip", async () => {
    renderWith(<App />, { ...heartbeat, view: "checklist" });
    const chip = screen.getByTestId("chip-isAiSystem");
    expect(chip.textContent).toBe("AI-системане знаю");
    await act(async () => fireEvent.click(chip));
    const editor = screen.getByTestId("attribute-editor");
    expect(within(editor).getByRole("heading").textContent).toMatch(/AI-системою/);
    await act(async () => fireEvent.click(within(editor).getByLabelText("Так")));
    expect(screen.getByTestId("chip-isAiSystem").textContent).toBe("AI-систематак");
    // A newly decisive question appears: which role the AI plays.
    expect(screen.getByTestId("chip-aiRole").dataset.known).toBeUndefined();
  });

  it("steps the as-of date to the next key date: the AI Act requirements come into force", async () => {
    const ai = { ...example("ai-class-iia"), manufacturerOutsideEu: false, interactsWithPersons: false };
    renderWith(<App />, { example: null, profile: ai, view: "checklist", asOf: "2028-08-01" });
    expect(screen.getByTestId("check-o.ai-risk-art9").dataset.state).toBe("upcoming");
    await act(async () => fireEvent.click(screen.getByLabelText("Наступна ключова дата")));
    expect(screen.getByTestId("check-o.ai-risk-art9").dataset.state).toBe("in-force");
    expect(screen.getByTestId("asof").textContent).toContain("02.08.2028");
  });

  it("switches the language and the market", async () => {
    renderWith(<App />, { ...heartbeat, view: "checklist" });
    await act(async () => fireEvent.click(within(screen.getByTestId("lang")).getByLabelText("Eng")));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Medical device regulatory navigator");
    expect(document.documentElement.lang).toBe("en");
    await act(async () => fireEvent.click(within(screen.getByTestId("market")).getByLabelText("US")));
    expect(screen.getByTestId("next-stage").textContent).toMatch(/No FDA rule is encoded/);
    await act(async () => fireEvent.click(screen.getByText("Back to the EU")));
    expect(screen.queryByTestId("next-stage")).toBeNull();
  });

  it("opens the video guide with its chapters, and closing it removes the player", async () => {
    renderWith(<App />, { ...heartbeat, view: "checklist" });
    expect(screen.queryByTestId("video-dialog")).toBeNull();
    await act(async () => fireEvent.click(screen.getByTestId("video-open")));
    const dialog = screen.getByTestId("video-dialog");
    expect(dialog.querySelector("video")?.getAttribute("src")).toBe("video/medregnav-guide.mp4");
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "0:00 Що це",
      "0:53 Опишіть програму",
      "2:32 Мапа",
      "3:45 Чому цей клас",
      "4:56 Що робити",
      "6:02 Станом на дату",
      "6:42 Проєкти змін",
      "7:56 Чекліст, телефон, мови",
      "8:22 Під капотом",
      "9:23 Межі й де знайти",
    ]);
    await act(async () => dialog.dispatchEvent(new Event("close")));
    expect(screen.queryByTestId("video-dialog")).toBeNull();
  });
});

describe("the card", () => {
  it("shows how to comply and the legal basis, verified in the browser", async () => {
    renderWith(<Card />, { ...heartbeat, selection: { kind: "obligation", id: "route-iib" } });
    const card = screen.getByTestId("obligation-card");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Оцінка відповідності для класу IIb");
    expect(card.textContent).toContain("ISO 13485");
    await waitFor(() => expect(within(card).getAllByTestId("quote")[0]?.dataset.verified).toBe("true"));
    expect(card.textContent).toMatch(/Перевірено в браузері: sha256 секції [0-9a-f]{12}… збігається/);
    expect(
      within(card)
        .getAllByRole("link")
        .some((a) => a.getAttribute("href")?.includes("eur-lex.europa.eu")),
    ).toBe(true);
  });

  it("explains a rule result: what decided it, and why not stricter", async () => {
    renderWith(<Card />, { ...heartbeat, selection: { kind: "rule", id: "eu-mdr-classification" } });
    const card = screen.getByTestId("rule-card");
    expect(within(card).getByText("Клас IIb", { selector: ".card-result" })).toBeTruthy();
    expect(within(card).getByRole("heading", { name: "Що вирішило" })).toBeTruthy();
    expect(within(card).getByRole("heading", { name: "Чому не суворіше" })).toBeTruthy();
    expect(card.textContent).toContain("11a: рішення з можливим серйозним погіршенням чи операцією");
  });

  it("by default quotes the example the device came from", () => {
    renderWith(<Card />, { ...heartbeat, selection: { kind: "device" } });
    const card = screen.getByTestId("device-card");
    expect(card.textContent).toContain("Застосунок, що аналізує серцебиття");
    expect(card.textContent).toContain("Як ми прочитали приклад");
    expect(card.textContent).toContain("Рушій дає те саме.");
  });
});
