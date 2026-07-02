import assert from "node:assert/strict";
import test from "node:test";
import type { StoredLyricsDraft } from "./lyricsDraftStore";
import {
  isLatestContentSynced,
  pickMostRecentDraft,
  shouldRestoreFromLocal,
  type DraftScope,
  type EmergencyDraftSnapshot,
} from "./lyricsDraftRecovery";

const scope: DraftScope = {
  key: "lyrics-draft:user:project:track",
  userId: "user",
  projectId: "project",
  trackId: "track",
};

function makeStored(overrides: Partial<StoredLyricsDraft> = {}): StoredLyricsDraft {
  return {
    key: scope.key,
    userId: scope.userId,
    projectId: scope.projectId,
    trackId: scope.trackId,
    content: "local",
    savedAt: "2026-07-02T10:00:00.000Z",
    syncState: "local-only",
    ...overrides,
  };
}

function makeEmergency(overrides: Partial<EmergencyDraftSnapshot> = {}): EmergencyDraftSnapshot {
  return {
    key: scope.key,
    content: "emergency",
    savedAt: "2026-07-02T10:00:00.000Z",
    syncState: "local-only",
    ...overrides,
  };
}

test("pickMostRecentDraft returns indexedDB draft when it is newer", () => {
  const idb = makeStored({ savedAt: "2026-07-02T10:00:02.000Z", content: "idb-new" });
  const emergency = makeEmergency({ savedAt: "2026-07-02T10:00:01.000Z", content: "emergency-old" });

  const picked = pickMostRecentDraft(idb, emergency, scope);
  assert.equal(picked?.content, "idb-new");
  assert.equal(picked?.userId, scope.userId);
});

test("pickMostRecentDraft returns emergency draft when it is newer", () => {
  const idb = makeStored({ savedAt: "2026-07-02T10:00:01.000Z", content: "idb-old" });
  const emergency = makeEmergency({ savedAt: "2026-07-02T10:00:03.000Z", content: "emergency-new" });

  const picked = pickMostRecentDraft(idb, emergency, scope);
  assert.equal(picked?.content, "emergency-new");
  assert.equal(picked?.projectId, scope.projectId);
  assert.equal(picked?.trackId, scope.trackId);
});

test("shouldRestoreFromLocal detects differing content", () => {
  assert.equal(shouldRestoreFromLocal("local text", "server text"), true);
  assert.equal(shouldRestoreFromLocal("same", "same"), false);
});

test("isLatestContentSynced rejects stale response content", () => {
  assert.equal(isLatestContentSynced("abc", "abc"), true);
  assert.equal(isLatestContentSynced("abc", "abcd"), false);
});
