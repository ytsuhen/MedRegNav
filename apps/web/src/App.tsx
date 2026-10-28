// The page: banner, masthead, then either the work area (the device's description, the guided run's card while it is
// on, then the map or the checklist, with the card beside the map) or the placeholder of a market that is not modelled
// yet. The work area floats on the sea (U12): text stands on islands, the water shows between them. Whatever is pressed
// shimmers for a moment (lib/sheen.ts).
import { useEffect } from "react";
import { Card } from "./components/Card.tsx";
import { Checklist } from "./components/Checklist.tsx";
import { DeviceChips } from "./components/DeviceChips.tsx";
import { GuidedCard, useGuidedPlayback } from "./components/Guided.tsx";
import { MapView } from "./components/MapView.tsx";
import { Banner, Footer, Masthead, NextStage, useNarrow } from "./components/Shell.tsx";
import { HexWaves } from "./components/Waves.tsx";
import { useScreen } from "./data.tsx";
import { installSheen } from "./lib/sheen.ts";
import { useApp } from "./state.tsx";

export function App() {
  const screen = useScreen();
  const { state } = useApp();
  const narrow = useNarrow();
  const view = state.view ?? (narrow ? "checklist" : "map");
  useEffect(() => installSheen(document), []);
  useGuidedPlayback(screen);
  return (
    <div className="app">
      <Banner />
      <Masthead view={view} />
      {screen ? (
        <main className="workspace" data-view={view}>
          <HexWaves water="sea" />
          <div className="work">
            <DeviceChips view={screen.view} />
            {state.guided ? <GuidedCard screen={screen} /> : null}
            {view === "map" ? <MapView screen={screen} /> : <Checklist screen={screen} />}
          </div>
          {view === "map" ? <Card /> : null}
        </main>
      ) : (
        <NextStage />
      )}
      <Footer />
    </div>
  );
}
