// The static SPA (React 19 + Tailwind 4; fonts bundled from @fontsource, so the demo works offline). The data come
// from data/ through two virtual modules built by the CLI's snapshot builder: `virtual:mrn/snapshot` (the model,
// loaded with the app) and `virtual:mrn/sections` (the cited sections' texts, a separate chunk loaded when a quote
// is first shown). Relative asset URLs: the build works under any sub-path, e.g. GitHub Pages /MedRegNav/.
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "@mrn/cli/snapshot";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

export const WEB_ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

const MODULES = { "virtual:mrn/snapshot": "snapshot", "virtual:mrn/sections": "sections" } as const;
type ModuleId = keyof typeof MODULES;

/** Serves the snapshot as virtual modules; in development a change under data/ reloads the page with new data. */
export function mrnData(): Plugin {
  let built: ReturnType<typeof buildSnapshot> | null = null;
  const resolved = (id: string) => `\0${id}`;
  return {
    name: "mrn-data",
    resolveId: (id) => (id in MODULES ? resolved(id) : null),
    load(id) {
      const name = Object.keys(MODULES).find((m) => resolved(m) === id) as ModuleId | undefined;
      if (!name) return null;
      built ??= buildSnapshot();
      const value = MODULES[name] === "snapshot" ? built.snapshot : built.sections;
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(value))});`;
    },
    configureServer(server) {
      server.watcher.add(DATA_DIR);
      server.watcher.on("change", (file) => {
        if (!file.startsWith(DATA_DIR) || !file.endsWith(".json")) return;
        built = null;
        for (const m of Object.keys(MODULES)) {
          const mod = server.moduleGraph.getModuleById(resolved(m));
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export function webConfig(options: { outDir?: string } = {}): UserConfig {
  return {
    root: WEB_ROOT,
    base: "./",
    plugins: [react(), tailwindcss(), mrnData()],
    optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"] },
    server: { warmup: { clientFiles: ["./src/main.tsx"] } },
    build: { outDir: options.outDir ?? "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  };
}

export default defineConfig(webConfig());
