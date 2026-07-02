import { defineConfig } from "@playwright/test";

const e2ePort = Number(process.env.E2E_PORT ?? "4175");
const defaultBaseURL = `http://127.0.0.1:${e2ePort}`;
const isExternalTarget = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results",
  webServer: isExternalTarget
    ? undefined
    : {
        command: `E2E_PORT=${e2ePort} tsx scripts/e2e-smoke-server.ts`,
        url: `${defaultBaseURL}/api/ready`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? defaultBaseURL,
  },
});
