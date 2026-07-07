import { randomUUID } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../middleware/errors";
import { recordActivityEvent } from "./activity";
import { createProjectMemberNotifications } from "./notifications";
import { invalidateTrackReviews } from "./reviews";
import { buildTrackAssetCreateDataFromAudioVersion, resolveTrackAssetStoragePath } from "./trackAssets";

export type CreateAudioVersionWithTrackAssetInput = {
  projectId: string;
  trackId: string;
  uploadedById: string;
  actorName: string;
  originalFilename: string;
  storedFilename?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  isExternal: boolean;
  externalUrl?: string | null;
  externalProvider?: "google" | "yandex" | "telegram" | "other" | null;
};

const audioInclude = { uploadedBy: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } as const;

async function createAudioVersionWithTrackAssetTx(
  tx: Prisma.TransactionClient,
  input: CreateAudioVersionWithTrackAssetInput,
) {
  const track = await tx.track.findFirst({
    where: { id: input.trackId, projectId: input.projectId },
    select: { id: true, projectId: true, title: true },
  });
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

  const aggregate = await tx.audioVersion.aggregate({
    where: { trackId: input.trackId },
    _max: { versionNumber: true },
  });
  const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;
  const existingAudioCount = await tx.audioVersion.count({ where: { trackId: input.trackId } });

  const audio = await tx.audioVersion.create({
    data: {
      trackId: input.trackId,
      uploadedById: input.uploadedById,
      originalFilename: input.originalFilename,
      storedFilename: input.storedFilename ?? null,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      isExternal: input.isExternal,
      externalUrl: input.externalUrl ?? null,
      externalProvider: input.externalProvider ?? null,
      versionNumber,
    },
    include: audioInclude,
  });

  await tx.trackAsset.create({
    data: buildTrackAssetCreateDataFromAudioVersion({
      projectId: track.projectId,
      audioVersion: {
        id: audio.id,
        trackId: audio.trackId,
        uploadedById: audio.uploadedById ?? null,
        originalFilename: audio.originalFilename,
        storageKey: audio.storageKey,
        mimeType: audio.mimeType,
        sizeBytes: audio.sizeBytes,
        durationSeconds: audio.durationSeconds,
        externalUrl: audio.externalUrl,
        isExternal: audio.isExternal,
        externalProvider: audio.externalProvider,
        versionNumber: audio.versionNumber,
        createdAt: audio.createdAt,
      },
      isPrimary: existingAudioCount === 0,
      storageProvider: audio.isExternal ? "external" : "local",
    }),
  });

  await createProjectMemberNotifications(tx, {
    projectId: track.projectId,
    trackId: input.trackId,
    actorId: input.uploadedById,
    actorName: input.actorName,
    type: "audio_uploaded",
    message: `uploaded audio version #${versionNumber} "${input.originalFilename.slice(0, 100)}"`,
  });
  await recordActivityEvent(tx, {
    projectId: track.projectId,
    actorId: input.uploadedById,
    type: "audio_uploaded",
    payload: {
      trackId: input.trackId,
      trackTitle: track.title,
      audioVersionId: audio.id,
      versionNumber,
      originalFilename: input.originalFilename,
    },
  });

  if (existingAudioCount === 0) {
    await invalidateTrackReviews(tx, input.trackId);
  }

  return audio;
}

export async function createAudioVersionWithTrackAsset(
  prisma: PrismaClient,
  input: CreateAudioVersionWithTrackAssetInput,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createAudioVersionWithTrackAssetTx(tx, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2002" || error.code === "P2034");
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new AppError(409, "AUDIO_VERSION_CONFLICT", "Could not allocate an audio version number");
}

export async function softDeleteTrackAssetForLegacyAudioVersion(
  tx: Prisma.TransactionClient,
  legacyAudioVersionId: string,
  deletedAt = new Date(),
) {
  await tx.trackAsset.updateMany({
    where: {
      legacyAudioVersionId,
      deletedAt: null,
      status: { not: "DELETED" },
    },
    data: {
      status: "DELETED",
      deletedAt,
      isPrimary: false,
    },
  });
}

async function resolveExistingStoragePath(uploadsRoot: string, storageKey: string) {
  const resolved = resolveTrackAssetStoragePath(uploadsRoot, storageKey);
  const realRoot = await fsp.realpath(uploadsRoot);
  let current = uploadsRoot;

  for (const segment of storageKey.split("/")) {
    current = path.join(current, segment);
    const segmentStat = await fsp.lstat(current);
    if (segmentStat.isSymbolicLink()) {
      throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
    }
  }

  const realResolved = await fsp.realpath(resolved);
  if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}${path.sep}`)) {
    throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
  }
  return realResolved;
}

export async function deleteAudioVersionWithTrackAsset(
  prisma: PrismaClient,
  input: { audioId: string; uploadsRoot: string },
) {
  const audio = await prisma.audioVersion.findUnique({ where: { id: input.audioId } });
  if (!audio) throw new AppError(404, "AUDIO_NOT_FOUND", "Audio version not found");

  if (audio.isExternal || !audio.storageKey) {
    await prisma.$transaction(async (tx) => {
      await softDeleteTrackAssetForLegacyAudioVersion(tx, input.audioId);
      await tx.audioVersion.delete({ where: { id: input.audioId } });
    });
    return;
  }

  const references = await prisma.audioVersion.count({ where: { storageKey: audio.storageKey } });
  if (references !== 1) throw new AppError(409, "AUDIO_REFERENCE_CONFLICT", "Audio file has multiple references");

  const storedPath = await resolveExistingStoragePath(input.uploadsRoot, audio.storageKey);
  const quarantinePath = `${storedPath}.deleting-${randomUUID()}`;
  try {
    await fsp.rename(storedPath, quarantinePath);
  } catch {
    throw new AppError(500, "AUDIO_DELETE_FAILED", "Audio file could not be prepared for deletion");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.audioVersion.findUnique({ where: { id: input.audioId }, select: { storageKey: true } });
      if (current?.storageKey !== audio.storageKey) {
        throw new AppError(409, "AUDIO_REFERENCE_CONFLICT", "Audio metadata changed during deletion");
      }
      await softDeleteTrackAssetForLegacyAudioVersion(tx, input.audioId);
      await tx.audioVersion.delete({ where: { id: input.audioId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    try {
      await fsp.rename(quarantinePath, storedPath);
    } catch {
      console.error("Audio deletion rollback failed", { audioId: input.audioId });
    }
    throw error;
  }

  try {
    await fsp.unlink(quarantinePath);
  } catch {
    console.error("Audio quarantine cleanup failed", { audioId: input.audioId });
    throw new AppError(500, "AUDIO_DELETE_FAILED", "Audio file cleanup failed");
  }
}
