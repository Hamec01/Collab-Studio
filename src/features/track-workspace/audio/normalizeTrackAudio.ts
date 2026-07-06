import type { AudioVersion, PlayableAudioSource, Track, TrackAsset } from "../../../types";

const DELIVERABLE_ASSET_KINDS = new Set<TrackAsset["kind"]>([
  "MASTER",
  "AUDIO_VERSION",
  "INSTRUMENTAL",
  "ACAPELLA",
  "STEM",
  "DEMO",
  "REFERENCE",
  "OTHER",
]);

type NormalizedTrackAudioResult = {
  sources: PlayableAudioSource[];
  current: PlayableAudioSource | null;
};

function safeTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareByPreferredOrder(a: PlayableAudioSource, b: PlayableAudioSource) {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  const aVersion = a.versionNumber ?? -1;
  const bVersion = b.versionNumber ?? -1;
  if (aVersion !== bVersion) return bVersion - aVersion;
  const createdDiff = safeTimestamp(b.createdAt) - safeTimestamp(a.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

function isSafeExternalUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUsableTrackAsset(asset: TrackAsset) {
  if (asset.status !== "READY" || asset.deletedAt) return false;
  if (!DELIVERABLE_ASSET_KINDS.has(asset.kind)) return false;
  if (asset.externalUrl) return isSafeExternalUrl(asset.externalUrl);
  return Boolean(asset.streamUrl);
}

function isUsableLegacyAudio(audio: AudioVersion) {
  if (audio.streamUrl) return true;
  return isSafeExternalUrl(audio.externalUrl);
}

function toAssetSource(asset: TrackAsset): PlayableAudioSource {
  const supportsTimestampAnnotations = Boolean(asset.id && asset.streamUrl);
  return {
    sourceType: "asset",
    id: asset.id,
    trackAssetId: asset.id,
    legacyAudioVersionId: asset.legacyAudioVersionId,
    versionNumber: asset.versionNumber,
    title: asset.title ?? asset.originalFilename,
    originalFilename: asset.originalFilename,
    streamUrl: asset.streamUrl,
    downloadUrl: asset.downloadUrl,
    externalUrl: isSafeExternalUrl(asset.externalUrl) ? asset.externalUrl : null,
    externalProvider: asset.externalProvider,
    mimeType: asset.mimeType,
    durationMs: asset.durationMs,
    isPrimary: asset.isPrimary,
    createdAt: asset.createdAt,
    uploadedBy: asset.uploadedBy,
    canDelete: Boolean(asset.legacyAudioVersionId),
    supportsTimestampAnnotations,
  };
}

function toLegacySource(audio: AudioVersion): PlayableAudioSource {
  return {
    sourceType: "legacy",
    id: audio.id,
    trackAssetId: null,
    legacyAudioVersionId: audio.id,
    versionNumber: audio.versionNumber,
    title: audio.originalFilename,
    originalFilename: audio.originalFilename,
    streamUrl: audio.streamUrl,
    downloadUrl: audio.isExternal ? null : audio.streamUrl?.replace(/\/stream$/, "/download") ?? null,
    externalUrl: isSafeExternalUrl(audio.externalUrl) ? audio.externalUrl : null,
    externalProvider: audio.externalProvider,
    mimeType: audio.mimeType,
    durationMs: audio.durationSeconds !== null ? Math.round(audio.durationSeconds * 1000) : null,
    isPrimary: false,
    createdAt: audio.createdAt,
    uploadedBy: audio.uploadedBy,
    canDelete: true,
    supportsTimestampAnnotations: false,
  };
}

export function normalizeTrackAudioSources(track: Pick<Track, "audioVersions" | "assets">): PlayableAudioSource[] {
  const byAssetId = new Set<string>();
  const mappedLegacyAudioIds = new Set<string>();

  const assetSources = (track.assets ?? [])
    .filter((asset) => {
      if (!isUsableTrackAsset(asset)) return false;
      if (byAssetId.has(asset.id)) return false;
      byAssetId.add(asset.id);
      if (asset.legacyAudioVersionId) mappedLegacyAudioIds.add(asset.legacyAudioVersionId);
      return true;
    })
    .map(toAssetSource)
    .sort(compareByPreferredOrder)
    .map((source, index, all) => ({
      ...source,
      isPrimary: index === 0 ? true : source.isPrimary && all.findIndex((entry) => entry.isPrimary) === index,
    }));

  const legacySources = track.audioVersions
    .filter((audio) => isUsableLegacyAudio(audio) && !mappedLegacyAudioIds.has(audio.id))
    .map(toLegacySource);

  return [...assetSources, ...legacySources];
}

export function resolveSelectedAudioSource(
  sources: PlayableAudioSource[],
  selectedAudioSourceId: string | null,
) {
  if (selectedAudioSourceId) {
    const selected = sources.find((source) => source.id === selectedAudioSourceId);
    if (selected) return selected;
  }
  return sources[0] ?? null;
}

export function normalizeTrackAudio(
  track: Pick<Track, "audioVersions" | "assets">,
  selectedAudioSourceId: string | null,
): NormalizedTrackAudioResult {
  const sources = normalizeTrackAudioSources(track);
  return {
    sources,
    current: resolveSelectedAudioSource(sources, selectedAudioSourceId),
  };
}
