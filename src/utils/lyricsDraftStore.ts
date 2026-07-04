import type { LyricsDocument } from "../features/track-workspace/lyrics/lyricsDocument";

export type LyricsDraftSyncState = "local-only" | "synced" | "conflict" | "error";

export type StoredLyricsDraft = {
  key: string;
  userId: string;
  projectId: string;
  trackId: string;
  content: string;
  document?: LyricsDocument;
  baseRevision?: number;
  savedAt: string;
  serverUpdatedAt?: string;
  syncState: LyricsDraftSyncState;
};

const DB_NAME = "collabstudio-drafts";
const STORE_NAME = "lyrics-drafts";
const DB_VERSION = 1;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        run(store, resolve, reject);
        tx.oncomplete = () => db.close();
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      }),
  );
}

export function buildLyricsDraftKey(userId: string, projectId: string, trackId: string) {
  return `lyrics-draft:${userId}:${projectId}:${trackId}`;
}

export function readLyricsDraft(key: string) {
  return withStore<StoredLyricsDraft | null>("readonly", (store, resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as StoredLyricsDraft | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to read IndexedDB draft"));
  });
}

export function writeLyricsDraft(draft: StoredLyricsDraft) {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const req = store.put(draft);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to write IndexedDB draft"));
  });
}

export function deleteLyricsDraft(key: string) {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete IndexedDB draft"));
  });
}
