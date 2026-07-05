import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage5a-slice4-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 60000 + Math.floor(Math.random() * 400);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let uploadsDir = "";

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: Buffer | string } = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  if (options.stdin !== undefined) child.stdin.write(options.stdin);
  child.stdin.end();

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  return { code, stdout, stderr };
}

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = await runCommand("npx", ["tsx", "scripts/backfill-track-assets.ts", ...args], {
    env: {
      DATABASE_URL: databaseUrl,
      UPLOADS_DIR: uploadsDir,
      ...env,
    },
  });

  const text = (result.stdout.trim() || result.stderr.trim()).split("\n").at(-1) ?? "";
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep null
  }
  return { ...result, json };
}

async function createUser(username: string) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@example.invalid`,
      displayName: username,
      passwordHash: "test-only",
      emailVerifiedAt: new Date("2026-07-06T10:00:00.000Z"),
      ageAcknowledgedAt: new Date("2026-07-06T10:00:00.000Z"),
    },
  });
}

async function createProjectTrack(userId: string, title: string) {
  const project = await prisma.project.create({
    data: {
      title,
      type: "album",
      members: { create: { userId, role: "owner" } },
      tracks: {
        create: {
          title: `${title} track`,
          lyrics: "",
          lyricsDocument: { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "" }] }] },
          lyricsPlainText: "",
          lyricsRevision: 0,
          tags: [],
        },
      },
    },
    include: { tracks: true },
  });
  return { projectId: project.id, trackId: project.tracks[0].id };
}

async function insertAudioVersion(input: {
  id?: string;
  trackId: string;
  uploadedById: string;
  originalFilename: string;
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  externalUrl?: string | null;
  externalProvider?: "google" | "yandex" | "telegram" | "other" | null;
  versionNumber: number;
  createdAt: Date;
}) {
  return prisma.audioVersion.create({
    data: {
      id: input.id ?? randomUUID(),
      trackId: input.trackId,
      uploadedById: input.uploadedById,
      originalFilename: input.originalFilename,
      storedFilename: input.externalUrl ? null : `${input.originalFilename}.stored`,
      storageKey: input.externalUrl ? null : (input.storageKey ?? `${input.trackId}/${input.originalFilename}.stored`),
      mimeType: input.mimeType ?? (input.externalUrl ? null : "audio/wav"),
      sizeBytes: input.sizeBytes ?? (input.externalUrl ? null : 512),
      durationSeconds: input.durationSeconds ?? (input.externalUrl ? null : 12.5),
      externalUrl: input.externalUrl ?? null,
      isExternal: Boolean(input.externalUrl),
      externalProvider: input.externalProvider ?? null,
      versionNumber: input.versionNumber,
      createdAt: input.createdAt,
    },
  });
}

async function ensureUploadFile(storageKey: string, content = "RIFF0000WAVE") {
  const absolute = path.join(uploadsDir, storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage5a-slice4-uploads-"));

  await runCommand("docker", [
    "run", "-d", "--rm",
    "--name", pgContainer,
    "-e", `POSTGRES_PASSWORD=${pgPassword}`,
    "-e", `POSTGRES_DB=${pgDatabase}`,
    "-p", `${pgPort}:5432`,
    "postgres:16-bookworm",
  ]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await runCommand("docker", ["exec", pgContainer, "pg_isready", "-U", "postgres", "-d", pgDatabase]);
    if (ready.code === 0) break;
    if (attempt === 29) throw new Error(ready.stderr || ready.stdout || "pg_isready failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const migrated = await runCommand("npx", ["prisma", "migrate", "deploy"], { env: { DATABASE_URL: databaseUrl } });
  assert.equal(migrated.code, 0, migrated.stderr || migrated.stdout);
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
});

after(async () => {
  await prisma?.$disconnect();
  await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
  if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
});

test("Stage 5A slice 4 backfill CLI is resumable and idempotent", async () => {
  const owner = await createUser(`backfill_${randomUUID().slice(0, 8)}`);
  const batchTrack = await createProjectTrack(owner.id, "batch");
  const presentTrack = await createProjectTrack(owner.id, "present");
  const externalTrack = await createProjectTrack(owner.id, "external");
  const missingTrack = await createProjectTrack(owner.id, "missing");
  const invalidTrack = await createProjectTrack(owner.id, "invalid");
  const skipTrack = await createProjectTrack(owner.id, "skip");
  const conflictTrack = await createProjectTrack(owner.id, "conflict");
  const promoteTrack = await createProjectTrack(owner.id, "promote");

  const sharedCreatedAt = new Date("2026-07-06T10:00:00.000Z");
  const batchRows = await Promise.all([
    insertAudioVersion({ trackId: batchTrack.trackId, uploadedById: owner.id, originalFilename: "batch-a.wav", storageKey: `${batchTrack.projectId}/${batchTrack.trackId}/batch-a.wav`, versionNumber: 1, createdAt: sharedCreatedAt }),
    insertAudioVersion({ trackId: batchTrack.trackId, uploadedById: owner.id, originalFilename: "batch-b.wav", storageKey: `${batchTrack.projectId}/${batchTrack.trackId}/batch-b.wav`, versionNumber: 2, createdAt: sharedCreatedAt }),
    insertAudioVersion({ trackId: batchTrack.trackId, uploadedById: owner.id, originalFilename: "batch-c.wav", storageKey: `${batchTrack.projectId}/${batchTrack.trackId}/batch-c.wav`, versionNumber: 3, createdAt: sharedCreatedAt }),
    insertAudioVersion({ trackId: batchTrack.trackId, uploadedById: owner.id, originalFilename: "batch-d.wav", storageKey: `${batchTrack.projectId}/${batchTrack.trackId}/batch-d.wav`, versionNumber: 4, createdAt: sharedCreatedAt }),
    insertAudioVersion({ trackId: batchTrack.trackId, uploadedById: owner.id, originalFilename: "batch-e.wav", storageKey: `${batchTrack.projectId}/${batchTrack.trackId}/batch-e.wav`, versionNumber: 5, createdAt: sharedCreatedAt }),
  ]);
  await Promise.all(batchRows.map((row) => ensureUploadFile(row.storageKey!)));

  const presentRow = await insertAudioVersion({
    trackId: presentTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "present.wav",
    storageKey: `${presentTrack.projectId}/${presentTrack.trackId}/present.wav`,
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:01:00.000Z"),
  });
  await ensureUploadFile(presentRow.storageKey!);

  const externalRow = await insertAudioVersion({
    trackId: externalTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "external link",
    externalUrl: "https://example.com/ext.mp3",
    externalProvider: "other",
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:02:00.000Z"),
  });

  const missingRow = await insertAudioVersion({
    trackId: missingTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "missing.wav",
    storageKey: `${missingTrack.projectId}/${missingTrack.trackId}/missing.wav`,
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:03:00.000Z"),
  });

  const invalidRow = await insertAudioVersion({
    trackId: invalidTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "invalid.wav",
    storageKey: "../escape.wav",
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:04:00.000Z"),
  });

  const skippedAudio = await insertAudioVersion({
    trackId: skipTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "skip.wav",
    storageKey: `${skipTrack.projectId}/${skipTrack.trackId}/skip.wav`,
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:05:00.000Z"),
  });
  await ensureUploadFile(skippedAudio.storageKey!);
  await prisma.trackAsset.create({
    data: {
      trackId: skippedAudio.trackId,
      projectId: skipTrack.projectId,
      uploadedByUserId: owner.id,
      kind: "AUDIO_VERSION",
      status: "READY",
      originalFilename: skippedAudio.originalFilename,
      storageKey: skippedAudio.storageKey,
      storageProvider: "local",
      mimeType: skippedAudio.mimeType,
      sizeBytes: skippedAudio.sizeBytes,
      durationMs: Math.round((skippedAudio.durationSeconds ?? 0) * 1000),
      metadata: { source: "AudioVersion", backfilled: true },
      legacyAudioVersionId: skippedAudio.id,
      versionNumber: skippedAudio.versionNumber,
      isPrimary: true,
      createdAt: skippedAudio.createdAt,
    },
  });

  const conflictAudio = await insertAudioVersion({
    trackId: conflictTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "conflict.wav",
    storageKey: `${conflictTrack.projectId}/${conflictTrack.trackId}/conflict.wav`,
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:06:00.000Z"),
  });
  await ensureUploadFile(conflictAudio.storageKey!);
  await prisma.trackAsset.create({
    data: {
      trackId: conflictAudio.trackId,
      projectId: conflictTrack.projectId,
      uploadedByUserId: owner.id,
      kind: "AUDIO_VERSION",
      status: "READY",
      originalFilename: "different-name.wav",
      storageKey: conflictAudio.storageKey,
      storageProvider: "local",
      mimeType: conflictAudio.mimeType,
      sizeBytes: conflictAudio.sizeBytes,
      durationMs: Math.round((conflictAudio.durationSeconds ?? 0) * 1000),
      metadata: { source: "AudioVersion", backfilled: true },
      legacyAudioVersionId: conflictAudio.id,
      versionNumber: conflictAudio.versionNumber,
      isPrimary: false,
      createdAt: conflictAudio.createdAt,
    },
  });

  const promoteTop = await insertAudioVersion({
    trackId: promoteTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "promote-top.wav",
    storageKey: `${promoteTrack.projectId}/${promoteTrack.trackId}/promote-top.wav`,
    versionNumber: 2,
    createdAt: new Date("2026-07-06T10:07:00.000Z"),
  });
  await ensureUploadFile(promoteTop.storageKey!);
  const promoteLegacy = await insertAudioVersion({
    trackId: promoteTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "promote-legacy.wav",
    storageKey: `${promoteTrack.projectId}/${promoteTrack.trackId}/promote-legacy.wav`,
    versionNumber: 1,
    createdAt: new Date("2026-07-06T10:07:30.000Z"),
  });
  await ensureUploadFile(promoteLegacy.storageKey!);
  await prisma.trackAsset.create({
    data: {
      trackId: promoteTop.trackId,
      projectId: promoteTrack.projectId,
      uploadedByUserId: owner.id,
      kind: "AUDIO_VERSION",
      status: "READY",
      originalFilename: promoteTop.originalFilename,
      storageKey: promoteTop.storageKey,
      storageProvider: "local",
      mimeType: promoteTop.mimeType,
      sizeBytes: promoteTop.sizeBytes,
      durationMs: Math.round((promoteTop.durationSeconds ?? 0) * 1000),
      metadata: { source: "AudioVersion" },
      legacyAudioVersionId: promoteTop.id,
      versionNumber: promoteTop.versionNumber,
      isPrimary: false,
      createdAt: promoteTop.createdAt,
    },
  });

  const countsBefore = {
    projects: await prisma.project.count(),
    tracks: await prisma.track.count(),
    users: await prisma.user.count(),
    audioVersions: await prisma.audioVersion.count(),
    trackAssets: await prisma.trackAsset.count(),
  };

  const guard = await runCli(["--execute", "--batch-size=1", "--max-rows=1", "--json"]);
  assert.notEqual(guard.code, 0);
  assert.match(guard.stderr, /TRACK_ASSET_BACKFILL_CONFIRM=YES/);

  const dryRun = await runCli(["--dry-run", "--batch-size=2", `--max-rows=2`, "--json"]);
  assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
  assert.equal(dryRun.json.mode, "dry-run");
  assert.equal(dryRun.json.scanned, 2);
  assert.equal(dryRun.json.wouldCreate, 2);
  assert.ok(dryRun.json.nextCursor);
  assert.equal(await prisma.trackAsset.count(), countsBefore.trackAssets);

  const executeBatch1 = await runCli(["--execute", "--batch-size=2", "--max-rows=2", "--json"], {
    TRACK_ASSET_BACKFILL_CONFIRM: "YES",
  });
  assert.equal(executeBatch1.code, 0, executeBatch1.stderr || executeBatch1.stdout);
  assert.equal(executeBatch1.json.created, 2);
  const afterBatch1Count = await prisma.trackAsset.count();
  assert.equal(afterBatch1Count, countsBefore.trackAssets + 2);
  const cursor1 = executeBatch1.json.nextCursor;
  assert.ok(cursor1);

  const executeBatch2 = await runCli(["--execute", "--batch-size=2", `--cursor=${cursor1}`, "--max-rows=20", "--json"], {
    TRACK_ASSET_BACKFILL_CONFIRM: "YES",
  });
  assert.equal(executeBatch2.code, 0, executeBatch2.stderr || executeBatch2.stdout);
  assert.ok(executeBatch2.json.created >= 7);
  assert.ok(executeBatch2.json.skipped >= 1);
  assert.ok(executeBatch2.json.missing >= 1);
  assert.ok(executeBatch2.json.conflicts >= 2);
  assert.ok(executeBatch2.json.external >= 1);
  assert.ok(executeBatch2.json.localPresent >= 1);

  const allBatchAssets = await prisma.trackAsset.findMany({ where: { trackId: batchTrack.trackId }, orderBy: [{ versionNumber: "asc" }] });
  assert.equal(allBatchAssets.length, 5);
  assert.equal(allBatchAssets.filter((row) => row.isPrimary).length, 1);
  assert.equal(allBatchAssets.find((row) => row.versionNumber === 5)?.isPrimary, true);

  const externalAsset = await prisma.trackAsset.findUnique({ where: { legacyAudioVersionId: externalRow.id } });
  assert.ok(externalAsset);
  assert.equal(externalAsset.storageProvider, "external");
  assert.equal(externalAsset.storageKey, null);

  const missingAsset = await prisma.trackAsset.findUnique({ where: { legacyAudioVersionId: missingRow.id } });
  assert.ok(missingAsset);
  assert.equal(missingAsset.status, "READY");
  assert.deepEqual(missingAsset.metadata, { source: "AudioVersion", backfilled: true, fileMissing: true });

  const invalidAsset = await prisma.trackAsset.findUnique({ where: { legacyAudioVersionId: invalidRow.id } });
  assert.equal(invalidAsset, null);

  const conflictAsset = await prisma.trackAsset.findUnique({ where: { legacyAudioVersionId: conflictAudio.id } });
  assert.ok(conflictAsset);
  assert.equal(conflictAsset.originalFilename, "different-name.wav");

  const promotedTopAsset = await prisma.trackAsset.findUniqueOrThrow({ where: { legacyAudioVersionId: promoteTop.id } });
  const promotedLegacyAsset = await prisma.trackAsset.findUniqueOrThrow({ where: { legacyAudioVersionId: promoteLegacy.id } });
  assert.equal(promotedTopAsset.isPrimary, true);
  assert.equal(promotedLegacyAsset.isPrimary, false);

  const rerun = await runCli(["--execute", "--batch-size=50", "--json"], {
    TRACK_ASSET_BACKFILL_CONFIRM: "YES",
  });
  assert.equal(rerun.code, 0, rerun.stderr || rerun.stdout);
  assert.equal(rerun.json.created, 0);
  assert.ok(rerun.json.skipped >= 8);

  const countsAfter = {
    projects: await prisma.project.count(),
    tracks: await prisma.track.count(),
    users: await prisma.user.count(),
    audioVersions: await prisma.audioVersion.count(),
    trackAssets: await prisma.trackAsset.count(),
  };
  assert.deepEqual(
    {
      projects: countsAfter.projects,
      tracks: countsAfter.tracks,
      users: countsAfter.users,
      audioVersions: countsAfter.audioVersions,
    },
    {
      projects: countsBefore.projects,
      tracks: countsBefore.tracks,
      users: countsBefore.users,
      audioVersions: countsBefore.audioVersions,
    },
  );
  assert.equal(countsAfter.trackAssets, countsBefore.trackAssets + 9);
});
