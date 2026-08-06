import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: /mobile-lyrics-editor\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://collabstudio.run",
    // Prevent stale SW cache from bypassing page.route mocks during production smoke runs.
    serviceWorkers: "block",
  },
});
