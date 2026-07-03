import { Prisma, type PrismaClient } from "@prisma/client";
import { serializeLyricsDocument } from "../../features/track-workspace/lyrics/lyricsDocument";
import {
  prepareLyricsWrite,
  resolveLyricVersion,
  resolveTrackLyrics,
  structuredTrackWriteData,
  structuredVersionWriteData,
} from "./structuredLyrics";

export type LyricsBackfillOptions = {
  batchSize?: number;
  maxBatches?: number;
};

export type LyricsBackfillResult = {
  tracksUpdated: number;
  versionsUpdated: number;
  remainingTracks: number;
  remainingVersions: number;
  verifiedTracks: number;
  verifiedVersions: number;
  derivedTextMismatches: 0;
};

export class LyricsBackfillMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyricsBackfillMismatchError";
  }
}

function boundedBatchSize(value: number | undefined) {
  const batchSize = value ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("Backfill batch size must be an integer between 1 and 500");
  }
  return batchSize;
}

function mismatch(entity: "Track" | "LyricVersion", id: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new LyricsBackfillMismatchError(`${entity} ${id}: ${message}`);
}

export async function verifyStructuredLyricsIntegrity(prisma: PrismaClient, batchSizeInput?: number) {
  const batchSize = boundedBatchSize(batchSizeInput);
  let verifiedTracks = 0;
  let verifiedVersions = 0;
  let trackCursor: string | undefined;
  let versionCursor: string | undefined;

  for (;;) {
    const rows = await prisma.track.findMany({
      where: trackCursor ? { id: { gt: trackCursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        lyrics: true,
        lyricsDocument: true,
        lyricsPlainText: true,
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const resolved = resolveTrackLyrics(row);
        if (row.lyricsDocument !== null && serializeLyricsDocument(row.lyricsDocument) !== serializeLyricsDocument(resolved.document)) {
          throw new Error("document serialization is not canonical");
        }
      } catch (error) {
        mismatch("Track", row.id, error);
      }
      verifiedTracks += 1;
    }
    trackCursor = rows.at(-1)!.id;
  }

  for (;;) {
    const rows = await prisma.lyricVersion.findMany({
      where: versionCursor ? { id: { gt: versionCursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        lyrics: true,
        document: true,
        plainText: true,
        schemaVersion: true,
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const resolved = resolveLyricVersion(row);
        if (row.document !== null && serializeLyricsDocument(row.document) !== serializeLyricsDocument(resolved.document)) {
          throw new Error("document serialization is not canonical");
        }
      } catch (error) {
        mismatch("LyricVersion", row.id, error);
      }
      verifiedVersions += 1;
    }
    versionCursor = rows.at(-1)!.id;
  }

  return {
    verifiedTracks,
    verifiedVersions,
    derivedTextMismatches: 0 as const,
  };
}

export async function backfillStructuredLyrics(
  prisma: PrismaClient,
  options: LyricsBackfillOptions = {},
): Promise<LyricsBackfillResult> {
  const batchSize = boundedBatchSize(options.batchSize);
  const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY;
  if (!(maxBatches === Number.POSITIVE_INFINITY || (Number.isInteger(maxBatches) && maxBatches >= 1))) {
    throw new Error("Backfill max batches must be a positive integer");
  }

  await verifyStructuredLyricsIntegrity(prisma, batchSize);

  let tracksUpdated = 0;
  let versionsUpdated = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const rows = await prisma.track.findMany({
      where: { lyricsDocument: { equals: Prisma.DbNull } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, lyrics: true, lyricsPlainText: true },
    });
    if (rows.length === 0) break;

    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of rows) {
        if (row.lyricsPlainText !== null) {
          throw new LyricsBackfillMismatchError(`Track ${row.id}: partial structured persistence`);
        }
        const prepared = prepareLyricsWrite({ content: row.lyrics, baseRevision: 0, leaseToken: "" });
        if (prepared.plainText !== row.lyrics) {
          throw new LyricsBackfillMismatchError(`Track ${row.id}: derived text differs from legacy lyrics`);
        }
        const result = await tx.track.updateMany({
          where: { id: row.id, lyricsDocument: { equals: Prisma.DbNull } },
          data: structuredTrackWriteData(prepared),
        });
        if (result.count !== 1) {
          throw new LyricsBackfillMismatchError("Track batch changed concurrently; no automatic repair attempted");
        }
        count += result.count;
      }
      return count;
    });
    tracksUpdated += updated;
    batches += 1;
  }

  while (batches < maxBatches) {
    const rows = await prisma.lyricVersion.findMany({
      where: { document: { equals: Prisma.DbNull } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, lyrics: true, plainText: true, schemaVersion: true },
    });
    if (rows.length === 0) break;

    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of rows) {
        if (row.plainText !== null || row.schemaVersion !== null) {
          throw new LyricsBackfillMismatchError(`LyricVersion ${row.id}: partial structured persistence`);
        }
        const prepared = prepareLyricsWrite({ content: row.lyrics, baseRevision: 0, leaseToken: "" });
        if (prepared.plainText !== row.lyrics) {
          throw new LyricsBackfillMismatchError(`LyricVersion ${row.id}: derived text differs from legacy lyrics`);
        }
        const result = await tx.lyricVersion.updateMany({
          where: { id: row.id, document: { equals: Prisma.DbNull } },
          data: structuredVersionWriteData(prepared),
        });
        if (result.count !== 1) {
          throw new LyricsBackfillMismatchError("LyricVersion batch changed concurrently; no automatic repair attempted");
        }
        count += result.count;
      }
      return count;
    });
    versionsUpdated += updated;
    batches += 1;
  }

  const [remainingTracks, remainingVersions, verification] = await Promise.all([
    prisma.track.count({ where: { lyricsDocument: { equals: Prisma.DbNull } } }),
    prisma.lyricVersion.count({ where: { document: { equals: Prisma.DbNull } } }),
    verifyStructuredLyricsIntegrity(prisma, batchSize),
  ]);

  return {
    tracksUpdated,
    versionsUpdated,
    remainingTracks,
    remainingVersions,
    ...verification,
  };
}
