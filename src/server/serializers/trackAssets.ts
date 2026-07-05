import type { TrackAsset } from "@prisma/client";
import type { TrackAssetDto, TrackAssetLike } from "../services/trackAssets";
import { serializeTrackAssetSizeBytes } from "../services/trackAssets";

type UploadedByLike = {
  id: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type TrackAssetWithUploader = TrackAssetLike & {
  uploadedBy?: UploadedByLike | null;
};

export function serializeTrackAsset(asset: TrackAssetWithUploader): TrackAssetDto {
  const isPlayableLegacyAsset = asset.status === "READY" && !asset.deletedAt && !asset.externalUrl && Boolean(asset.legacyAudioVersionId);
  const streamUrl = !isPlayableLegacyAsset
    ? null
    : `/api/projects/${asset.projectId}/tracks/${asset.trackId}/audio/${asset.legacyAudioVersionId}/stream`;
  const downloadUrl = !isPlayableLegacyAsset
    ? null
    : `/api/projects/${asset.projectId}/tracks/${asset.trackId}/audio/${asset.legacyAudioVersionId}/download`;

  return {
    id: asset.id,
    trackId: asset.trackId,
    projectId: asset.projectId,
    uploadedByUserId: asset.uploadedByUserId,
    kind: asset.kind,
    status: asset.status,
    title: asset.title,
    originalFilename: asset.originalFilename,
    storageProvider: asset.storageProvider,
    externalUrl: asset.externalUrl,
    externalProvider: asset.externalProvider,
    mimeType: asset.mimeType,
    sizeBytes: serializeTrackAssetSizeBytes(asset.sizeBytes),
    durationMs: asset.durationMs,
    waveformData: asset.waveformData,
    metadata: asset.metadata,
    sourceAssetId: asset.sourceAssetId,
    legacyAudioVersionId: asset.legacyAudioVersionId,
    versionNumber: asset.versionNumber,
    isPrimary: asset.isPrimary,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null,
    streamUrl,
    downloadUrl,
    uploadedBy: asset.uploadedBy
      ? {
          id: asset.uploadedBy.id ?? null,
          displayName: asset.uploadedBy.displayName,
          avatarUrl: asset.uploadedBy.avatarUrl ?? null,
        }
      : null,
  };
}
