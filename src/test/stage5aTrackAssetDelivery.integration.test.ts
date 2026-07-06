import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient, type ExternalProvider, type Prisma } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage5a-slice6-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 61000 + Math.floor(Math.random() * 1000);
const appPort = 62000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

type CookieJar = { cookie: string };
type SeededUser = { id: string; username: string; password: string; displayName: string };
type BinaryResponse = { status: number; body: Buffer; headers: Headers; text: string };

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (code !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { stdout, stderr };
}

async function waitForHttp(url: string, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function apiBinary(pathname: string, options: RequestInit = {}, jar?: CookieJar): Promise<BinaryResponse> {
  const headers = new Headers(options.headers ?? {});
  if (jar?.cookie) headers.set("cookie", jar.cookie);
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, { ...options, headers });
  if (jar) {
    const nextCookie = readSetCookie(response.headers);
    if (nextCookie) jar.cookie = nextCookie;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    body: buffer,
    headers: response.headers,
    text: buffer.toString("utf8"),
  };
}

function readSetCookie(headers: Headers) {
  const setCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return setCookie.map((entry) => entry.split(";")[0]).join("; ");
}

async function login(username: string, password: string) {
  const response = await apiBinary("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ login: username, password })),
  });
  assert.equal(response.status, 200);
  const cookie = readSetCookie(response.headers);
  assert.ok(cookie.includes("collab.sid="));
  return { cookie };
}

async function createUser(input: { username: string; displayName: string }) {
  const password = `${input.username}-pw`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: `${input.username}@example.invalid`,
      displayName: input.displayName,
      passwordHash,
      role: "user",
      emailVerifiedAt: new Date("2026-07-06T10:00:00.000Z"),
      ageAcknowledgedAt: new Date("2026-07-06T10:00:00.000Z"),
    },
  });
  return { id: user.id, username: user.username, password, displayName: user.displayName } satisfies SeededUser;
}

async function createProjectWithTrack(args: { title: string; owner: SeededUser; editor?: SeededUser; viewer?: SeededUser }) {
  const emptyLyricsDocument = {
    schemaVersion: 1,
    blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "" }] }],
  } as const;

  const project = await prisma.project.create({
    data: {
      title: args.title,
      type: "album",
      members: {
        create: [
          { userId: args.owner.id, role: "owner" },
          ...(args.editor ? [{ userId: args.editor.id, role: "editor" as const }] : []),
          ...(args.viewer ? [{ userId: args.viewer.id, role: "viewer" as const }] : []),
        ],
      },
      tracks: {
        create: {
          title: `${args.title} track`,
          lyrics: "",
          lyricsDocument: emptyLyricsDocument,
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

async function ensureUploadFile(storageKey: string, content: Buffer | string) {
  const absolute = path.join(uploadsDir, storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  return absolute;
}

async function insertAudioVersion(input: {
  trackId: string;
  uploadedById: string;
  projectId: string;
  originalFilename: string;
  storageKey?: string | null;
  mimeType?: string | null;
  externalUrl?: string | null;
  externalProvider?: ExternalProvider | null;
  versionNumber: number;
  createdAt?: Date;
}) {
  return prisma.audioVersion.create({
    data: {
      trackId: input.trackId,
      uploadedById: input.uploadedById,
      originalFilename: input.originalFilename,
      storedFilename: input.externalUrl ? null : `${input.originalFilename}.stored`,
      storageKey: input.externalUrl ? null : (input.storageKey ?? `${input.projectId}/${input.trackId}/${input.originalFilename}.stored`),
      mimeType: input.mimeType ?? (input.externalUrl ? null : "audio/wav"),
      sizeBytes: input.externalUrl ? null : 8,
      durationSeconds: input.externalUrl ? null : 1.5,
      externalUrl: input.externalUrl ?? null,
      isExternal: Boolean(input.externalUrl),
      externalProvider: input.externalProvider ?? null,
      versionNumber: input.versionNumber,
      createdAt: input.createdAt ?? new Date("2026-07-06T10:00:00.000Z"),
    },
  });
}

async function insertTrackAsset(data: Prisma.TrackAssetUncheckedCreateInput) {
  return prisma.trackAsset.create({ data });
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage5a-slice6-uploads-"));

  await runCommand("docker", [
    "run", "-d", "--rm",
    "--name", pgContainer,
    "-e", `POSTGRES_PASSWORD=${pgPassword}`,
    "-e", `POSTGRES_DB=${pgDatabase}`,
    "-p", `${pgPort}:5432`,
    "postgres:16-bookworm",
  ]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await runCommand("docker", ["exec", pgContainer, "pg_isready", "-U", "postgres", "-d", pgDatabase]);
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  await runCommand("npx", ["prisma", "migrate", "deploy"], { env: { DATABASE_URL: databaseUrl } });
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  serverProcess = spawn("npx", ["tsx", "server.ts"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(appPort),
      APP_URL: `http://127.0.0.1:${appPort}`,
      NODE_ENV: "development",
      COOKIE_SECURE: "false",
      TRUST_PROXY: "false",
      SESSION_SECRET: randomBytes(32).toString("hex"),
      UPLOADS_DIR: uploadsDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  serverProcess.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
  serverProcess.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });

  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/api/ready`);
  } catch (error) {
    serverProcess.kill("SIGTERM");
    throw new Error(`Server failed to start\n${serverOutput}\n${String(error)}`);
  }
});

after(async () => {
  serverProcess?.kill("SIGTERM");
  await prisma?.$disconnect();
  await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
  if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
});

test("Stage 5A slice 6 native delivery routes preserve bytes, auth, ranges and DTO safety", async () => {
  const owner = await createUser({ username: `owner_${randomUUID().slice(0, 8)}`, displayName: "Owner" });
  const editor = await createUser({ username: `editor_${randomUUID().slice(0, 8)}`, displayName: "Editor" });
  const viewer = await createUser({ username: `viewer_${randomUUID().slice(0, 8)}`, displayName: "Viewer" });
  const outsider = await createUser({ username: `outsider_${randomUUID().slice(0, 8)}`, displayName: "Outsider" });

  const mainTrack = await createProjectWithTrack({ title: "delivery-main", owner, editor, viewer });
  const otherTrack = await createProjectWithTrack({ title: "delivery-other", owner: outsider });

  const ownerJar = await login(owner.username, owner.password);
  const editorJar = await login(editor.username, editor.password);
  const viewerJar = await login(viewer.username, viewer.password);
  const outsiderJar = await login(outsider.username, outsider.password);

  const mappedAudio = await insertAudioVersion({
    projectId: mainTrack.projectId,
    trackId: mainTrack.trackId,
    uploadedById: owner.id,
    originalFilename: "mapped.wav",
    versionNumber: 1,
  });
  const mappedBytes = Buffer.from("RIFFDATA");
  await ensureUploadFile(mappedAudio.storageKey!, mappedBytes);
  const mappedAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: mappedAudio.originalFilename,
    storageKey: mappedAudio.storageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: mappedBytes.length,
    durationMs: 1500,
    metadata: { source: "AudioVersion" },
    legacyAudioVersionId: mappedAudio.id,
    versionNumber: mappedAudio.versionNumber,
    isPrimary: true,
    createdAt: mappedAudio.createdAt,
  });

  const nativeBytes = Buffer.from("RIFFNATIVE");
  const nativeStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/native.wav`;
  await ensureUploadFile(nativeStorageKey, nativeBytes);
  const nativeAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "REFERENCE",
    status: "READY",
    originalFilename: "native.wav",
    storageKey: nativeStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: nativeBytes.length,
    durationMs: 2500,
    metadata: { source: "upload" },
    isPrimary: false,
  });

  const headerStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/headers.wav`;
  await ensureUploadFile(headerStorageKey, Buffer.from("RIFFHDR!"));
  const headerAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: 'bad"\r\nx-test:1/пример.wav',
    storageKey: headerStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 800,
    metadata: {},
    isPrimary: false,
  });

  const externalAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "REFERENCE",
    status: "READY",
    originalFilename: "external.mp3",
    storageKey: null,
    storageProvider: "external",
    externalUrl: "https://example.com/external.mp3",
    externalProvider: "other",
    mimeType: "audio/mpeg",
    sizeBytes: null,
    durationMs: null,
    metadata: {},
    isPrimary: false,
  });

  const missingAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: "missing.wav",
    storageKey: `${mainTrack.projectId}/${mainTrack.trackId}/missing.wav`,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 5,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const invalidAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: "invalid.wav",
    storageKey: "../escape.wav",
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 5,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const symlinkStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/symlink.wav`;
  const symlinkTarget = path.join(uploadsDir, "outside.wav");
  await writeFile(symlinkTarget, "RIFFOUT!");
  const symlinkPath = path.join(uploadsDir, symlinkStorageKey);
  await mkdir(path.dirname(symlinkPath), { recursive: true });
  await symlink(symlinkTarget, symlinkPath);
  const symlinkAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: "symlink.wav",
    storageKey: symlinkStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const zeroStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/zero.wav`;
  await ensureUploadFile(zeroStorageKey, Buffer.alloc(0));
  const zeroAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: "zero.wav",
    storageKey: zeroStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 0,
    durationMs: 0,
    metadata: {},
    isPrimary: false,
  });

  const uploadingAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "UPLOADING",
    originalFilename: "uploading.wav",
    storageKey: `${mainTrack.projectId}/${mainTrack.trackId}/uploading.wav`,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const failedAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "FAILED",
    originalFilename: "failed.wav",
    storageKey: `${mainTrack.projectId}/${mainTrack.trackId}/failed.wav`,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const deletedAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "DELETED",
    originalFilename: "deleted.wav",
    storageKey: `${mainTrack.projectId}/${mainTrack.trackId}/deleted.wav`,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
    deletedAt: new Date("2026-07-06T11:00:00.000Z"),
  });

  const softDeletedStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/soft-deleted.wav`;
  await ensureUploadFile(softDeletedStorageKey, Buffer.from("RIFFSOFT"));
  const softDeletedAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: "soft-deleted.wav",
    storageKey: softDeletedStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
    deletedAt: new Date("2026-07-06T11:01:00.000Z"),
  });

  const nondeliverableStorageKey = `${mainTrack.projectId}/${mainTrack.trackId}/other.wav`;
  await ensureUploadFile(nondeliverableStorageKey, Buffer.from("RIFFOTHR"));
  const nondeliverableAsset = await insertTrackAsset({
    trackId: mainTrack.trackId,
    projectId: mainTrack.projectId,
    uploadedByUserId: owner.id,
    kind: "OTHER",
    status: "READY",
    originalFilename: "other.wav",
    storageKey: nondeliverableStorageKey,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 8,
    durationMs: 1000,
    metadata: {},
    isPrimary: false,
  });

  const mappedStream = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {}, ownerJar);
  assert.equal(mappedStream.status, 200);
  assert.deepEqual(mappedStream.body, mappedBytes);
  assert.equal(mappedStream.headers.get("content-type"), "audio/wav");
  assert.equal(mappedStream.headers.get("content-length"), String(mappedBytes.length));
  assert.equal(mappedStream.headers.get("accept-ranges"), "bytes");
  assert.match(mappedStream.headers.get("content-disposition") ?? "", /^inline;/);

  const mappedLegacy = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/audio/${mappedAudio.id}/stream`, {}, ownerJar);
  assert.equal(mappedLegacy.status, 200);
  assert.deepEqual(mappedLegacy.body, mappedStream.body);
  assert.equal(mappedLegacy.headers.get("content-type"), mappedStream.headers.get("content-type"));

  const mappedRange = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {
    headers: { range: "bytes=0-3" },
  }, ownerJar);
  assert.equal(mappedRange.status, 206);
  assert.deepEqual(mappedRange.body, mappedBytes.subarray(0, 4));
  assert.equal(mappedRange.headers.get("content-range"), `bytes 0-3/${mappedBytes.length}`);

  const suffixRange = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {
    headers: { range: "bytes=-3" },
  }, ownerJar);
  assert.equal(suffixRange.status, 206);
  assert.deepEqual(suffixRange.body, mappedBytes.subarray(mappedBytes.length - 3));

  const invalidRange = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {
    headers: { range: "bytes=9-3" },
  }, ownerJar);
  assert.equal(invalidRange.status, 416);
  assert.equal(JSON.parse(invalidRange.text).error.code, "INVALID_RANGE");
  assert.equal(invalidRange.headers.get("content-range"), `bytes */${mappedBytes.length}`);

  const headResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {
    method: "HEAD",
  }, ownerJar);
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.body.length, 0);
  assert.equal(headResponse.headers.get("content-length"), String(mappedBytes.length));

  const downloadResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/download`, {}, ownerJar);
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(downloadResponse.body, mappedBytes);
  assert.match(downloadResponse.headers.get("content-disposition") ?? "", /^attachment;/);
  const editorDownloadResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/download`, {}, editorJar);
  assert.equal(editorDownloadResponse.status, 200);

  const nativeStream = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${nativeAsset.id}/stream`, {}, ownerJar);
  assert.equal(nativeStream.status, 200);
  assert.deepEqual(nativeStream.body, nativeBytes);

  const externalResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${externalAsset.id}/stream`, {}, ownerJar);
  assert.equal(externalResponse.status, 409);
  assert.equal(JSON.parse(externalResponse.text).error.code, "EXTERNAL_ASSET");

  const missingResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${missingAsset.id}/stream`, {}, ownerJar);
  assert.equal(missingResponse.status, 404);
  assert.equal(JSON.parse(missingResponse.text).error.code, "ASSET_FILE_NOT_FOUND");

  const invalidResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${invalidAsset.id}/stream`, {}, ownerJar);
  assert.equal(invalidResponse.status, 400);
  assert.equal(JSON.parse(invalidResponse.text).error.code, "INVALID_STORAGE_KEY");

  const symlinkResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${symlinkAsset.id}/stream`, {}, ownerJar);
  assert.equal(symlinkResponse.status, 500);
  assert.equal(JSON.parse(symlinkResponse.text).error.code, "INVALID_STORAGE_KEY");

  const zeroResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${zeroAsset.id}/stream`, {}, ownerJar);
  assert.equal(zeroResponse.status, 404);
  assert.equal(JSON.parse(zeroResponse.text).error.code, "ASSET_FILE_NOT_FOUND");

  for (const asset of [uploadingAsset, failedAsset]) {
    const response = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${asset.id}/stream`, {}, ownerJar);
    assert.equal(response.status, 409);
    assert.equal(JSON.parse(response.text).error.code, "ASSET_NOT_READY");
  }

  for (const asset of [deletedAsset, softDeletedAsset]) {
    const response = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${asset.id}/stream`, {}, ownerJar);
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.text).error.code, "ASSET_NOT_FOUND");
  }

  const nondeliverableResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${nondeliverableAsset.id}/stream`, {}, ownerJar);
  assert.equal(nondeliverableResponse.status, 409);
  assert.equal(JSON.parse(nondeliverableResponse.text).error.code, "ASSET_NOT_DELIVERABLE");

  for (const jar of [ownerJar, editorJar, viewerJar]) {
    const response = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {}, jar);
    assert.equal(response.status, 200);
  }

  const viewerDownload = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/download`, {}, viewerJar);
  assert.equal(viewerDownload.status, 403);

  const outsiderResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`, {}, outsiderJar);
  assert.equal(outsiderResponse.status, 404);

  const anonymousResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`);
  assert.equal(anonymousResponse.status, 401);

  const crossProjectResponse = await apiBinary(`/api/projects/${otherTrack.projectId}/tracks/${otherTrack.trackId}/assets/${mappedAsset.id}/stream`, {}, ownerJar);
  assert.equal(crossProjectResponse.status, 404);

  const wrongTrackResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${otherTrack.trackId}/assets/${mappedAsset.id}/stream`, {}, ownerJar);
  assert.equal(wrongTrackResponse.status, 404);

  const headerResponse = await apiBinary(`/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${headerAsset.id}/download`, {}, ownerJar);
  assert.equal(headerResponse.status, 200);
  const contentDisposition = headerResponse.headers.get("content-disposition") ?? "";
  assert.match(contentDisposition, /^attachment;/);
  assert.ok(!contentDisposition.includes("\r"));
  assert.ok(!contentDisposition.includes("\n"));
  assert.ok(!contentDisposition.includes("/"));

  const projectResponse = await apiBinary(`/api/projects/${mainTrack.projectId}`, {}, ownerJar);
  assert.equal(projectResponse.status, 200);
  const project = JSON.parse(projectResponse.text);
  const track = project.tracks.find((entry: { id: string }) => entry.id === mainTrack.trackId);
  assert.ok(track);
  const dtoMappedAsset = track.assets.find((entry: { id: string }) => entry.id === mappedAsset.id);
  const dtoNativeAsset = track.assets.find((entry: { id: string }) => entry.id === nativeAsset.id);
  const dtoExternalAsset = track.assets.find((entry: { id: string }) => entry.id === externalAsset.id);
  const dtoUploadingAsset = track.assets.find((entry: { id: string }) => entry.id === uploadingAsset.id);
  const dtoOtherAsset = track.assets.find((entry: { id: string }) => entry.id === nondeliverableAsset.id);
  assert.equal(dtoMappedAsset.streamUrl, `/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/stream`);
  assert.equal(dtoMappedAsset.downloadUrl, `/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${mappedAsset.id}/download`);
  assert.equal(dtoNativeAsset.streamUrl, `/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${nativeAsset.id}/stream`);
  assert.equal(dtoNativeAsset.downloadUrl, `/api/projects/${mainTrack.projectId}/tracks/${mainTrack.trackId}/assets/${nativeAsset.id}/download`);
  assert.equal(dtoExternalAsset.streamUrl, null);
  assert.equal(dtoExternalAsset.downloadUrl, null);
  assert.equal(dtoUploadingAsset.streamUrl, null);
  assert.equal(dtoOtherAsset.streamUrl, null);
  assert.equal("storageKey" in dtoMappedAsset, false);
  assert.equal(projectResponse.text.includes(uploadsDir), false);
});
