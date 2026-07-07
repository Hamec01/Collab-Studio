/**
 * Stage 8 Slice 2 — Service worker message utilities.
 *
 * Provides a typed, fire-and-forget helper to send messages to the
 * active service worker without coupling callers to the SW API.
 *
 * Security contract: logout must trigger CLEAR_CACHES so that no
 * private app-shell data survives for the next user on the same device.
 * Private media (audio files, signed URLs) is served via NetworkOnly and
 * never cached, so we only need to clear the precache + navigation fallback.
 */

export type SwMessage =
  | { type: "CLEAR_CACHES" }
  | { type: "SKIP_WAITING" };

/**
 * Send a message to the active service worker.
 * Silently no-ops when SW is not supported or not yet active.
 */
export function sendSwMessage(message: SwMessage): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker.controller;
  if (!sw) return;
  try {
    sw.postMessage(message);
  } catch {
    // SW may have been terminated; ignore
  }
}

/**
 * Clear all SW caches on logout to prevent data leakage to the next user.
 * Calls the SW to delete its own caches, then clears the Cache Storage
 * directly from the page as a belt-and-suspenders measure.
 */
export async function clearSwCachesOnLogout(): Promise<void> {
  sendSwMessage({ type: "CLEAR_CACHES" });

  // Belt-and-suspenders: delete all caches from the page side too
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      // Non-fatal; the SW message is the primary mechanism
    }
  }
}
