import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  legacyPlainTextToLyricsDocument,
  lyricsDocumentToPlainText,
  serializeLyricsDocument,
  type LyricsDocument,
} from "../src/features/track-workspace/lyrics/lyricsDocument";
import { AppError } from "../src/server/middleware/errors";
import { parseUpdateLyricsDraft } from "../src/server/schemas/tracks";
import {
  LyricsBackfillMismatchError,
  backfillStructuredLyrics,
  verifyStructuredLyricsIntegrity,
} from "../src/server/services/lyricsBackfill";
import { readTrackLyrics, saveLyricsDraftAtomic } from "../src/server/services/structuredLyrics";
import { hashOpaqueToken } from "../src/server/services/stage3Access";

const prisma = new PrismaClient();
const now = new Date("2026-07-03T12:00:00.000Z");

async function expectAppError(operation: () => Promise<unknown>, code: string) {
  try {
    await operation();
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, code);
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const leaseToken = `stage4b_${randomUUID().replaceAll("-", "")}`;
  const legacyText = "Куплет 👩‍🎤\nsoft line\n\n\nПрипев 世界\n\n";

  const user = await prisma.user.create({
    data: {
      username: `stage4b_${suffix}`,
      displayName: "Stage 4B Rehearsal",
      passwordHash: "rehearsal-only",
      emailVerifiedAt: now,
      ageAcknowledgedAt: now,
    },
  });
  const project = await prisma.project.create({
    data: {
      title: `Stage 4B rehearsal ${suffix}`,
      type: "single",
      members: {
        create: {
          userId: user.id,
          role: "owner",
          capabilityPreset: "owner",
        },
      },
    },
  });
  const track = await prisma.track.create({
    data: {
      projectId: project.id,
      title: "Legacy lyrics",
      lyrics: legacyText,
      lyricsRevision: 7,
      lyricVersions: {
        create: {
          authorId: user.id,
          lyrics: legacyText,
          label: "Legacy snapshot",
        },
      },
    },
  });

  try {
    const firstBatch = await backfillStructuredLyrics(prisma, { batchSize: 1, maxBatches: 1 });
    assert.equal(firstBatch.tracksUpdated, 1);
    assert.equal(firstBatch.versionsUpdated, 0);
    assert.equal(firstBatch.remainingVersions, 1);

    const afterFirstBatch = await prisma.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.equal(afterFirstBatch.lyricsRevision, 7);
    assert.equal(afterFirstBatch.lyricsPlainText, legacyText);
    assert.ok(afterFirstBatch.lyricsDocument);
    const firstSerialization = serializeLyricsDocument(afterFirstBatch.lyricsDocument);

    const resumed = await backfillStructuredLyrics(prisma, { batchSize: 1 });
    assert.equal(resumed.tracksUpdated, 0);
    assert.equal(resumed.versionsUpdated, 1);
    assert.equal(resumed.remainingTracks, 0);
    assert.equal(resumed.remainingVersions, 0);
    assert.equal(resumed.derivedTextMismatches, 0);

    const repeated = await backfillStructuredLyrics(prisma, { batchSize: 1 });
    assert.equal(repeated.tracksUpdated, 0);
    assert.equal(repeated.versionsUpdated, 0);
    assert.equal(repeated.derivedTextMismatches, 0);

    const afterRepeatedRun = await prisma.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.equal(serializeLyricsDocument(afterRepeatedRun.lyricsDocument), firstSerialization);
    assert.equal(afterRepeatedRun.lyricsRevision, 7);

    await prisma.lyricsEditLease.create({
      data: {
        trackId: track.id,
        userId: user.id,
        tokenHash: hashOpaqueToken(leaseToken),
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt: new Date(now.getTime() + 90_000),
      },
    });
    const versionsBeforeAutosave = await prisma.lyricVersion.count({ where: { trackId: track.id } });

    const legacySaveText = "Legacy client ✅\n\nempty follows\n\n";
    const legacySave = await saveLyricsDraftAtomic(prisma, {
      projectId: project.id,
      trackId: track.id,
      userId: user.id,
      write: {
        content: legacySaveText,
        baseRevision: 7,
        leaseToken,
      },
      now,
    });
    assert.equal(legacySave.revision, 8);
    assert.equal(legacySave.content, legacySaveText);
    assert.equal(lyricsDocumentToPlainText(legacySave.document), legacySaveText);

    await expectAppError(
      () => saveLyricsDraftAtomic(prisma, {
        projectId: project.id,
        trackId: track.id,
        userId: user.id,
        write: { content: "stale", baseRevision: 7, leaseToken },
        now,
      }),
      "LYRICS_CONFLICT",
    );
    await expectAppError(
      () => saveLyricsDraftAtomic(prisma, {
        projectId: project.id,
        trackId: track.id,
        userId: user.id,
        write: { content: "wrong lease", baseRevision: 8, leaseToken: `${leaseToken}_wrong` },
        now,
      }),
      "LYRICS_LEASE_LOST",
    );

    const structuredDocument: LyricsDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: "heading_stage4b",
          type: "heading",
          children: [{ text: "Заголовок 🎵", marks: ["bold"] }],
        },
        {
          id: "paragraph_stage4b",
          type: "paragraph",
          children: [
            { text: "italic", marks: ["italic"] },
            { text: "\nsoft" },
          ],
        },
      ],
    };
    const structuredSave = await saveLyricsDraftAtomic(prisma, {
      projectId: project.id,
      trackId: track.id,
      userId: user.id,
      write: {
        document: structuredDocument,
        baseRevision: 8,
        leaseToken,
      },
      now,
    });
    assert.equal(structuredSave.revision, 9);
    assert.equal(structuredSave.plainText, "Заголовок 🎵\n\nitalic\nsoft");
    assert.equal(serializeLyricsDocument(structuredSave.document), serializeLyricsDocument(structuredDocument));

    assert.throws(
      () => parseUpdateLyricsDraft({
        document: {
          schemaVersion: 1,
          blocks: [{ id: "malformed_01", type: "paragraph", children: [{ text: "x", marks: ["underline"] }] }],
        },
        baseRevision: 9,
        leaseToken,
      }),
    );

    const versionsAfterAutosave = await prisma.lyricVersion.count({ where: { trackId: track.id } });
    assert.equal(versionsAfterAutosave, versionsBeforeAutosave);

    const stage4aEditedText = "Stage 4A rollback edit 🧯\n\n";
    const stage4aEdited = await prisma.track.update({
      where: { id: track.id },
      data: {
        lyrics: stage4aEditedText,
        lyricsRevision: { increment: 1 },
      },
    });
    assert.equal(stage4aEdited.lyricsRevision, 10);
    assert.equal(readTrackLyrics(stage4aEdited).plainText, stage4aEditedText);
    await assert.rejects(
      () => backfillStructuredLyrics(prisma, { batchSize: 1 }),
      LyricsBackfillMismatchError,
    );

    const rollForwardSave = await saveLyricsDraftAtomic(prisma, {
      projectId: project.id,
      trackId: track.id,
      userId: user.id,
      write: {
        content: stage4aEditedText,
        baseRevision: 10,
        leaseToken,
      },
      now,
    });
    assert.equal(rollForwardSave.revision, 11);
    assert.equal(rollForwardSave.plainText, stage4aEditedText);

    const stage4aProjection = await prisma.$queryRaw<Array<{ lyrics: string; lyricsRevision: number }>>`
      SELECT "lyrics", "lyricsRevision"
      FROM "Track"
      WHERE "id" = ${track.id}::uuid
    `;
    assert.deepEqual(stage4aProjection, [{
      lyrics: stage4aEditedText,
      lyricsRevision: 11,
    }]);

    const mismatchDocument = legacyPlainTextToLyricsDocument("document value");
    const mismatchTrack = await prisma.track.create({
      data: {
        projectId: project.id,
        title: "Mismatch sentinel",
        lyrics: "legacy mismatch",
        lyricsDocument: mismatchDocument,
        lyricsPlainText: "document value",
      },
    });
    await assert.rejects(
      () => backfillStructuredLyrics(prisma, { batchSize: 1 }),
      LyricsBackfillMismatchError,
    );
    const mismatchAfterStop = await prisma.track.findUniqueOrThrow({ where: { id: mismatchTrack.id } });
    assert.equal(mismatchAfterStop.lyrics, "legacy mismatch");
    assert.equal(mismatchAfterStop.lyricsPlainText, "document value");
    await prisma.track.delete({ where: { id: mismatchTrack.id } });

    const verification = await verifyStructuredLyricsIntegrity(prisma, 1);
    assert.equal(verification.derivedTextMismatches, 0);

    console.log(JSON.stringify({
      emptyLinesAndUnicode: "PASS",
      resumableBackfill: "PASS",
      repeatedBackfillStableIds: "PASS",
      legacyClientSave: "PASS",
      structuredClientSave: "PASS",
      staleRevision409: "PASS",
      leaseLoss409: "PASS",
      malformedDocumentRejected: "PASS",
      autosaveCreatedVersions: 0,
      stage4aRollbackProjection: "PASS",
      stage4aRollbackEditRollForward: "PASS",
      mismatchStopNoRepair: "PASS",
      derivedTextMismatches: 0,
    }));
  } finally {
    await prisma.project.deleteMany({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
