// The data modules served by the build's plugin (vite.config.ts → apps/cli/src/snapshot.ts).
declare module "virtual:mrn/snapshot" {
  import type { WebSnapshot } from "@mrn/core";

  const snapshot: WebSnapshot;
  export default snapshot;
}

declare module "virtual:mrn/sections" {
  import type { SectionTexts } from "@mrn/core";

  const sections: SectionTexts;
  export default sections;
}
