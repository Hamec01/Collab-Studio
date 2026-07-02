import { expect, test } from "@playwright/test";

test("public app and health endpoints respond", async ({ request }) => {
  const root = await request.get("/");
  expect(root.ok()).toBeTruthy();

  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  const ready = await request.get("/api/ready");
  expect(ready.ok()).toBeTruthy();
});
