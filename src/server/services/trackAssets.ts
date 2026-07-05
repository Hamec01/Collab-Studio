import path from "node:path";
import type { ExternalProvider, TrackAssetKind, TrackAssetStatus } from "@prisma/client";
import { AppError } from "../middleware/errors";

export const trackAssetKinds = [
  "MASTER",
  "AUDIO_VERSION",
  "INSTRUMENTAL",
  "ACAPELLA",
  "STEM",
  "DEMO",
  "REFERENCE",
  "OTHER",
] as const satisfies readonly TrackAssetKind[];

export const trackAssetStatuses = [
  "UPLOADING",
  "READY",
  "FAILED",
  "DELETED",
] as const satisfies readonly TrackAssetStatus[];

export type TrackAssetDto = {
  id: string;
  trackId: string;
  projectId: string;
  uploadedByUserId: string | null;
  kind: TrackAssetKind;
  status: TrackAssetStatus;
  title: string | null;
  originalFilename: string;
  storageKey: string | null;
  storageProvider: string;
  externalUrl: string | null;
  externalProvider: ExternalProvider | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  checksum: string | null;
  waveformData: unknown | null;
  metadata: unknown;
  sourceAssetId: string | null;
  legacyAudioVersionId: string | null;
  versionNumber: number | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  streamUrl: string | null;
  downloadUrl: string | null;
  uploadedBy: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null;
};

export type LegacyAudioVersionLike = {
  id: string;
  trackId: string;
  originalFilename: string;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  externalUrl: string | null;
  isExternal: boolean;
  externalProvider: ExternalProvider | null;
  versionNumber: number;
  createdAt: Date;
  uploadedById?: string | null;
  uploadedBy?: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null;
};

export type TrackAssetLike = {
  id: string;
  trackId: string;
  projectId: string;
  uploadedByUserId: string | null;
  kind: TrackAssetKind;
  status: TrackAssetStatus;
  title: string | null;
  originalFilename: string;
  storageKey: string | null;
  storageProvider: string;
  externalUrl: string | null;
  externalProvider: ExternalProvider | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  checksum: string | null;
  waveformData: unknown | null;
  metadata: unknown;
  sourceAssetId: string | null;
  legacyAudioVersionId: string | null;
  versionNumber: number | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  uploadedBy?: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null;
};

export type AssetAccessLike = {
  role: "owner" | "editor" | "viewer";
  capabilities: {
    canUploadAudio: boolean;
    canDownload: boolean;
  };
};

export type AssetBackfillPlanInput = {
  projectId: string;
  audioVersion: LegacyAudioVersionLike;
  existingLegacyAudioVersionIds: ReadonlySet<string>;
};

function decodePathSegmentRepeatedly(segment: string) {
  let current = segment;
  for (let index = 0; index < 4; index += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key contains an invalid path segment");
    }
    if (decoded === current) return decoded;
    current = decoded;
  }
  return current;
}

function ensureSinglePrimaryAsset<T extends { isPrimary: boolean }>(assets: T[]) {
  if (assets.length === 0) return assets;
  if (assets.some((asset) => asset.isPrimary)) return assets;
  return assets.map((asset, index) => (index === 0 ? { ...asset, isPrimary: true } : asset));
}

export function serializeTrackAssetSizeBytes(sizeBytes: number | null | undefined) {
  if (sizeBytes === null || sizeBytes === undefined) return null;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new AppError(500, "INVALID_ASSET_SIZE", "Track asset size is invalid");
  }
  return sizeBytes;
}

export function isTrackAssetKind(value: string): value is TrackAssetKind {
  return (trackAssetKinds as readonly string[]).includes(value);
}

export function isTrackAssetStatus(value: string): value is TrackAssetStatus {
  return (trackAssetStatuses as readonly string[]).includes(value);
}

export function normalizeTrackAssetStorageKey(storageKey: string) {
  const normalized = storageKey.trim();
  if (!normalized) throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key is required");
  if (path.posix.isAbsolute(normalized) || normalized.includes("\\")) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key must be a relative POSIX path");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => {
    if (segment === "" || segment === "." || segment === "..") return true;
    const decoded = decodePathSegmentRepeatedly(segment);
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0");
  })) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key contains an invalid path segment");
  }
  const safe = path.posix.normalize(normalized);
  if (safe !== normalized) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key must already be normalized");
  }
  return safe;
}

export function resolveTrackAssetStoragePath(uploadsRoot: string, storageKey: string) {
  const normalized = normalizeTrackAssetStorageKey(storageKey);
  const resolvedRoot = path.resolve(uploadsRoot);
  const resolved = path.resolve(resolvedRoot, ...normalized.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key escapes uploads root");
  }
  return resolved;
}

export function assertTrackAssetBelongsToTrackProject(
  asset: Pick<TrackAssetLike, "projectId" | "trackId">,
  expected: { projectId: string; trackId: string },
) {
  if (asset.projectId !== expected.projectId || asset.trackId !== expected.trackId) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Track asset not found");
  }
}

export function canReadTrackAsset(access: AssetAccessLike | null | undefined) {
  return Boolean(access);
}

export function canUploadTrackAsset(access: AssetAccessLike | null | undefined) {
  return Boolean(access?.capabilities.canUploadAudio && access.role !== "viewer");
}

export function canDeleteTrackAsset(access: AssetAccessLike | null | undefined) {
  return Boolean(access && access.role !== "viewer");
}

export function mapLegacyAudioVersionToTrackAssetDto(
  audio: LegacyAudioVersionLike,
  projectId: string,
  isPrimary: boolean,
): TrackAssetDto {
  const streamUrl = audio.isExternal ? null : `/api/projects/${projectId}/tracks/${audio.trackId}/audio/${audio.id}/stream`;
  const downloadUrl = audio.isExternal ? null : `/api/projects/${projectId}/tracks/${audio.trackId}/audio/${audio.id}/download`;
  return {
    id: `legacy-audio-${audio.id}`,
    trackId: audio.trackId,
    projectId,
    uploadedByUserId: audio.uploadedBy?.id ?? audio.uploadedById ?? null,
    kind: "AUDIO_VERSION",
    status: "READY",
    title: null,
    originalFilename: audio.originalFilename,
    storageKey: audio.storageKey,
    storageProvider: "local",
    externalUrl: audio.externalUrl,
    externalProvider: audio.externalProvider,
    mimeType: audio.mimeType,
    sizeBytes: serializeTrackAssetSizeBytes(audio.sizeBytes),
    durationMs: audio.durationSeconds !== null && audio.durationSeconds !== undefined
      ? Math.max(Math.round(audio.durationSeconds * 1000), 0)
      : null,
    checksum: null,
    waveformData: null,
    metadata: { legacyAudioVersionId: audio.id, source: "AudioVersion" },
    sourceAssetId: null,
    legacyAudioVersionId: audio.id,
    versionNumber: audio.versionNumber,
    isPrimary,
    createdAt: audio.createdAt.toISOString(),
    updatedAt: audio.createdAt.toISOString(),
    deletedAt: null,
    streamUrl,
    downloadUrl,
    uploadedBy: audio.uploadedBy
      ? {
          id: audio.uploadedBy.id ?? null,
          displayName: audio.uploadedBy.displayName,
          avatarUrl: audio.uploadedBy.avatarUrl ?? null,
        }
      : null,
  };
}

export function mapLegacyAudioVersionToTrackAssetLike(
  audio: LegacyAudioVersionLike,
  projectId: string,
  isPrimary: boolean,
): TrackAssetLike {
  return {
    id: `legacy-audio-${audio.id}`,
    trackId: audio.trackId,
    projectId,
    uploadedByUserId: audio.uploadedBy?.id ?? audio.uploadedById ?? null,
    kind: "AUDIO_VERSION",
    status: "READY",
    title: null,
    originalFilename: audio.originalFilename,
    storageKey: audio.storageKey,
    storageProvider: "local",
    externalUrl: audio.externalUrl,
    externalProvider: audio.externalProvider,
    mimeType: audio.mimeType,
    sizeBytes: serializeTrackAssetSizeBytes(audio.sizeBytes),
    durationMs: audio.durationSeconds !== null && audio.durationSeconds !== undefined
      ? Math.max(Math.round(audio.durationSeconds * 1000), 0)
      : null,
    checksum: null,
    waveformData: null,
    metadata: { legacyAudioVersionId: audio.id, source: "AudioVersion" },
    sourceAssetId: null,
    legacyAudioVersionId: audio.id,
    versionNumber: audio.versionNumber,
    isPrimary,
    createdAt: audio.createdAt,
    updatedAt: audio.createdAt,
    deletedAt: null,
    uploadedBy: audio.uploadedBy
      ? {
          id: audio.uploadedBy.id ?? null,
          displayName: audio.uploadedBy.displayName,
          avatarUrl: audio.uploadedBy.avatarUrl ?? null,
        }
      : null,
  };
}

export function selectTrackAssetsWithFallback(input: {
  trackAssets: TrackAssetLike[];
  legacyAudioVersions: LegacyAudioVersionLike[];
  projectId: string;
}) {
  if (input.trackAssets.length > 0) {
    const mappedLegacyIds = new Set(
      input.trackAssets
        .map((asset) => asset.legacyAudioVersionId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    const fallbackLegacy = input.legacyAudioVersions
      .filter((audio) => !mappedLegacyIds.has(audio.id))
      .map((audio) => mapLegacyAudioVersionToTrackAssetLike(audio, input.projectId, false));

    if (fallbackLegacy.length === 0) {
      return { source: "trackAsset" as const, assets: ensureSinglePrimaryAsset([...input.trackAssets]) };
    }

    const assets = ensureSinglePrimaryAsset([...input.trackAssets, ...fallbackLegacy]);
    return { source: "merged" as const, assets };
  }
  return {
    source: "audioVersion" as const,
    assets: ensureSinglePrimaryAsset(
      input.legacyAudioVersions.map((audio) => mapLegacyAudioVersionToTrackAssetDto(audio, input.projectId, false)),
    ),
  };
}

export function buildTrackAssetBackfillPlan(input: AssetBackfillPlanInput) {
  if (input.existingLegacyAudioVersionIds.has(input.audioVersion.id)) {
    return {
      action: "skip" as const,
      reason: "duplicate_legacy_audio_version",
      legacyAudioVersionId: input.audioVersion.id,
    };
  }

  return {
    action: "create" as const,
    data: {
      trackId: input.audioVersion.trackId,
      projectId: input.projectId,
      uploadedByUserId: input.audioVersion.uploadedById ?? null,
      kind: "AUDIO_VERSION" as const,
      status: "READY" as const,
      title: null,
      originalFilename: input.audioVersion.originalFilename,
      storageKey: input.audioVersion.storageKey,
      storageProvider: "local",
      externalUrl: input.audioVersion.externalUrl,
      externalProvider: input.audioVersion.externalProvider,
      mimeType: input.audioVersion.mimeType,
      sizeBytes: input.audioVersion.sizeBytes,
      durationMs: input.audioVersion.durationSeconds !== null && input.audioVersion.durationSeconds !== undefined
        ? Math.max(Math.round(input.audioVersion.durationSeconds * 1000), 0)
        : null,
      metadata: { source: "AudioVersion" },
      legacyAudioVersionId: input.audioVersion.id,
      versionNumber: input.audioVersion.versionNumber,
      isPrimary: false,
      createdAt: input.audioVersion.createdAt,
    },
  };
}
