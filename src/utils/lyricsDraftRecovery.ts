import { LyricsDraftSyncState, StoredLyricsDraft } from "./lyricsDraftStore";
import type { LyricsDocument } from "../features/track-workspace/lyrics/lyricsDocument";

export type DraftScope = {
  key: string;
  userId: string;
  projectId: string;
  trackId: string;
};

export type EmergencyDraftSnapshot = {
  key: string;
  content: string;
  document?: LyricsDocument;
  savedAt: string;
  baseRevision?: number;
  serverUpdatedAt?: string;
  syncState: LyricsDraftSyncState;
};

function toTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fromEmergency(scope: DraftScope, emergency: EmergencyDraftSnapshot): StoredLyricsDraft {
  return {
    key: emergency.key,
    userId: scope.userId,
    projectId: scope.projectId,
    trackId: scope.trackId,
    content: emergency.content,
    document: emergency.document,
    baseRevision: emergency.baseRevision,
    savedAt: emergency.savedAt,
    serverUpdatedAt: emergency.serverUpdatedAt,
    syncState: emergency.syncState,
  };
}

export function pickMostRecentDraft(
  indexedDbDraft: StoredLyricsDraft | null,
  emergencyDraft: EmergencyDraftSnapshot | null,
  scope: DraftScope,
) {
  if (!indexedDbDraft && !emergencyDraft) return null;
  if (indexedDbDraft && !emergencyDraft) return indexedDbDraft;
  if (!indexedDbDraft && emergencyDraft) return fromEmergency(scope, emergencyDraft);

  if (!indexedDbDraft || !emergencyDraft) return null;
  return toTime(indexedDbDraft.savedAt) >= toTime(emergencyDraft.savedAt)
    ? indexedDbDraft
    : fromEmergency(scope, emergencyDraft);
}

export function shouldRestoreFromLocal(localContent: string, serverContent: string) {
  return localContent !== serverContent;
}

export function isLatestContentSynced(serverContent: string, latestLocalContent: string) {
  return serverContent === latestLocalContent;
}