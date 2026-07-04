import type { LyricVersion } from "../../../types";
import {
  legacyPlainTextToLyricsDocument,
  lyricsDocumentToPlainText,
  normalizeLyricsDocument,
  type LyricsDocument,
} from "./lyricsDocument";

export type CreateLyricSnapshotPayload =
  | { label: string; lyrics: string }
  | { label: string; document: LyricsDocument };

export type RestoreLyricSnapshotPayload =
  | { content: string; baseRevision: number; leaseToken: string }
  | { document: LyricsDocument; baseRevision: number; leaseToken: string };

function sanitizeFilenameSegment(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, " ")
    .replace(/[^\p{L}\p{N}._ -]+/gu, " ")
    .replace(/[\s._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

export function resolveSnapshotPlainText(version: Pick<LyricVersion, "lyrics" | "plainText" | "document">) {
  if (version.document) return lyricsDocumentToPlainText(version.document);
  if (typeof version.plainText === "string") return version.plainText;
  return version.lyrics;
}

export function resolveSnapshotDocument(version: Pick<LyricVersion, "lyrics" | "document">) {
  if (version.document) return normalizeLyricsDocument(version.document);
  return legacyPlainTextToLyricsDocument(version.lyrics);
}

export function buildCreateLyricSnapshotPayload(
  structured: boolean,
  document: LyricsDocument,
  plainText: string,
  label: string,
): CreateLyricSnapshotPayload {
  return structured
    ? { label, document: normalizeLyricsDocument(document) }
    : { label, lyrics: plainText };
}

export function buildRestoreLyricSnapshotPayload(
  structured: boolean,
  version: Pick<LyricVersion, "lyrics" | "plainText" | "document">,
  baseRevision: number,
  leaseToken: string,
): RestoreLyricSnapshotPayload {
  return structured
    ? { document: resolveSnapshotDocument(version), baseRevision, leaseToken }
    : { content: resolveSnapshotPlainText(version), baseRevision, leaseToken };
}

export function buildLyricsTxtFilename(trackTitle: string, label?: string | null) {
  const trackSegment = sanitizeFilenameSegment(trackTitle, "track");
  const labelSegment = label ? sanitizeFilenameSegment(label, "snapshot") : null;
  return labelSegment
    ? `lyrics-${trackSegment}-${labelSegment}.txt`
    : `lyrics-${trackSegment}.txt`;
}

export function downloadLyricsTxtFile(plainText: string, filename: string) {
  const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadLocalLyricsDraft(input: {
  trackTitle: string | null;
  readLocalDraft: () => Promise<{ content: string } | null>;
}) {
  if (!input.trackTitle) return;
  const localDraft = await input.readLocalDraft();
  if (!localDraft) return;
  downloadLyricsTxtFile(localDraft.content, buildLyricsTxtFilename(input.trackTitle, "local-draft"));
}

export async function createLyricSnapshot(input: {
  activeProjectId: string | null;
  activeTrackId: string | null;
  canEdit: boolean;
  syncDraft: () => Promise<boolean>;
  onSyncRequired: () => void;
  createVersion: (projectId: string, trackId: string, payload: CreateLyricSnapshotPayload) => Promise<unknown>;
  structured: boolean;
  document: LyricsDocument;
  plainText: string;
  label: string;
  refreshTrack: () => Promise<void>;
}) {
  if (!input.activeProjectId || !input.activeTrackId || !input.canEdit) return;
  if (!await input.syncDraft()) {
    input.onSyncRequired();
    return;
  }
  await input.createVersion(
    input.activeProjectId,
    input.activeTrackId,
    buildCreateLyricSnapshotPayload(input.structured, input.document, input.plainText, input.label),
  );
  await input.refreshTrack();
}

export async function restoreLyricSnapshot(input: {
  activeTrackId: string | null;
  canEdit: boolean;
  isEditing: boolean;
  requestEdit: () => Promise<boolean>;
  version: LyricVersion;
  structured: boolean;
  setDocument: (document: LyricsDocument) => void;
  applyPlainText: (plainText: string, preserveDocument: boolean) => void;
  clearSelection: () => void;
  syncDraft: () => Promise<boolean>;
}) {
  if (!input.activeTrackId || !input.canEdit) return false;
  if (!input.isEditing && !await input.requestEdit()) return false;
  if (input.structured) input.setDocument(resolveSnapshotDocument(input.version));
  input.applyPlainText(resolveSnapshotPlainText(input.version), input.structured);
  input.clearSelection();
  return input.syncDraft();
}

export function exportLyricsTxt(input: {
  trackTitle: string | null;
  version: LyricVersion | null;
  structured: boolean;
  currentDocument: LyricsDocument;
  currentPlainText: string;
}) {
  if (!input.trackTitle) return;
  const plainText = input.version
    ? resolveSnapshotPlainText(input.version)
    : input.structured
      ? lyricsDocumentToPlainText(input.currentDocument)
      : input.currentPlainText;
  downloadLyricsTxtFile(plainText, buildLyricsTxtFilename(input.trackTitle, input.version?.label ?? null));
}
