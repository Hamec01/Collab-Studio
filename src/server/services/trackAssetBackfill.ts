import { promises as fsp } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient, type TrackAsset } from "@prisma/client";
import { AppError } from "../middleware/errors";
import { buildTrackAssetCreateDataFromAudioVersion, resolveTrackAssetStoragePath } from "./trackAssets";

type BackfillMode = "dry-run" | "execute";

export type TrackAssetBackfillCursor = {
  createdAt: string;
  id: string;
};

export type TrackAssetBackfillOptions = {
  mode: BackfillMode;
  uploadsRoot: string;
  batchSize?: number;
  cursor?: string | null;
  maxRows?: number;
  strictMissingFiles?: boolean;
  failOnConflict?: boolean;
};

export type TrackAssetBackfillMissing = {
  legacyAudioVersionId: string;
  trackId: string;
  projectId: string;
  storageKey: string | null;
  reason: string;
};

export type TrackAssetBackfillConflict = {
  legacyAudioVersionId: string;
  existingAssetId: string | null;
  trackId: string;
  projectId: string;
  reason: string;
  mismatchedFields: string[];
};

export type TrackAssetBackfillResult = {
  mode: BackfillMode;
  startedAt: string;
  finishedAt: string;
  scanned: number;
  eligible: number;
  created: number;
  wouldCreate: number;
  skipped: number;
  raced: number;
  external: number;
  localPresent: number;
  missing: number;
  conflicts: number;
  failed: number;
  batches: number;
  lastCursor: string | null;
  nextCursor: string | null;
  durationMs: number;
  missingItems: TrackAssetBackfillMissing[];
  conflictItems: TrackAssetBackfillConflict[];
};

type AudioVersionRow = {
  id: string;
  trackId: string;
  uploadedById: string | null;
  originalFilename: string;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  externalUrl: string | null;
  isExternal: boolean;
  externalProvider: "google" | "yandex" | "telegram" | "other" | null;
  versionNumber: number;
  createdAt: Date;
  track: {
    projectId: string;
  };
};

type LocalFileState =
  | { kind: "external" }
  | { kind: "present" }
  | { kind: "missing"; reason: string }
  | { kind: "conflict"; reason: string };

type ExistingAssetCheck =
  | { kind: "none" }
  | { kind: "compatible"; asset: TrackAsset }
  | { kind: "conflict"; asset: TrackAsset; mismatchedFields: string[] };

function boundedBatchSize(value: number | undefined) {
  const batchSize = value ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("Backfill batch size must be an integer between 1 and 500");
  }
  return batchSize;
}

function boundedMaxRows(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 50_000) {
    throw new Error("Backfill max rows must be an integer between 1 and 50000");
  }
  return value;
}

export function encodeTrackAssetBackfillCursor(cursor: TrackAssetBackfillCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTrackAssetBackfillCursor(cursor: string): TrackAssetBackfillCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<TrackAssetBackfillCursor>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("Cursor must include createdAt and id");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("Cursor createdAt is invalid");
    }
    return { createdAt: createdAt.toISOString(), id: parsed.id };
  } catch (error) {
    throw new Error(`Invalid cursor: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildCursorWhere(cursor: TrackAssetBackfillCursor | undefined) {
  if (!cursor) return undefined;
  return {
    OR: [
      { createdAt: { gt: new Date(cursor.createdAt) } },
      {
        createdAt: new Date(cursor.createdAt),
        id: { gt: cursor.id },
      },
    ],
  } satisfies Prisma.AudioVersionWhereInput;
}

function createEmptyResult(mode: BackfillMode) {
  const startedAt = new Date();
  return {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    scanned: 0,
    eligible: 0,
    created: 0,
    wouldCreate: 0,
    skipped: 0,
    raced: 0,
    external: 0,
    localPresent: 0,
    missing: 0,
    conflicts: 0,
    failed: 0,
    batches: 0,
    lastCursor: null,
    nextCursor: null,
    durationMs: 0,
    missingItems: [] as TrackAssetBackfillMissing[],
    conflictItems: [] as TrackAssetBackfillConflict[],
  };
}

function finalizeResult(
  result: ReturnType<typeof createEmptyResult>,
  startedAt: number,
): TrackAssetBackfillResult {
  const finishedAt = new Date();
  return {
    ...result,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt,
  };
}

async function classifyLocalFile(uploadsRoot: string, audio: AudioVersionRow): Promise<LocalFileState> {
  if (audio.isExternal) return { kind: "external" };
  if (!audio.storageKey) return { kind: "conflict", reason: "missing_storage_key" };

  let resolved: string;
  try {
    resolved = resolveTrackAssetStoragePath(uploadsRoot, audio.storageKey);
  } catch (error) {
    return { kind: "conflict", reason: error instanceof AppError ? error.code : "invalid_storage_key" };
  }

  let realRoot: string;
  try {
    realRoot = await fsp.realpath(uploadsRoot);
  } catch {
    return { kind: "conflict", reason: "uploads_root_unavailable" };
  }

  let current = uploadsRoot;
  const segments = audio.storageKey.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const segmentStat = await fsp.lstat(current);
      if (segmentStat.isSymbolicLink()) return { kind: "conflict", reason: "symlink_in_storage_path" };
      if (index === segments.length - 1 && !segmentStat.isFile()) {
        return { kind: "missing", reason: "not_a_file" };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing", reason: index === segments.length - 1 ? "file_missing" : "parent_missing" };
      }
      return { kind: "conflict", reason: "storage_path_unreadable" };
    }
  }

  try {
    const realResolved = await fsp.realpath(resolved);
    if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}${path.sep}`)) {
      return { kind: "conflict", reason: "path_escape" };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing", reason: "file_missing" };
    }
    return { kind: "conflict", reason: "storage_path_unreadable" };
  }

  return { kind: "present" };
}

function compareExistingAssetToAudioVersion(asset: TrackAsset, audio: AudioVersionRow) {
  const mismatchedFields: string[] = [];
  if (asset.trackId !== audio.trackId) mismatchedFields.push("trackId");
  if (asset.projectId !== audio.track.projectId) mismatchedFields.push("projectId");
  if (asset.versionNumber !== audio.versionNumber) mismatchedFields.push("versionNumber");
  if (asset.originalFilename !== audio.originalFilename) mismatchedFields.push("originalFilename");
  if (asset.kind !== "AUDIO_VERSION") mismatchedFields.push("kind");
  if (Boolean(asset.externalUrl) !== audio.isExternal) mismatchedFields.push("mode");
  if (!audio.isExternal && asset.storageProvider !== "local") mismatchedFields.push("storageProvider");
  if (audio.isExternal && asset.storageProvider !== "external") mismatchedFields.push("storageProvider");
  if (asset.deletedAt !== null || asset.status === "DELETED") mismatchedFields.push("deletedState");
  return mismatchedFields;
}

async function inspectExistingMappedAsset(
  prisma: PrismaClient,
  audio: AudioVersionRow,
): Promise<ExistingAssetCheck> {
  const asset = await prisma.trackAsset.findUnique({
    where: { legacyAudioVersionId: audio.id },
  });
  if (!asset) return { kind: "none" };
  const mismatchedFields = compareExistingAssetToAudioVersion(asset, audio);
  if (mismatchedFields.length === 0) return { kind: "compatible", asset };
  return { kind: "conflict", asset, mismatchedFields };
}

async function resolvePrimaryAction(prisma: PrismaClient, audio: AudioVersionRow) {
  const primaryAssets = await prisma.trackAsset.findMany({
    where: {
      trackId: audio.trackId,
      deletedAt: null,
      status: { not: "DELETED" },
      isPrimary: true,
    },
    select: { id: true, legacyAudioVersionId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (primaryAssets.length > 1) {
    return {
      kind: "conflict" as const,
      reason: "multiple_primary_assets",
      existingAssetId: primaryAssets[0].id,
      mismatchedFields: ["isPrimary"],
    };
  }
  if (primaryAssets.length === 1) {
    return { kind: "existing-primary" as const };
  }

  const topAudio = await prisma.audioVersion.findFirst({
    where: { trackId: audio.trackId },
    orderBy: [{ versionNumber: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!topAudio) {
    return { kind: "assign-new" as const, isPrimary: false };
  }

  if (topAudio.id === audio.id) {
    return { kind: "assign-new" as const, isPrimary: true };
  }

  const topMapped = await prisma.trackAsset.findUnique({
    where: { legacyAudioVersionId: topAudio.id },
  });
  if (topMapped && topMapped.deletedAt === null && topMapped.status !== "DELETED") {
    const mismatchedFields = compareExistingAssetToAudioVersion(topMapped, {
      ...audio,
      id: topAudio.id,
      originalFilename: topMapped.originalFilename,
      track: { projectId: topMapped.projectId },
      versionNumber: topMapped.versionNumber ?? audio.versionNumber,
      isExternal: Boolean(topMapped.externalUrl),
      externalUrl: topMapped.externalUrl,
      externalProvider: topMapped.externalProvider,
      storageKey: topMapped.storageKey,
      mimeType: topMapped.mimeType,
      sizeBytes: topMapped.sizeBytes,
      durationSeconds: topMapped.durationMs === null ? null : topMapped.durationMs / 1000,
      createdAt: topMapped.createdAt,
      uploadedById: topMapped.uploadedByUserId,
    });
    if (mismatchedFields.length > 0) {
      return {
        kind: "conflict" as const,
        reason: "top_audio_existing_asset_mismatch",
        existingAssetId: topMapped.id,
        mismatchedFields,
      };
    }
    return {
      kind: "promote-existing" as const,
      assetId: topMapped.id,
    };
  }

  return { kind: "assign-new" as const, isPrimary: false };
}

async function createBackfilledTrackAsset(prisma: PrismaClient, audio: AudioVersionRow, options: {
  isPrimary: boolean;
  fileMissing: boolean;
}) {
  return prisma.trackAsset.create({
    data: {
      ...buildTrackAssetCreateDataFromAudioVersion({
        projectId: audio.track.projectId,
        audioVersion: audio,
        isPrimary: options.isPrimary,
        storageProvider: audio.isExternal ? "external" : "local",
      }),
      metadata: {
        source: "AudioVersion",
        backfilled: true,
        ...(options.fileMissing ? { fileMissing: true } : {}),
      },
    },
  });
}

async function processExecuteRow(
  prisma: PrismaClient,
  audio: AudioVersionRow,
  strictMissingFiles: boolean,
  fileState: LocalFileState,
) {
  if (fileState.kind === "conflict") {
    return { kind: "conflict" as const, reason: fileState.reason, existingAssetId: null, mismatchedFields: ["storageKey"] };
  }
  if (fileState.kind === "missing" && strictMissingFiles) {
    return { kind: "missing" as const, reason: fileState.reason };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.trackAsset.findUnique({ where: { legacyAudioVersionId: audio.id } });
      if (existing) {
        const mismatchedFields = compareExistingAssetToAudioVersion(existing, audio);
        if (mismatchedFields.length === 0) {
          return { kind: "skipped" as const };
        }
        return {
          kind: "conflict" as const,
          reason: "existing_asset_mismatch",
          existingAssetId: existing.id,
          mismatchedFields,
        };
      }

      const primaryAction = await resolvePrimaryAction(tx as unknown as PrismaClient, audio);
      if (primaryAction.kind === "conflict") {
        return primaryAction;
      }
      if (primaryAction.kind === "promote-existing") {
        await tx.trackAsset.update({
          where: { id: primaryAction.assetId },
          data: { isPrimary: true },
        });
      }

      const created = await createBackfilledTrackAsset(tx as unknown as PrismaClient, audio, {
        isPrimary: primaryAction.kind === "assign-new" ? primaryAction.isPrimary : false,
        fileMissing: fileState.kind === "missing",
      });
      return { kind: "created" as const, assetId: created.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedAsset = await prisma.trackAsset.findUnique({ where: { legacyAudioVersionId: audio.id } });
      if (racedAsset) {
        const mismatchedFields = compareExistingAssetToAudioVersion(racedAsset, audio);
        if (mismatchedFields.length === 0) {
          return { kind: "raced" as const };
        }
        return {
          kind: "conflict" as const,
          reason: "race_existing_asset_mismatch",
          existingAssetId: racedAsset.id,
          mismatchedFields,
        };
      }
    }
    throw error;
  }
}

export async function backfillTrackAssets(
  prisma: PrismaClient,
  options: TrackAssetBackfillOptions,
): Promise<TrackAssetBackfillResult> {
  const startedAtMs = Date.now();
  const batchSize = boundedBatchSize(options.batchSize);
  const maxRows = boundedMaxRows(options.maxRows);
  const uploadsRoot = path.resolve(options.uploadsRoot);
  const cursor = options.cursor ? decodeTrackAssetBackfillCursor(options.cursor) : undefined;
  const result = createEmptyResult(options.mode);
  let remaining = maxRows ?? Number.POSITIVE_INFINITY;
  let workingCursor = cursor;

  while (remaining > 0) {
    const take = Math.min(batchSize, remaining);
    const rows = await prisma.audioVersion.findMany({
      where: buildCursorWhere(workingCursor),
      include: {
        track: {
          select: { projectId: true },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    });
    if (rows.length === 0) break;
    result.batches += 1;

    for (const audio of rows) {
      const encodedCursor = encodeTrackAssetBackfillCursor({
        createdAt: audio.createdAt.toISOString(),
        id: audio.id,
      });
      result.scanned += 1;
      result.lastCursor = encodedCursor;
      result.nextCursor = encodedCursor;
      remaining -= 1;

      const fileState = await classifyLocalFile(uploadsRoot, audio);
      if (fileState.kind === "external") result.external += 1;
      if (fileState.kind === "present") result.localPresent += 1;
      if (fileState.kind === "missing") {
        result.missing += 1;
        result.missingItems.push({
          legacyAudioVersionId: audio.id,
          trackId: audio.trackId,
          projectId: audio.track.projectId,
          storageKey: audio.storageKey,
          reason: fileState.reason,
        });
      }
      if (fileState.kind === "conflict") {
        result.conflicts += 1;
        result.conflictItems.push({
          legacyAudioVersionId: audio.id,
          existingAssetId: null,
          trackId: audio.trackId,
          projectId: audio.track.projectId,
          reason: fileState.reason,
          mismatchedFields: ["storageKey"],
        });
        continue;
      }

      const existingCheck = await inspectExistingMappedAsset(prisma, audio);
      if (existingCheck.kind === "compatible") {
        result.skipped += 1;
        continue;
      }
      if (existingCheck.kind === "conflict") {
        result.conflicts += 1;
        result.conflictItems.push({
          legacyAudioVersionId: audio.id,
          existingAssetId: existingCheck.asset.id,
          trackId: audio.trackId,
          projectId: audio.track.projectId,
          reason: "existing_asset_mismatch",
          mismatchedFields: existingCheck.mismatchedFields,
        });
        continue;
      }

      result.eligible += 1;
      if (options.mode === "dry-run") {
        result.wouldCreate += 1;
        continue;
      }

      try {
        const executeResult = await processExecuteRow(prisma, audio, Boolean(options.strictMissingFiles), fileState);
        if (executeResult.kind === "created") {
          result.created += 1;
          continue;
        }
        if (executeResult.kind === "skipped") {
          result.skipped += 1;
          continue;
        }
        if (executeResult.kind === "raced") {
          result.raced += 1;
          continue;
        }
        if (executeResult.kind === "missing") {
          continue;
        }
        result.conflicts += 1;
        result.conflictItems.push({
          legacyAudioVersionId: audio.id,
          existingAssetId: executeResult.existingAssetId,
          trackId: audio.trackId,
          projectId: audio.track.projectId,
          reason: executeResult.reason,
          mismatchedFields: executeResult.mismatchedFields,
        });
      } catch {
        result.failed += 1;
      }
    }

    if (rows.length < take) {
      result.nextCursor = null;
      break;
    }
    const last = rows.at(-1)!;
    workingCursor = { createdAt: last.createdAt.toISOString(), id: last.id };
    result.nextCursor = encodeTrackAssetBackfillCursor(workingCursor);
  }

  if (remaining === 0) {
    const last = result.lastCursor;
    result.nextCursor = last;
  }

  if (result.failed > 0) {
    throw new Error(JSON.stringify(finalizeResult(result, startedAtMs)));
  }
  if (options.failOnConflict && result.conflicts > 0) {
    throw new Error(JSON.stringify(finalizeResult(result, startedAtMs)));
  }
  if (options.strictMissingFiles && result.missing > 0) {
    throw new Error(JSON.stringify(finalizeResult(result, startedAtMs)));
  }

  return finalizeResult(result, startedAtMs);
}
