import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../middleware/errors";
import { serializeTrackAsset } from "../serializers/trackAssets";
import {
  assertTrackAssetBelongsToTrackProject,
  buildTrackAssetBackfillPlan,
  canDeleteTrackAsset,
  canReadTrackAsset,
  canUploadTrackAsset,
  isTrackAssetKind,
  isTrackAssetStatus,
  normalizeTrackAssetStorageKey,
  resolveTrackAssetStoragePath,
  selectTrackAssetsWithFallback,
  serializeTrackAssetSizeBytes,
} from "./trackAssets";

function expectAppError(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`Expected AppError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("trackAssets", () => {
  it("serializes a track asset dto with safe numeric size", () => {
    const dto = serializeTrackAsset({
      id: "asset-1",
      trackId: "track-1",
      projectId: "project-1",
      uploadedByUserId: "user-1",
      kind: "MASTER",
      status: "READY",
      title: "Main bounce",
      originalFilename: "main.wav",
      storageKey: "project-1/track-1/main.wav",
      storageProvider: "local",
      externalUrl: null,
      externalProvider: null,
      mimeType: "audio/wav",
      sizeBytes: 1024,
      durationMs: 120000,
      checksum: "abc",
      waveformData: { peaks: [1, 2, 3] },
      metadata: { source: "upload" },
      sourceAssetId: null,
      legacyAudioVersionId: "audio-legacy-1",
      versionNumber: 1,
      isPrimary: true,
      createdAt: new Date("2026-07-05T10:00:00.000Z"),
      updatedAt: new Date("2026-07-05T10:01:00.000Z"),
      deletedAt: null,
      uploadedBy: {
        id: "user-1",
        displayName: "Owner",
        avatarUrl: null,
      },
    });

    expect(dto.sizeBytes).toBe(1024);
    expect(dto.streamUrl).toBe("/api/projects/project-1/tracks/track-1/audio/audio-legacy-1/stream");
    expect(dto.downloadUrl).toBe("/api/projects/project-1/tracks/track-1/audio/audio-legacy-1/download");
  });

  it("returns null URLs for native TrackAsset rows without legacy audio compatibility id", () => {
    const dto = serializeTrackAsset({
      id: "asset-2",
      trackId: "track-1",
      projectId: "project-1",
      uploadedByUserId: null,
      kind: "REFERENCE",
      status: "READY",
      title: null,
      originalFilename: "ref.txt",
      storageKey: "project-1/track-1/ref.txt",
      storageProvider: "local",
      externalUrl: null,
      externalProvider: null,
      mimeType: "text/plain",
      sizeBytes: 32,
      durationMs: null,
      checksum: null,
      waveformData: null,
      metadata: {},
      sourceAssetId: null,
      legacyAudioVersionId: null,
      versionNumber: null,
      isPrimary: false,
      createdAt: new Date("2026-07-05T10:00:00.000Z"),
      updatedAt: new Date("2026-07-05T10:01:00.000Z"),
      deletedAt: null,
      uploadedBy: null,
    });

    expect(dto.streamUrl).toBeNull();
    expect(dto.downloadUrl).toBeNull();
  });

  it("validates track asset enums", () => {
    expect(isTrackAssetKind("MASTER")).toBe(true);
    expect(isTrackAssetKind("NOPE")).toBe(false);
    expect(isTrackAssetStatus("READY")).toBe(true);
    expect(isTrackAssetStatus("BROKEN")).toBe(false);
  });

  it("serializes sizeBytes safely", () => {
    expect(serializeTrackAssetSizeBytes(null)).toBeNull();
    expect(serializeTrackAssetSizeBytes(25 * 1024 * 1024)).toBe(25 * 1024 * 1024);
    expectAppError(() => serializeTrackAssetSizeBytes(Number.MAX_SAFE_INTEGER + 1), "INVALID_ASSET_SIZE");
  });

  it("normalizes safe storage keys and rejects traversal", () => {
    expect(normalizeTrackAssetStorageKey("project/track/file.wav")).toBe("project/track/file.wav");
    expect(resolveTrackAssetStoragePath("/srv/uploads", "project/track/file.wav")).toBe(path.resolve("/srv/uploads/project/track/file.wav"));

    expectAppError(() => normalizeTrackAssetStorageKey("../etc/passwd"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("/absolute/path"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("project/%2e%2e/file"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("project/%2Fetc/file"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("project/%252e%252e/file"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("project/%00/file"), "INVALID_STORAGE_KEY");
    expectAppError(() => normalizeTrackAssetStorageKey("project\\track\\file.wav"), "INVALID_STORAGE_KEY");
  });

  it("rejects project/track ownership mismatch", () => {
    expectAppError(
      () => assertTrackAssetBelongsToTrackProject({ projectId: "project-a", trackId: "track-a" }, { projectId: "project-b", trackId: "track-a" }),
      "ASSET_NOT_FOUND",
    );
  });

  it("enforces viewer read and editor upload/delete permissions", () => {
    expect(canReadTrackAsset({
      role: "viewer",
      capabilities: { canUploadAudio: false, canDownload: false },
    })).toBe(true);

    expect(canUploadTrackAsset({
      role: "viewer",
      capabilities: { canUploadAudio: false, canDownload: false },
    })).toBe(false);

    expect(canUploadTrackAsset({
      role: "editor",
      capabilities: { canUploadAudio: true, canDownload: true },
    })).toBe(true);

    expect(canDeleteTrackAsset({
      role: "editor",
      capabilities: { canUploadAudio: true, canDownload: true },
    })).toBe(true);

    expect(canReadTrackAsset(null)).toBe(false);
    expect(canUploadTrackAsset(null)).toBe(false);
    expect(canDeleteTrackAsset(null)).toBe(false);
  });

  it("uses dual-read fallback when TrackAsset rows are absent", () => {
    const fallback = selectTrackAssetsWithFallback({
      trackAssets: [],
      projectId: "project-1",
      legacyAudioVersions: [
        {
          id: "audio-1",
          trackId: "track-1",
          originalFilename: "legacy.wav",
          storageKey: "project-1/track-1/legacy.wav",
          mimeType: "audio/wav",
          sizeBytes: 123,
          durationSeconds: 12.5,
          externalUrl: null,
          isExternal: false,
          externalProvider: null,
          versionNumber: 3,
          createdAt: new Date("2026-07-05T10:00:00.000Z"),
          uploadedBy: null,
        },
      ],
    });

    expect(fallback.source).toBe("audioVersion");
    expect(fallback.assets).toHaveLength(1);
    expect(fallback.assets[0].legacyAudioVersionId).toBe("audio-1");
    expect(fallback.assets[0].isPrimary).toBe(true);
  });

  it("prefers TrackAsset rows over legacy fallback", () => {
    const selected = selectTrackAssetsWithFallback({
      projectId: "project-1",
      legacyAudioVersions: [],
      trackAssets: [
        {
          id: "asset-1",
          trackId: "track-1",
          projectId: "project-1",
          uploadedByUserId: null,
          kind: "REFERENCE",
          status: "READY",
          title: null,
          originalFilename: "ref.mp3",
          storageKey: null,
          storageProvider: "local",
          externalUrl: "https://example.com/ref.mp3",
          externalProvider: "other",
          mimeType: "audio/mpeg",
          sizeBytes: 10,
          durationMs: 5000,
          checksum: null,
          waveformData: null,
          metadata: {},
          sourceAssetId: null,
          legacyAudioVersionId: null,
          versionNumber: null,
          isPrimary: false,
          createdAt: new Date("2026-07-05T10:00:00.000Z"),
          updatedAt: new Date("2026-07-05T10:00:00.000Z"),
          deletedAt: null,
          uploadedBy: null,
        },
      ],
    });

    expect(selected.source).toBe("trackAsset");
    expect(selected.assets).toHaveLength(1);
  });

  it("merges partial backfill without duplicating mapped legacy audio", () => {
    const selected = selectTrackAssetsWithFallback({
      projectId: "project-1",
      legacyAudioVersions: [
        {
          id: "audio-a",
          trackId: "track-1",
          originalFilename: "a.wav",
          storageKey: "project-1/track-1/a.wav",
          mimeType: "audio/wav",
          sizeBytes: 100,
          durationSeconds: 1,
          externalUrl: null,
          isExternal: false,
          externalProvider: null,
          versionNumber: 1,
          createdAt: new Date("2026-07-05T10:00:00.000Z"),
          uploadedBy: null,
        },
        {
          id: "audio-b",
          trackId: "track-1",
          originalFilename: "b.wav",
          storageKey: "project-1/track-1/b.wav",
          mimeType: "audio/wav",
          sizeBytes: 200,
          durationSeconds: 2,
          externalUrl: null,
          isExternal: false,
          externalProvider: null,
          versionNumber: 2,
          createdAt: new Date("2026-07-05T10:01:00.000Z"),
          uploadedBy: null,
        },
      ],
      trackAssets: [
        {
          id: "asset-a",
          trackId: "track-1",
          projectId: "project-1",
          uploadedByUserId: null,
          kind: "AUDIO_VERSION",
          status: "READY",
          title: null,
          originalFilename: "a.wav",
          storageKey: "project-1/track-1/a.wav",
          storageProvider: "local",
          externalUrl: null,
          externalProvider: null,
          mimeType: "audio/wav",
          sizeBytes: 100,
          durationMs: 1000,
          checksum: null,
          waveformData: null,
          metadata: {},
          sourceAssetId: null,
          legacyAudioVersionId: "audio-a",
          versionNumber: 1,
          isPrimary: false,
          createdAt: new Date("2026-07-05T10:02:00.000Z"),
          updatedAt: new Date("2026-07-05T10:02:00.000Z"),
          deletedAt: null,
          uploadedBy: null,
        },
      ],
    });

    expect(selected.source).toBe("merged");
    expect(selected.assets).toHaveLength(2);
    expect(selected.assets.filter((asset) => asset.legacyAudioVersionId === "audio-a")).toHaveLength(1);
    expect(selected.assets.some((asset) => asset.legacyAudioVersionId === "audio-b")).toBe(true);
    expect(selected.assets.filter((asset) => asset.isPrimary)).toHaveLength(1);
  });

  it("prevents duplicate backfill for the same legacy audio version", () => {
    const skip = buildTrackAssetBackfillPlan({
      projectId: "project-1",
      existingLegacyAudioVersionIds: new Set(["audio-1"]),
      audioVersion: {
        id: "audio-1",
        trackId: "track-1",
        uploadedById: "user-1",
        originalFilename: "legacy.wav",
        storageKey: "project-1/track-1/legacy.wav",
        mimeType: "audio/wav",
        sizeBytes: 123,
        durationSeconds: 1.25,
        externalUrl: null,
        isExternal: false,
        externalProvider: null,
        versionNumber: 2,
        createdAt: new Date("2026-07-05T10:00:00.000Z"),
      },
    });

    expect(skip.action).toBe("skip");
  });

  it("builds backfill payload for a new legacy audio version", () => {
    const result = buildTrackAssetBackfillPlan({
      projectId: "project-1",
      existingLegacyAudioVersionIds: new Set(),
      audioVersion: {
        id: "audio-1",
        trackId: "track-1",
        uploadedById: "user-1",
        originalFilename: "legacy.wav",
        storageKey: "project-1/track-1/legacy.wav",
        mimeType: "audio/wav",
        sizeBytes: 123,
        durationSeconds: 1.25,
        externalUrl: null,
        isExternal: false,
        externalProvider: null,
        versionNumber: 2,
        createdAt: new Date("2026-07-05T10:00:00.000Z"),
      },
    });

    expect(result.action).toBe("create");
    if (result.action === "create") {
      expect(result.data.legacyAudioVersionId).toBe("audio-1");
      expect(result.data.durationMs).toBe(1250);
    }
  });

  it("keeps schema and migration inventory additive", () => {
    const schema = readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
    const migration = readFileSync(path.resolve("prisma/migrations/20260705150000_stage5a_track_asset_foundation/migration.sql"), "utf8");

    expect(schema).toContain("model TrackAsset");
    expect(schema).toContain("enum TrackAssetKind");
    expect(schema).toContain("legacyAudioVersionId");
    expect(schema).toContain("@relation(\"TrackAssetLegacyAudioVersion\"");
    expect(migration).toContain("CREATE TABLE \"TrackAsset\"");
    expect(migration).not.toContain("DROP TABLE \"AudioVersion\"");
    expect(migration).not.toContain("DROP COLUMN");
  });
});
