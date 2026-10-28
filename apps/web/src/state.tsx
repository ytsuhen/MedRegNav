// App state: the device's answers, the date, the market and view, the expanded branch, the open card, the hover
// that links attribute chips with the branches they cause, and the guided run (DECISIONS U13). Everything a link should
// reproduce is mirrored in the URL hash (lib/route.ts, replaceState so typing answers does not flood the history); a
// pasted link or Back re-reads it. The language choice also lives in localStorage (a per-viewer convenience; every
// access guarded).
// While the guided run is on, the answers on screen are its position's (lib/guided.ts): the reducer works the run out
// again whenever the description, an answer given on the way or the date changes, and every answer given anywhere on
// the screen goes into the run.
import type { AttributeValue, Branch, Example, NavigatorModel, Profile, WebSnapshot } from "@mrn/core";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { type Lang, type MessageKey, translate } from "./i18n/dict.ts";
import { todayIso } from "./lib/dates.ts";
import { type GuidedState, guidedState, profileAt } from "./lib/guided.ts";
import {
  EMPTY_ROUTE,
  encodeRoute,
  type KnownIds,
  type Market,
  parseRoute,
  type Route,
  type Selection,
  type View,
} from "./lib/route.ts";

export type Hover = { kind: "attr"; id: string } | { kind: "node"; key: string; support: readonly string[] };

export interface AppState {
  lang: Lang;
  market: Market;
  /** null: the default for the screen width. */
  view: View | null;
  /** null: today. */
  asOf: string | null;
  example: string | null;
  profile: Profile;
  branch: Branch | null;
  selection: Selection | null;
  proposals: boolean;
  /** The attribute whose editor is open. */
  editing: string | null;
  /** Show the chips that change nothing right now. */
  showRest: boolean;
  hover: Hover | null;
  /** The guided run, while it is on. */
  guided: GuidedState | null;
}

type Action =
  | { type: "route"; route: Route }
  | { type: "lang"; lang: Lang }
  | { type: "market"; market: Market }
  | { type: "view"; view: View }
  | { type: "asOf"; asOf: string | null }
  | { type: "example"; example: Example | null }
  | { type: "answer"; attr: string; value: AttributeValue | null }
  | { type: "clear" }
  | { type: "branch"; branch: Branch | null }
  | { type: "select"; selection: Selection | null }
  | { type: "proposals"; on: boolean }
  | { type: "edit"; attr: string | null }
  | { type: "showRest"; on: boolean }
  | { type: "hover"; hover: Hover | null }
  | { type: "guided-start" }
  | { type: "guided-go"; at: number }
  | { type: "guided-play"; on: boolean }
  | { type: "guided-stop" };

interface Context {
  model: NavigatorModel;
  today: string;
}

/** The run worked out again for its inputs on the state's date, with the screen's answers at its position. */
function withRun(state: AppState, input: Omit<GuidedState, "run"> | null, ctx: Context): AppState {
  if (!input) return { ...state, guided: null };
  const guided = guidedState(ctx.model, input, state.asOf ?? ctx.today);
  return { ...state, guided, profile: profileAt(guided.run, guided.at) };
}

/** An answer given while the run is on goes into the run: into the description if it knew that, else to the answers. */
function answerInRun(g: GuidedState, attr: string, value: AttributeValue | null): Omit<GuidedState, "run"> {
  const known = g.target[attr] !== null && g.target[attr] !== undefined;
  if (known) {
    const target: Record<string, AttributeValue | null | undefined> = { ...g.target };
    if (value === null) delete target[attr];
    else target[attr] = value;
    return { ...g, target, answers: value === null ? { ...g.answers, [attr]: null } : g.answers };
  }
  return { ...g, answers: { ...g.answers, [attr]: value } };
}

function reducer(state: AppState, action: Action, ctx: Context): AppState {
  const g = state.guided;
  switch (action.type) {
    case "route": {
      const { lang, guided, ...route } = action.route;
      const next = { ...state, ...route, lang: lang ?? state.lang, editing: null, hover: null };
      return withRun(next, guided ? { ...guided, playing: false } : null, ctx);
    }
    case "lang":
      return { ...state, lang: action.lang };
    case "market":
      return { ...state, market: action.market };
    case "view":
      return { ...state, view: action.view };
    case "asOf": {
      const next = { ...state, asOf: action.asOf };
      return g ? withRun(next, g, ctx) : next;
    }
    case "example":
      return {
        ...state,
        example: action.example?.id ?? null,
        profile: action.example ? { ...action.example.profile } : {},
        selection: action.example ? { kind: "device" } : null,
        editing: null,
        hover: null,
        guided: null,
      };
    case "answer": {
      if (g) return withRun(state, answerInRun(g, action.attr, action.value), ctx);
      const profile: Record<string, AttributeValue> = {};
      for (const [k, v] of Object.entries(state.profile)) if (v !== null && v !== undefined) profile[k] = v;
      if (action.value === null) delete profile[action.attr];
      else profile[action.attr] = action.value;
      return { ...state, profile };
    }
    case "clear":
      return { ...state, profile: {}, example: null, selection: null, editing: null, hover: null, guided: null };
    case "branch":
      return { ...state, branch: action.branch };
    case "select":
      return { ...state, selection: action.selection, guided: g && action.selection ? { ...g, playing: false } : g };
    case "proposals":
      return { ...state, proposals: action.on };
    case "edit":
      return { ...state, editing: action.attr };
    case "showRest":
      return { ...state, showRest: action.on };
    case "hover":
      return { ...state, hover: action.hover };
    case "guided-start":
      return withRun(
        { ...state, selection: null, editing: null, hover: null },
        { target: state.profile, answers: {}, at: 0, playing: true },
        ctx,
      );
    case "guided-go":
      return g ? withRun(state, { ...g, at: action.at }, ctx) : state;
    case "guided-play":
      return g ? withRun(state, { ...g, playing: action.on }, ctx) : state;
    case "guided-stop":
      return g ? { ...state, profile: g.run.final, guided: null } : state;
  }
}

const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // private mode or blocked storage: the choice simply does not persist
    }
  },
};

const LANG_KEY = "mrn.lang";

export function knownIds(snapshot: WebSnapshot): KnownIds {
  return {
    registry: snapshot.model.registry,
    examples: snapshot.examples.map((e) => ({ id: e.id, profile: e.profile })),
    obligations: snapshot.model.obligations.map((o) => o.id),
    rules: snapshot.model.rules.map((r) => r.id),
  };
}

/** The state a URL hash describes; a first visit (no hash) opens the first preset example. */
export function initialState(
  snapshot: WebSnapshot,
  hash: string,
  storedLang: string | null,
  today = todayIso(),
): AppState {
  const route = hash.replace(/^#/, "") === "" ? null : parseRoute(hash, knownIds(snapshot));
  const preset = snapshot.examples.find((e) => e.preset);
  const base: Route = route ?? {
    ...EMPTY_ROUTE,
    example: preset?.id ?? null,
    profile: preset ? { ...preset.profile } : {},
    selection: preset ? { kind: "device" } : null,
  };
  const { lang, guided, ...rest } = base;
  const state: AppState = {
    ...rest,
    lang: lang ?? (storedLang === "en" ? "en" : "uk"),
    editing: null,
    showRest: false,
    hover: null,
    guided: null,
  };
  return withRun(state, guided ? { ...guided, playing: false } : null, { model: snapshot.model, today });
}

export const routeOf = (s: AppState): Route => ({
  market: s.market,
  view: s.view,
  asOf: s.asOf,
  example: s.example,
  profile: s.profile,
  branch: s.branch,
  selection: s.selection,
  proposals: s.proposals,
  lang: null,
  guided: s.guided ? { target: s.guided.target, answers: s.guided.answers, at: s.guided.at } : null,
});

interface AppContextValue {
  state: AppState;
  /** The as-of date in effect (the chosen one, or today). */
  asOf: string;
  today: string;
  /** The description of the software: the answers on screen, or while the guided run is on, where it ends. */
  described: Profile;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  dispatch: (action: Action) => void;
  answer: (attr: string, value: AttributeValue | null) => void;
  select: (selection: Selection | null) => void;
  hover: (hover: Hover | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  snapshot,
  children,
  initial,
  today = todayIso(),
  syncUrl = true,
}: {
  snapshot: WebSnapshot;
  children: ReactNode;
  initial?: Partial<AppState>;
  today?: string;
  syncUrl?: boolean;
}) {
  const ctx = useMemo<Context>(() => ({ model: snapshot.model, today }), [snapshot, today]);
  const bound = useCallback((s: AppState, a: Action) => reducer(s, a, ctx), [ctx]);
  const [state, dispatch] = useReducer(bound, undefined, () => ({
    ...initialState(snapshot, typeof window === "undefined" ? "" : window.location.hash, storage.get(LANG_KEY), today),
    ...initial,
  }));
  useEffect(() => {
    storage.set(LANG_KEY, state.lang);
    document.documentElement.lang = state.lang;
  }, [state.lang]);
  const hash = encodeRoute(routeOf(state));
  useEffect(() => {
    if (syncUrl && window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [hash, syncUrl]);
  useEffect(() => {
    if (!syncUrl) return;
    const onHash = () => dispatch({ type: "route", route: parseRoute(window.location.hash, knownIds(snapshot)) });
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [snapshot, syncUrl]);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(state.lang, key, vars),
    [state.lang],
  );
  const value = useMemo<AppContextValue>(
    () => ({
      state,
      asOf: state.asOf ?? today,
      today,
      described: state.guided ? state.guided.run.final : state.profile,
      t,
      dispatch,
      answer: (attr, v) => dispatch({ type: "answer", attr, value: v }),
      select: (selection) => dispatch({ type: "select", selection }),
      hover: (h) => dispatch({ type: "hover", hover: h }),
    }),
    [state, today, t],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp outside AppProvider");
  return value;
}
