// Entry: the snapshot comes with the app; the cited sections' texts are a separate chunk loaded on first need.

import snapshot from "virtual:mrn/snapshot";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DataProvider } from "./data.tsx";
import { AppProvider } from "./state.tsx";
import "./styles.css";

const loadSections = () => import("virtual:mrn/sections").then((m) => m.default);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <DataProvider snapshot={snapshot} loadSections={loadSections}>
        <AppProvider snapshot={snapshot}>
          <App />
        </AppProvider>
      </DataProvider>
    </StrictMode>,
  );
}
