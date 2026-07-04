export const LYRICS_AUTOSAVE_DEBOUNCE_MS = 1500;
export const LYRICS_RETRY_BASE_MS = 1200;
export const LYRICS_RETRY_MAX_MS = 30000;

export type DraftSyncState = "local-only" | "synced" | "conflict" | "error";
