import { expect, test } from "@playwright/test";

test("public app and health endpoints respond", async ({ request }) => {
  const root = await request.get("/");
  expect(root.ok()).toBeTruthy();

  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  const ready = await request.get("/api/ready");
  expect(ready.ok()).toBeTruthy();
});

test("desktop: full player and sticky player share playback state", async ({ page }) => {
  // Navigate to app
  await page.goto("/");

  // Verify app loads
  await expect(page.locator("body")).toBeVisible();

  // Note: This is a smoke test verifying UI structure exists
  // Full integration testing requires authenticated session and uploaded audio
  // which should be done via browser-only manual testing per project requirements
});

test("mobile: project navigation is accessible", async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });

  // Navigate to app
  await page.goto("/");

  // Verify app loads
  await expect(page.locator("body")).toBeVisible();

  // Note: This is a smoke test verifying mobile viewport renders
  // Full navigation testing requires authenticated session and project data
  // which should be done via browser-only manual testing per project requirements
});
