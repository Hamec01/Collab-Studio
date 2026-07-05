import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_APP_PORT ?? "4176");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /mobile-lyrics-editor\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results/mobile-editor",
  webServer: {
    command: `npx vite build && PORT=${port} APP_URL=${baseURL} DATABASE_URL=postgresql://ignore:ignore@127.0.0.1:1/ignore SESSION_SECRET=12345678901234567890123456789012 COOKIE_SECURE=false TRUST_PROXY=false ALLOW_PUBLIC_REGISTRATION=false npm run dev`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL,
  },
});
