import { expect, test, type Page } from "@playwright/test";

const projectId = "project-1";
const trackId = "track-1";

const currentUser = {
  id: "user-1",
  username: "mobile-owner",
  displayName: "Mobile Owner",
  avatarUrl: null,
  email: "mobile-owner@example.invalid",
  role: "user",
  emailVerifiedAt: "2026-07-05T00:00:00.000Z",
  ageAcknowledgedAt: "2026-07-05T00:00:00.000Z",
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
} as const;

const track = {
  id: trackId,
  title: "Deep Link Mobile Track",
  lyrics: "Verse smoke line\n\nChorus smoke line",
  lyricsDocument: null,
  lyricsPlainText: "Verse smoke line\n\nChorus smoke line",
  lyricsRevision: 4,
  tags: [],
  versionHistory: [],
  lyricVersions: [],
  audioVersions: [],
  comments: [],
  lyricsDiscussions: [],
  chat: [],
  tasks: [],
  annotations: [],
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
} as const;

const project = {
  id: projectId,
  title: "Deep Link Mobile Project",
  type: "single",
  coverUrl: null,
  tags: [],
  currentUserRole: "owner",
  owner: {
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName,
    avatarUrl: null,
  },
  participants: [{
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName,
    avatarUrl: null,
    role: "owner",
    createdAt: "2026-07-05T00:00:00.000Z",
  }],
  members: [{
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName,
    avatarUrl: null,
    role: "owner",
    createdAt: "2026-07-05T00:00:00.000Z",
  }],
  tracks: [track],
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
} as const;

async function installWorkspaceMocks(page: Page) {
  await page.route(`**/api/auth/providers`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ googleOAuthEnabled: false }) });
  });

  await page.route(`**/api/auth/me`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: currentUser }) });
  });

  await page.route(`**/api/notifications`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(/\/api\/projects(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([project]) });
  });

  await page.route(new RegExp(`/api/projects/${projectId}/tracks/${trackId}(?:\\?.*)?$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(track) });
  });

  await page.route(`**/api/projects/${projectId}/tracks/${trackId}/lyrics/lease`, async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          leaseToken: "lease-token-1",
          acquiredAt: "2026-07-05T00:00:00.000Z",
          expiresAt: "2026-07-05T00:05:00.000Z",
          heartbeatIntervalMs: 30000,
        }),
      });
      return;
    }

    if (method === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ expiresAt: "2026-07-05T00:05:00.000Z" }),
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ released: true }),
      });
      return;
    }

    await route.fallback();
  });

  await page.route(`**/api/projects/${projectId}/tracks/${trackId}/lyrics/draft`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: track.lyrics,
        document: null,
        revision: 5,
        updatedAt: "2026-07-05T00:01:00.000Z",
      }),
    });
  });
}

test("mobile deep-link editing button remains a stable click target", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await installWorkspaceMocks(page);

  await page.goto(`/app/projects/${projectId}/tracks/${trackId}`, { waitUntil: "networkidle" });

  const editButton = page.getByRole("button", { name: "Редактирование" });
  await expect(editButton).toHaveCount(1);
  await expect(editButton).toBeVisible();
  await editButton.scrollIntoViewIfNeeded();

  const hitTest = await editButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const stack = document.elementsFromPoint(centerX, centerY);
    const top = stack[0] as Element | undefined;

    return {
      centerX,
      centerY,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      topTag: top?.tagName ?? null,
      topText: top?.textContent?.trim().slice(0, 64) ?? null,
      targetOwnsTop: Boolean(top && (top === button || button.contains(top))),
    };
  });

  expect(hitTest.targetOwnsTop).toBe(true);
  expect(hitTest.scrollWidth).toBeLessThanOrEqual(hitTest.innerWidth + 4);

  await editButton.click();

  await expect(page.getByPlaceholder("Вставьте или напишите текст песни...")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/tracks/${trackId}$`));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 4)).toBe(true);
});
