import { buildLyricsDraftKey, deleteLyricsDraft, readLyricsDraft, writeLyricsDraft } from "../../utils/lyricsDraftStore";
import { isLyricsDocument, type LyricsDocument } from "../../features/track-workspace/lyrics/lyricsDocument";
import {
  type DraftScope,
  type EmergencyDraftSnapshot,
  pickMostRecentDraft,
} from "../../utils/lyricsDraftRecovery";

function emergencyDraftStorageKey(key: string) {
  return `lyrics-draft-emergency:${key}`;
}

export function buildDraftScope(userId: string, projectId: string, trackId: string): DraftScope {
  return {
    userId,
    projectId,
    trackId,
    key: buildLyricsDraftKey(userId, projectId, trackId),
  };
}

export function parseEmergencyDraft(raw: string | null): EmergencyDraftSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EmergencyDraftSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.key !== "string" || typeof parsed.content !== "string" || typeof parsed.savedAt !== "string") return null;
    if (parsed.document !== undefined && !isLyricsDocument(parsed.document)) return null;
    if (parsed.document) parsed.document = parsed.document as LyricsDocument;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEmergencyDraft(snapshot: EmergencyDraftSnapshot) {
  try {
    sessionStorage.setItem(emergencyDraftStorageKey(snapshot.key), JSON.stringify(snapshot));
  } catch {
    // ignore sessionStorage errors; IndexedDB remains primary
  }
}

export function clearEmergencyDraft(key: string) {
  try {
    sessionStorage.removeItem(emergencyDraftStorageKey(key));
  } catch {
    // ignore sessionStorage errors
  }
}

export async function readMergedDraft(scope: DraftScope) {
  const [indexedDbDraft, emergencyDraft] = await Promise.all([
    readLyricsDraft(scope.key).catch(() => null),
    Promise.resolve(parseEmergencyDraft(sessionStorage.getItem(emergencyDraftStorageKey(scope.key)))),
  ]);

  return pickMostRecentDraft(indexedDbDraft, emergencyDraft, scope);
}

export async function writeLocalDraft(scope: DraftScope, payload: {
  content: string;
  document?: LyricsDocument;
  baseRevision?: number;
  serverUpdatedAt?: string;
  syncState: "local-only" | "synced" | "conflict" | "error";
}) {
  await writeLyricsDraft({
    key: scope.key,
    userId: scope.userId,
    projectId: scope.projectId,
    trackId: scope.trackId,
    content: payload.content,
    document: payload.document,
    savedAt: new Date().toISOString(),
    baseRevision: payload.baseRevision,
    serverUpdatedAt: payload.serverUpdatedAt,
    syncState: payload.syncState,
  });
}

export async function removeLocalDraft(scope: DraftScope) {
  await deleteLyricsDraft(scope.key);
  clearEmergencyDraft(scope.key);
}
