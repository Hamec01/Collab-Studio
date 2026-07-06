import type { TrackAsset } from "@prisma/client";
import type { TrackAssetDto, TrackAssetLike } from "../services/trackAssets";
import {
  buildTrackAssetDownloadUrl,
  buildTrackAssetStreamUrl,
  canExposeTrackAssetDeliveryUrls,
  serializeTrackAssetSizeBytes,
} from "../services/trackAssets";

type UploadedByLike = {
  id: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type TrackAssetWithUploader = TrackAssetLike & {
  uploadedBy?: UploadedByLike | null;
};

export function serializeTrackAsset(asset: TrackAssetWithUploader): TrackAssetDto {
  const streamUrl = !canExposeTrackAssetDeliveryUrls(asset)
    ? null
    : buildTrackAssetStreamUrl(asset.projectId, asset.trackId, asset.id);
  const downloadUrl = !canExposeTrackAssetDeliveryUrls(asset)
    ? null
    : buildTrackAssetDownloadUrl(asset.projectId, asset.trackId, asset.id);

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
