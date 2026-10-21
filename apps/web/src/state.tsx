// App state: the device's answers, the date, the market and view, the expanded branch, the open card, and the hover
// that links attribute chips with the branches they cause. Everything a link should reproduce is mirrored in the URL
// hash (lib/route.ts, replaceState so typing answers does not flood the history); a pasted link or Back re-reads it.
// The language choice also lives in localStorage (a per-viewer convenience; every access guarded).
import type { AttributeValue, Branch, Example, Profile, WebSnapshot } from "@mrn/core";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { type Lang, type MessageKey, translate } from "./i18n/dict.ts";
import { todayIso } from "./lib/dates.ts";
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
  | { type: "hover"; hover: Hover | null };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "route": {
      const { lang, ...route } = action.route;
      return { ...state, ...route, lang: lang ?? state.lang, editing: null, hover: null };
    }
    case "lang":
      return { ...state, lang: action.lang };
    case "market":
      return { ...state, market: action.market };
    case "view":
      return { ...state, view: action.view };
    case "asOf":
      return { ...state, asOf: action.asOf };
    case "example":
      return {
        ...state,
        example: action.example?.id ?? null,
        profile: action.example ? { ...action.example.profile } : {},
        selection: action.example ? { kind: "device" } : null,
        editing: null,
        hover: null,
      };
    case "answer": {
      const profile: Record<string, AttributeValue> = {};
      for (const [k, v] of Object.entries(state.profile)) if (v !== null && v !== undefined) profile[k] = v;
      if (action.value === null) delete profile[action.attr];
      else profile[action.attr] = action.value;
      return { ...state, profile };
    }
    case "clear":
      return { ...state, profile: {}, example: null, selection: null, editing: null, hover: null };
    case "branch":
      return { ...state, branch: action.branch };
    case "select":
      return { ...state, selection: action.selection };
    case "proposals":
      return { ...state, proposals: action.on };
    case "edit":
      return { ...state, editing: action.attr };
    case "showRest":
      return { ...state, showRest: action.on };
    case "hover":
      return { ...state, hover: action.hover };
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
export function initialState(snapshot: WebSnapshot, hash: string, storedLang: string | null): AppState {
  const route = hash.replace(/^#/, "") === "" ? null : parseRoute(hash, knownIds(snapshot));
  const preset = snapshot.examples.find((e) => e.preset);
  const base: Route = route ?? {
    ...EMPTY_ROUTE,
    example: preset?.id ?? null,
    profile: preset ? { ...preset.profile } : {},
    selection: preset ? { kind: "device" } : null,
  };
  const { lang, ...rest } = base;
  return {
    ...rest,
    lang: lang ?? (storedLang === "en" ? "en" : "uk"),
    editing: null,
    showRest: false,
    hover: null,
  };
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
});

interface AppContextValue {
  state: AppState;
  /** The as-of date in effect (the chosen one, or today). */
  asOf: string;
  today: string;
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
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialState(snapshot, typeof window === "undefined" ? "" : window.location.hash, storage.get(LANG_KEY)),
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
