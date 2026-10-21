// Browser tests (Playwright in the preinstalled Chromium; never downloaded): not part of `pnpm verify`.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/e2e/**/*.e2e.ts"],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
