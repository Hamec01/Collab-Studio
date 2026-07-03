import { Prisma, type LyricVersion, type PrismaClient, type Track } from "@prisma/client";
import {
  LYRICS_DOCUMENT_SCHEMA_VERSION,
  legacyPlainTextToLyricsDocument,
  lyricsDocumentToPlainText,
  normalizeLyricsDocument,
  type LyricsDocument,
} from "../../features/track-workspace/lyrics/lyricsDocument";
import { AppError } from "../middleware/errors";
import { requireLyricsLease } from "./lyricsWorkspace";

type TrackLyricsRecord = Pick<Track, "lyrics" | "lyricsDocument" | "lyricsPlainText">;
type LyricVersionRecord = Pick<LyricVersion, "lyrics" | "document" | "plainText" | "schemaVersion">;

export type LyricsDraftWriteInput =
  | { content: string; baseRevision: number; leaseToken: string }
  | { document: LyricsDocument; baseRevision: number; leaseToken: string };

export type PreparedLyricsWrite = {
  document: LyricsDocument;
  plainText: string;
};

function asJson(document: LyricsDocument) {
  return document as unknown as Prisma.InputJsonValue;
}

export function prepareLyricsWrite(input: Pick<LyricsDraftWriteInput, "baseRevision" | "leaseToken"> & (
  | { content: string }
  | { document: unknown }
)): PreparedLyricsWrite {
  const document = "document" in input
    ? normalizeLyricsDocument(input.document)
    : legacyPlainTextToLyricsDocument(input.content);

  return {
    document,
    plainText: lyricsDocumentToPlainText(document),
  };
}

export function resolveTrackLyrics(track: TrackLyricsRecord): PreparedLyricsWrite {
  if (track.lyricsDocument === null) {
    if (track.lyricsPlainText !== null) {
      throw new Error("Track has plain text without a structured document");
    }
    return prepareLyricsWrite({ content: track.lyrics, baseRevision: 0, leaseToken: "" });
  }

  const resolved = prepareLyricsWrite({ document: track.lyricsDocument, baseRevision: 0, leaseToken: "" });
  if (track.lyricsPlainText === null || track.lyricsPlainText !== resolved.plainText || track.lyrics !== resolved.plainText) {
    throw new Error("Track structured lyrics do not match derived and legacy plain text");
  }
  return resolved;
}

export function readTrackLyrics(track: TrackLyricsRecord): PreparedLyricsWrite {
  try {
    return resolveTrackLyrics(track);
  } catch (error) {
    if (track.lyricsDocument !== null && track.lyricsPlainText !== null) {
      const structured = prepareLyricsWrite({ document: track.lyricsDocument, baseRevision: 0, leaseToken: "" });
      const isLegacyOnlyDrift = structured.plainText === track.lyricsPlainText && track.lyrics !== track.lyricsPlainText;
      if (isLegacyOnlyDrift) {
        return prepareLyricsWrite({ content: track.lyrics, baseRevision: 0, leaseToken: "" });
      }
    }
    throw error;
  }
}

export function resolveLyricVersion(version: LyricVersionRecord): PreparedLyricsWrite {
  if (version.document === null) {
    if (version.plainText !== null || version.schemaVersion !== null) {
      throw new Error("Lyric version has partial structured persistence");
    }
    return prepareLyricsWrite({ content: version.lyrics, baseRevision: 0, leaseToken: "" });
  }

  const resolved = prepareLyricsWrite({ document: version.document, baseRevision: 0, leaseToken: "" });
  if (
    version.plainText === null
    || version.plainText !== resolved.plainText
    || version.lyrics !== resolved.plainText
    || version.schemaVersion !== LYRICS_DOCUMENT_SCHEMA_VERSION
  ) {
    throw new Error("Lyric version structured lyrics do not match schema, derived and legacy plain text");
  }
  return resolved;
}

export function structuredTrackWriteData(prepared: PreparedLyricsWrite) {
  return {
    lyrics: prepared.plainText,
    lyricsDocument: asJson(prepared.document),
    lyricsPlainText: prepared.plainText,
  };
}

export function structuredVersionWriteData(prepared: PreparedLyricsWrite) {
  return {
    lyrics: prepared.plainText,
    document: asJson(prepared.document),
    plainText: prepared.plainText,
    schemaVersion: LYRICS_DOCUMENT_SCHEMA_VERSION,
  };
}

export async function saveLyricsDraftAtomic(
  prisma: PrismaClient,
  input: {
    projectId: string;
    trackId: string;
    userId: string;
    write: LyricsDraftWriteInput;
    now: Date;
  },
) {
  const prepared = prepareLyricsWrite(input.write);

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.track.findFirst({
        where: { id: input.trackId, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      const lease = await tx.lyricsEditLease.findUnique({
        where: { trackId: input.trackId },
        select: { userId: true, tokenHash: true, expiresAt: true },
      });
      requireLyricsLease(lease, {
        userId: input.userId,
        leaseToken: input.write.leaseToken,
        now: input.now,
      });

      const updated = await tx.track.updateMany({
        where: {
          id: input.trackId,
          projectId: input.projectId,
          lyricsRevision: input.write.baseRevision,
        },
        data: {
          ...structuredTrackWriteData(prepared),
          lyricsRevision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, "LYRICS_CONFLICT", "Lyrics revision conflict");
      }

      const saved = await tx.track.findUniqueOrThrow({
        where: { id: input.trackId },
        select: {
          lyrics: true,
          lyricsDocument: true,
          lyricsPlainText: true,
          lyricsRevision: true,
          updatedAt: true,
        },
      });
      const resolved = resolveTrackLyrics(saved);

      return {
        content: resolved.plainText,
        document: resolved.document,
        plainText: resolved.plainText,
        schemaVersion: resolved.document.schemaVersion,
        revision: saved.lyricsRevision,
        updatedAt: saved.updatedAt.toISOString(),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
