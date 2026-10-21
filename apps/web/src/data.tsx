// The data the app runs on: the snapshot (model, presentation, examples, sources) and, loaded on first need, the
// cited sections' texts. useScreen() runs the navigator for the current answers and date and derives the screen view
// once per change; the map, the checklist and the card all read the same result.
import {
  type ModelledMarket,
  modelledMarket,
  type Navigation,
  navigate,
  type SectionTexts,
  type WebSnapshot,
} from "@mrn/core";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { buildView, type ScreenView } from "./lib/view.ts";
import { useApp } from "./state.tsx";

interface DataValue {
  snapshot: WebSnapshot;
  loadSections: () => Promise<SectionTexts>;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({
  snapshot,
  loadSections,
  children,
}: {
  snapshot: WebSnapshot;
  loadSections: () => Promise<SectionTexts>;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    let pending: Promise<SectionTexts> | null = null;
    return { snapshot, loadSections: () => (pending ??= loadSections()) };
  }, [snapshot, loadSections]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData outside DataProvider");
  return value;
}

export const useSnapshot = (): WebSnapshot => useData().snapshot;

/** The cited sections' texts: null while loading (the first call starts the load). */
export function useSections(): { sections: SectionTexts | null; error: string | null } {
  const { loadSections } = useData();
  const [state, setState] = useState<{ sections: SectionTexts | null; error: string | null }>({
    sections: null,
    error: null,
  });
  useEffect(() => {
    let live = true;
    loadSections().then(
      (sections) => live && setState({ sections, error: null }),
      (error: unknown) => live && setState({ sections: null, error: String(error) }),
    );
    return () => {
      live = false;
    };
  }, [loadSections]);
  return state;
}

export interface Screen {
  market: ModelledMarket;
  nav: Navigation;
  view: ScreenView;
}

/** The navigator's result and the screen view for the current state; null for a market that is not modelled. */
export function useScreen(): Screen | null {
  const snapshot = useSnapshot();
  const { state, asOf } = useApp();
  const market = modelledMarket(snapshot.presentation, state.market);
  return useMemo(() => {
    if (!market) return null;
    const nav = navigate(snapshot.model, state.profile, { asOf, proposals: state.proposals });
    return { market, nav, view: buildView(snapshot, market, nav, state.profile) };
  }, [snapshot, market, state.profile, state.proposals, asOf]);
}
