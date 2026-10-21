// The page: banner, masthead, then either the work area (the device's chips above the map or the checklist, with the
// card beside the map) or the placeholder of a market that is not modelled yet.
import { Card } from "./components/Card.tsx";
import { Checklist } from "./components/Checklist.tsx";
import { DeviceChips } from "./components/DeviceChips.tsx";
import { MapView } from "./components/MapView.tsx";
import { Banner, Footer, Masthead, NextStage, useNarrow } from "./components/Shell.tsx";
import { useScreen } from "./data.tsx";
import { useApp } from "./state.tsx";

export function App() {
  const screen = useScreen();
  const { state } = useApp();
  const narrow = useNarrow();
  const view = state.view ?? (narrow ? "checklist" : "map");
  return (
    <div className="app">
      <Banner />
      <Masthead view={view} />
      {screen ? (
        <main className="workspace" data-view={view}>
          <div className="work">
            <DeviceChips view={screen.view} />
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
