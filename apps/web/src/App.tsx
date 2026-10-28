// The page: banner, masthead, then either the work area (the device's chips above the map or the checklist, with the
// card beside the map) or the placeholder of a market that is not modelled yet. Whatever is pressed shimmers for a
// moment (lib/sheen.ts). While the guided run is on, its card stands in the margin beside the map on a wide screen,
// and above the chips otherwise (the checklist, a phone, a tablet).
import { useEffect } from "react";
import { Card } from "./components/Card.tsx";
import { Checklist } from "./components/Checklist.tsx";
import { DeviceChips } from "./components/DeviceChips.tsx";
import { GuidedCard, useGuidedPlayback } from "./components/Guided.tsx";
import { MapView } from "./components/MapView.tsx";
import { Banner, Footer, Masthead, NextStage, useNarrow } from "./components/Shell.tsx";
import { useScreen } from "./data.tsx";
import { installSheen } from "./lib/sheen.ts";
import { useApp } from "./state.tsx";

export function App() {
  const screen = useScreen();
  const { state } = useApp();
  const narrow = useNarrow();
  const oneColumn = useNarrow("(max-width: 1100px)");
  const view = state.view ?? (narrow ? "checklist" : "map");
  useEffect(() => installSheen(document), []);
  useGuidedPlayback(screen);
  const guidedInMargin = view === "map" && !oneColumn;
  return (
    <div className="app">
      <Banner />
      <Masthead view={view} />
      {screen ? (
        <main className="workspace" data-view={view}>
          <div className="work">
            {state.guided && !guidedInMargin ? <GuidedCard screen={screen} /> : null}
            <DeviceChips view={screen.view} />
            {view === "map" ? <MapView screen={screen} /> : <Checklist screen={screen} />}
          </div>
          {view === "map" ? <Card guided={guidedInMargin} /> : null}
        </main>
      ) : (
        <NextStage />
      )}
      <Footer />
    </div>
  );
}
