import { describe, expect, it } from "vitest";
import type { AudioVersion, TrackAsset } from "../../../types";
import { normalizeTrackAudio, normalizeTrackAudioSources } from "./normalizeTrackAudio";

function makeAudioVersion(overrides: Partial<AudioVersion> = {}): AudioVersion {
  return {
    id: overrides.id ?? "legacy-1",
    originalFilename: overrides.originalFilename ?? "legacy.wav",
    mimeType: overrides.mimeType ?? "audio/wav",
    sizeBytes: overrides.sizeBytes ?? 1024,
    durationSeconds: overrides.durationSeconds ?? 12.5,
    versionNumber: overrides.versionNumber ?? 1,
    uploadedBy: overrides.uploadedBy ?? { id: "u1", displayName: "User 1", avatarUrl: null },
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
    streamUrl: overrides.streamUrl ?? "/legacy/stream",
    isExternal: overrides.isExternal ?? false,
    externalUrl: overrides.externalUrl ?? null,
    externalProvider: overrides.externalProvider ?? null,
  };
}

function makeTrackAsset(overrides: Partial<TrackAsset> = {}): TrackAsset {
  return {
    id: overrides.id ?? "asset-1",
    trackId: overrides.trackId ?? "track-1",
    projectId: overrides.projectId ?? "project-1",
    uploadedByUserId: overrides.uploadedByUserId ?? "u1",
    kind: overrides.kind ?? "AUDIO_VERSION",
    status: overrides.status ?? "READY",
    title: overrides.title ?? null,
    originalFilename: overrides.originalFilename ?? "asset.wav",
    storageProvider: overrides.storageProvider ?? "local",
    externalUrl: "externalUrl" in overrides ? overrides.externalUrl ?? null : null,
    externalProvider: overrides.externalProvider ?? null,
    mimeType: overrides.mimeType ?? "audio/wav",
    sizeBytes: overrides.sizeBytes ?? 2048,
    durationMs: overrides.durationMs ?? 13000,
    waveformData: overrides.waveformData ?? null,
    metadata: overrides.metadata ?? {},
    sourceAssetId: overrides.sourceAssetId ?? null,
    legacyAudioVersionId: overrides.legacyAudioVersionId ?? null,
    versionNumber: overrides.versionNumber ?? 1,
    isPrimary: overrides.isPrimary ?? false,
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-06T10:00:00.000Z",
    deletedAt: overrides.deletedAt ?? null,
    streamUrl: "streamUrl" in overrides ? overrides.streamUrl ?? null : "/asset/stream",
    downloadUrl: "downloadUrl" in overrides ? overrides.downloadUrl ?? null : "/asset/download",
    uploadedBy: overrides.uploadedBy ?? { id: "u1", displayName: "User 1", avatarUrl: null },
  };
}

describe("normalizeTrackAudioSources", () => {
  it("supports legacy-only tracks", () => {
    const sources = normalizeTrackAudioSources({ assets: [], audioVersions: [makeAudioVersion()] });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ sourceType: "legacy", id: "legacy-1", canDelete: true });
  });

  it("supports assets-only local tracks", () => {
    const sources = normalizeTrackAudioSources({ assets: [makeTrackAsset()], audioVersions: [] });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ sourceType: "asset", id: "asset-1", canDelete: false });
  });

  it("dedupes mapped asset and matching legacy audio", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ id: "asset-a", legacyAudioVersionId: "legacy-a" })],
      audioVersions: [makeAudioVersion({ id: "legacy-a" })],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe("asset-a");
  });

  it("merges partial backfill without duplicates", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ id: "asset-a", legacyAudioVersionId: "legacy-a", versionNumber: 2 })],
      audioVersions: [makeAudioVersion({ id: "legacy-a", versionNumber: 2 }), makeAudioVersion({ id: "legacy-b", versionNumber: 1 })],
    });
    expect(sources.map((source) => source.id)).toEqual(["asset-a", "legacy-b"]);
  });

  it("keeps native asset without legacy link", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ id: "native-1", legacyAudioVersionId: null })],
      audioVersions: [],
    });
    expect(sources[0]).toMatchObject({ id: "native-1", sourceType: "asset", canDelete: false });
  });

  it("prefers explicit primary asset", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({ id: "asset-1", isPrimary: false, versionNumber: 1 }),
        makeTrackAsset({ id: "asset-2", isPrimary: true, versionNumber: 2 }),
      ],
      audioVersions: [],
    });
    expect(sources[0].id).toBe("asset-2");
    expect(sources[0].isPrimary).toBe(true);
  });

  it("falls back to highest version number", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({ id: "asset-1", versionNumber: 1 }),
        makeTrackAsset({ id: "asset-2", versionNumber: 3 }),
      ],
      audioVersions: [],
    });
    expect(sources[0].id).toBe("asset-2");
  });

  it("falls back to newest createdAt when version numbers match", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({ id: "asset-1", versionNumber: 2, createdAt: "2026-07-06T09:00:00.000Z" }),
        makeTrackAsset({ id: "asset-2", versionNumber: 2, createdAt: "2026-07-06T11:00:00.000Z" }),
      ],
      audioVersions: [],
    });
    expect(sources[0].id).toBe("asset-2");
  });

  it("uses stable id tie-break when timestamps match", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({ id: "asset-b", versionNumber: 2, createdAt: "2026-07-06T11:00:00.000Z" }),
        makeTrackAsset({ id: "asset-a", versionNumber: 2, createdAt: "2026-07-06T11:00:00.000Z" }),
      ],
      audioVersions: [],
    });
    expect(sources.map((source) => source.id)).toEqual(["asset-a", "asset-b"]);
  });

  it("excludes uploading assets", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ status: "UPLOADING" })],
      audioVersions: [],
    });
    expect(sources).toEqual([]);
  });

  it("excludes failed assets", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ status: "FAILED" })],
      audioVersions: [],
    });
    expect(sources).toEqual([]);
  });

  it("excludes deleted assets", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ deletedAt: "2026-07-06T12:00:00.000Z" })],
      audioVersions: [],
    });
    expect(sources).toEqual([]);
  });

  it("excludes ready assets without stream or external url", () => {
    const sources = normalizeTrackAudioSources({
      assets: [makeTrackAsset({ streamUrl: null, externalUrl: null })],
      audioVersions: [],
    });
    expect(sources).toEqual([]);
  });

  it("normalizes external assets", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({
          id: "ext-1",
          storageProvider: "external",
          streamUrl: null,
          downloadUrl: null,
          externalUrl: "https://example.com/audio.mp3",
          externalProvider: "other",
        }),
      ],
      audioVersions: [],
    });
    expect(sources[0]).toMatchObject({ id: "ext-1", externalUrl: "https://example.com/audio.mp3", streamUrl: null });
  });

  it("excludes invalid external schemes", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({
          storageProvider: "external",
          streamUrl: null,
          downloadUrl: null,
          externalUrl: "javascript:alert(1)",
        }),
      ],
      audioVersions: [],
    });
    expect(sources).toEqual([]);
  });

  it("suppresses mapped external legacy duplicates", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({
          id: "asset-ext",
          legacyAudioVersionId: "legacy-ext",
          storageProvider: "external",
          streamUrl: null,
          downloadUrl: null,
          externalUrl: "https://example.com/audio.mp3",
        }),
      ],
      audioVersions: [
        makeAudioVersion({
          id: "legacy-ext",
          streamUrl: null,
          isExternal: true,
          externalUrl: "https://example.com/audio.mp3",
        }),
      ],
    });
    expect(sources.map((source) => source.id)).toEqual(["asset-ext"]);
  });

  it("defensively dedupes duplicate asset rows by id", () => {
    const asset = makeTrackAsset({ id: "dup-asset" });
    const sources = normalizeTrackAudioSources({
      assets: [asset, { ...asset }],
      audioVersions: [],
    });
    expect(sources).toHaveLength(1);
  });

  it("returns empty when no usable source exists", () => {
    const normalized = normalizeTrackAudio({ assets: [], audioVersions: [] }, null);
    expect(normalized.sources).toEqual([]);
    expect(normalized.current).toBeNull();
  });

  it("sets delete capability for mapped asset and legacy fallback only", () => {
    const sources = normalizeTrackAudioSources({
      assets: [
        makeTrackAsset({ id: "mapped", legacyAudioVersionId: "legacy-mapped" }),
        makeTrackAsset({ id: "native", legacyAudioVersionId: null }),
      ],
      audioVersions: [makeAudioVersion({ id: "legacy-fallback" })],
    });
    expect(sources.find((source) => source.id === "mapped")?.canDelete).toBe(true);
    expect(sources.find((source) => source.id === "native")?.canDelete).toBe(false);
    expect(sources.find((source) => source.id === "legacy-fallback")?.canDelete).toBe(true);
  });

  it("never exposes storageKey or absolute path fields", () => {
    const source = normalizeTrackAudioSources({ assets: [makeTrackAsset()], audioVersions: [] })[0] as unknown as Record<string, unknown>;
    expect(source.storageKey).toBeUndefined();
    expect(source.path).toBeUndefined();
  });
});
