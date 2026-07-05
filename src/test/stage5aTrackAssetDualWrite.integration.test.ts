import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { deleteAudioVersionWithTrackAsset } from "../server/services/audioVersions";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage5a-slice3-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 58000 + Math.floor(Math.random() * 1000);
const appPort = 59000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

type CookieJar = { cookie: string };
type SeededUser = { id: string; username: string; password: string; displayName: string };
type JsonResponse<T> = { status: number; body: T; headers: Headers };

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

async function apiJson<T>(pathname: string, options: RequestInit = {}, jar?: CookieJar): Promise<JsonResponse<T>> {
  const headers = new Headers(options.headers ?? {});
  if (jar?.cookie) headers.set("cookie", jar.cookie);
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T : null as T;
  return { status: response.status, body, headers: response.headers };
}

function readSetCookie(headers: Headers) {
  const setCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return setCookie.map((entry) => entry.split(";")[0]).join("; ");
}

async function login(username: string, password: string) {
  const response = await apiJson<{ success: boolean; user: { id: string } }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: username, password }),
  });
  assert.equal(response.status, 200);
  const cookie = readSetCookie(response.headers);
  assert.ok(cookie.includes("collab.sid="));
  return { cookie };
}

async function createUser(input: { username: string; displayName: string; verified?: boolean }) {
  const password = `${input.username}-pw`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: `${input.username}@example.invalid`,
      displayName: input.displayName,
      passwordHash,
      role: "user",
      emailVerifiedAt: input.verified === false ? null : new Date("2026-07-05T10:00:00.000Z"),
      ageAcknowledgedAt: input.verified === false ? null : new Date("2026-07-05T10:00:00.000Z"),
    },
  });
  return { id: user.id, username: user.username, password, displayName: user.displayName } satisfies SeededUser;
}

async function createProjectWithTrack(args: {
  title: string;
  owner: SeededUser;
  editor?: SeededUser;
  viewer?: SeededUser;
}) {
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

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return [fullPath];
  }));
  return files.flat();
}

function makeWavBuffer() {
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(0, 40);
  return buffer;
}

async function uploadLocalAudio(args: {
  projectId: string;
  trackId: string;
  cookie?: CookieJar;
  filename?: string;
  mimeType?: string;
  body?: Buffer;
}) {
  const form = new FormData();
  form.append("file", new Blob([args.body ?? makeWavBuffer()], { type: args.mimeType ?? "audio/wav" }), args.filename ?? "demo.wav");
  return apiJson<any>(`/api/projects/${args.projectId}/tracks/${args.trackId}/audio`, {
    method: "POST",
    body: form,
  }, args.cookie);
}

async function uploadExternalAudio(args: {
  projectId: string;
  trackId: string;
  cookie?: CookieJar;
  label: string;
  externalUrl: string;
  externalProvider: "google" | "yandex" | "telegram" | "other";
}) {
  const form = new FormData();
  form.append("label", args.label);
  form.append("externalUrl", args.externalUrl);
  form.append("externalProvider", args.externalProvider);
  return apiJson<any>(`/api/projects/${args.projectId}/tracks/${args.trackId}/audio`, {
    method: "POST",
    body: form,
  }, args.cookie);
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage5a-slice3-uploads-"));

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

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION stage5a_fail_audio_version_insert() RETURNS trigger AS $$
    BEGIN
      IF NEW."originalFilename" = 'force-audio-fail.wav' THEN
        RAISE EXCEPTION 'forced audio version failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER stage5a_fail_audio_version_insert_trigger
    BEFORE INSERT ON "AudioVersion"
    FOR EACH ROW
    EXECUTE FUNCTION stage5a_fail_audio_version_insert();
  `);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION stage5a_fail_track_asset_insert() RETURNS trigger AS $$
    BEGIN
      IF NEW."originalFilename" = 'force-trackasset-fail.wav' THEN
        RAISE EXCEPTION 'forced track asset failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER stage5a_fail_track_asset_insert_trigger
    BEFORE INSERT ON "TrackAsset"
    FOR EACH ROW
    EXECUTE FUNCTION stage5a_fail_track_asset_insert();
  `);

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
    throw new Error(`Server failed to start:\n${serverOutput}`);
  }
});

after(async () => {
  await prisma?.$disconnect();
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => serverProcess?.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (!serverProcess.killed) serverProcess.kill("SIGKILL");
  }
  await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
  if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
});

test("Stage 5A slice 3 dual-write upload and delete compatibility", async () => {
  const owner = await createUser({ username: "owner-stage5a-write", displayName: "Owner Stage5A Write" });
  const editor = await createUser({ username: "editor-stage5a-write", displayName: "Editor Stage5A Write" });
  const viewer = await createUser({ username: "viewer-stage5a-write", displayName: "Viewer Stage5A Write" });
  const outsider = await createUser({ username: "outsider-stage5a-write", displayName: "Outsider Stage5A Write" });

  const ownerJar = await login(owner.username, owner.password);
  const editorJar = await login(editor.username, editor.password);
  const viewerJar = await login(viewer.username, viewer.password);
  const outsiderJar = await login(outsider.username, outsider.password);

  const successScenario = await createProjectWithTrack({ title: "dualwrite-success", owner, editor, viewer });
  const externalScenario = await createProjectWithTrack({ title: "dualwrite-external", owner, editor, viewer });
  const failureScenario = await createProjectWithTrack({ title: "dualwrite-failure", owner, editor, viewer });
  const partialScenario = await createProjectWithTrack({ title: "dualwrite-partial", owner, editor, viewer });
  const concurrencyScenario = await createProjectWithTrack({ title: "dualwrite-concurrency", owner, editor, viewer });

  const localSuccess = await uploadLocalAudio({ projectId: successScenario.projectId, trackId: successScenario.trackId, cookie: ownerJar, filename: "success.wav" });
  assert.equal(localSuccess.status, 201, JSON.stringify(localSuccess.body));
  assert.equal(localSuccess.body.originalFilename, "success.wav");
  assert.equal(localSuccess.body.versionNumber, 1);
  assert.equal(typeof localSuccess.body.id, "string");
  assert.equal("assets" in localSuccess.body, false);

  const successAudioRows = await prisma.audioVersion.findMany({ where: { trackId: successScenario.trackId }, orderBy: { versionNumber: "asc" } });
  const successAssetRows = await prisma.trackAsset.findMany({ where: { trackId: successScenario.trackId }, orderBy: { versionNumber: "asc" } });
  assert.equal(successAudioRows.length, 1);
  assert.equal(successAssetRows.length, 1);
  assert.equal(successAssetRows[0].legacyAudioVersionId, successAudioRows[0].id);
  assert.equal(successAssetRows[0].versionNumber, successAudioRows[0].versionNumber);
  assert.equal(successAssetRows[0].uploadedByUserId, successAudioRows[0].uploadedById);
  assert.equal(successAssetRows[0].isPrimary, true);
  assert.equal(successAssetRows[0].storageProvider, "local");

  const storedLocalPath = path.resolve(uploadsDir, successAudioRows[0].storageKey!);
  assert.equal(storedLocalPath.startsWith(uploadsDir), true);
  assert.equal((await stat(storedLocalPath)).isFile(), true);
  assert.ok((await readFile(storedLocalPath)).subarray(0, 12).equals(makeWavBuffer().subarray(0, 12)));

  const successTrack = await apiJson<any>(`/api/projects/${successScenario.projectId}/tracks/${successScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(successTrack.status, 200);
  assert.equal(successTrack.body.audioVersions.length, 1);
  assert.equal(successTrack.body.assets.length, 1);
  assert.equal(successTrack.body.assets[0].legacyAudioVersionId, successAudioRows[0].id);

  const secondUpload = await uploadLocalAudio({ projectId: successScenario.projectId, trackId: successScenario.trackId, cookie: editorJar, filename: "second.wav" });
  assert.equal(secondUpload.status, 201, JSON.stringify(secondUpload.body));
  const successAssetRowsAfterSecond = await prisma.trackAsset.findMany({ where: { trackId: successScenario.trackId }, orderBy: { versionNumber: "asc" } });
  assert.equal(successAssetRowsAfterSecond.length, 2);
  assert.equal(successAssetRowsAfterSecond[0].isPrimary, true);
  assert.equal(successAssetRowsAfterSecond[1].isPrimary, false);

  const externalSuccess = await uploadExternalAudio({
    projectId: externalScenario.projectId,
    trackId: externalScenario.trackId,
    cookie: editorJar,
    label: "external demo",
    externalUrl: "https://example.com/audio.mp3",
    externalProvider: "other",
  });
  assert.equal(externalSuccess.status, 201, JSON.stringify(externalSuccess.body));
  assert.equal(externalSuccess.body.externalUrl, "https://example.com/audio.mp3");
  assert.equal(externalSuccess.body.streamUrl, null);
  const externalAudioRows = await prisma.audioVersion.findMany({ where: { trackId: externalScenario.trackId } });
  const externalAssetRows = await prisma.trackAsset.findMany({ where: { trackId: externalScenario.trackId } });
  assert.equal(externalAudioRows.length, 1);
  assert.equal(externalAssetRows.length, 1);
  assert.equal(externalAssetRows[0].storageKey, null);
  assert.equal(externalAssetRows[0].storageProvider, "external");
  assert.equal(externalAssetRows[0].externalUrl, "https://example.com/audio.mp3");
  const uploadsAfterExternal = await listFilesRecursive(uploadsDir);
  assert.equal(uploadsAfterExternal.some((file) => file.includes("external demo")), false);

  const invalidMime = await uploadLocalAudio({
    projectId: failureScenario.projectId,
    trackId: failureScenario.trackId,
    cookie: ownerJar,
    filename: "invalid.txt",
    mimeType: "text/plain",
  });
  assert.equal(invalidMime.status, 415);
  assert.equal(await prisma.audioVersion.count({ where: { trackId: failureScenario.trackId } }), 0);
  assert.equal(await prisma.trackAsset.count({ where: { trackId: failureScenario.trackId } }), 0);

  const filesBeforeForcedFailures = await listFilesRecursive(uploadsDir);
  const forcedAudioFailure = await uploadLocalAudio({
    projectId: failureScenario.projectId,
    trackId: failureScenario.trackId,
    cookie: ownerJar,
    filename: "force-audio-fail.wav",
  });
  assert.equal(forcedAudioFailure.status, 500);
  assert.equal(await prisma.audioVersion.count({ where: { trackId: failureScenario.trackId, originalFilename: "force-audio-fail.wav" } }), 0);
  assert.equal(await prisma.trackAsset.count({ where: { trackId: failureScenario.trackId, originalFilename: "force-audio-fail.wav" } }), 0);
  assert.deepEqual(await listFilesRecursive(uploadsDir), filesBeforeForcedFailures);

  const forcedTrackAssetFailure = await uploadLocalAudio({
    projectId: failureScenario.projectId,
    trackId: failureScenario.trackId,
    cookie: ownerJar,
    filename: "force-trackasset-fail.wav",
  });
  assert.equal(forcedTrackAssetFailure.status, 500);
  assert.equal(await prisma.audioVersion.count({ where: { trackId: failureScenario.trackId, originalFilename: "force-trackasset-fail.wav" } }), 0);
  assert.equal(await prisma.trackAsset.count({ where: { trackId: failureScenario.trackId, originalFilename: "force-trackasset-fail.wav" } }), 0);
  assert.deepEqual(await listFilesRecursive(uploadsDir), filesBeforeForcedFailures);

  await prisma.audioVersion.create({
    data: {
      trackId: partialScenario.trackId,
      uploadedById: owner.id,
      originalFilename: "legacy-only.wav",
      storedFilename: "legacy-only.stored",
      storageKey: `${partialScenario.projectId}/${partialScenario.trackId}/legacy-only.stored`,
      mimeType: "audio/wav",
      sizeBytes: 64,
      durationSeconds: 1.25,
      versionNumber: 1,
    },
  });
  const partialUpload = await uploadExternalAudio({
    projectId: partialScenario.projectId,
    trackId: partialScenario.trackId,
    cookie: ownerJar,
    label: "new external",
    externalUrl: "https://example.com/partial.mp3",
    externalProvider: "other",
  });
  assert.equal(partialUpload.status, 201, JSON.stringify(partialUpload.body));
  const partialTrack = await apiJson<any>(`/api/projects/${partialScenario.projectId}/tracks/${partialScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(partialTrack.body.audioVersions.length, 2);
  assert.equal(partialTrack.body.assets.length, 2);
  assert.equal(partialTrack.body.assets.filter((asset: any) => asset.originalFilename === "legacy-only.wav").length, 1);
  assert.equal(partialTrack.body.assets.filter((asset: any) => asset.originalFilename === "new external").length, 1);

  const viewerDenied = await uploadExternalAudio({
    projectId: successScenario.projectId,
    trackId: successScenario.trackId,
    cookie: viewerJar,
    label: "viewer denied",
    externalUrl: "https://example.com/viewer.mp3",
    externalProvider: "other",
  });
  assert.equal(viewerDenied.status, 403);

  const outsiderDenied = await uploadExternalAudio({
    projectId: successScenario.projectId,
    trackId: successScenario.trackId,
    cookie: outsiderJar,
    label: "outsider denied",
    externalUrl: "https://example.com/outsider.mp3",
    externalProvider: "other",
  });
  assert.equal(outsiderDenied.status, 404);

  const crossProjectDenied = await uploadExternalAudio({
    projectId: successScenario.projectId,
    trackId: externalScenario.trackId,
    cookie: ownerJar,
    label: "cross denied",
    externalUrl: "https://example.com/cross.mp3",
    externalProvider: "other",
  });
  assert.equal(crossProjectDenied.status, 404);

  const concurrentResults = await Promise.all([
    uploadExternalAudio({
      projectId: concurrencyScenario.projectId,
      trackId: concurrencyScenario.trackId,
      cookie: ownerJar,
      label: "concurrent-a",
      externalUrl: "https://example.com/a.mp3",
      externalProvider: "other",
    }),
    uploadExternalAudio({
      projectId: concurrencyScenario.projectId,
      trackId: concurrencyScenario.trackId,
      cookie: editorJar,
      label: "concurrent-b",
      externalUrl: "https://example.com/b.mp3",
      externalProvider: "other",
    }),
  ]);
  assert.deepEqual(concurrentResults.map((result) => result.status).sort(), [201, 201]);
  const concurrentAudioRows = await prisma.audioVersion.findMany({
    where: { trackId: concurrencyScenario.trackId },
    orderBy: { versionNumber: "asc" },
  });
  const concurrentAssetRows = await prisma.trackAsset.findMany({
    where: { trackId: concurrencyScenario.trackId },
    orderBy: { versionNumber: "asc" },
  });
  assert.equal(concurrentAudioRows.length, 2);
  assert.equal(concurrentAssetRows.length, 2);
  assert.deepEqual(concurrentAudioRows.map((row) => row.versionNumber), [1, 2]);
  assert.equal(concurrentAssetRows.filter((row) => row.isPrimary).length, 1);
  assert.equal(new Set(concurrentAssetRows.map((row) => row.legacyAudioVersionId)).size, 2);

  const deleteAudioId = successAssetRowsAfterSecond[0].legacyAudioVersionId!;
  await deleteAudioVersionWithTrackAsset(prisma, { audioId: deleteAudioId, uploadsRoot: uploadsDir });
  assert.equal(await prisma.audioVersion.count({ where: { id: deleteAudioId } }), 0);
  const deletedAsset = await prisma.trackAsset.findFirst({
    where: { trackId: successScenario.trackId, originalFilename: "success.wav" },
  });
  assert.ok(deletedAsset);
  assert.equal(deletedAsset.status, "DELETED");
  assert.ok(deletedAsset.deletedAt);
  const deletedTrack = await apiJson<any>(`/api/projects/${successScenario.projectId}/tracks/${successScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(deletedTrack.body.audioVersions.length, 1);
  assert.equal(deletedTrack.body.assets.some((asset: any) => asset.originalFilename === "success.wav"), false);
  await stat(storedLocalPath).then(
    () => assert.fail("deleted local file should be removed"),
    (error: NodeJS.ErrnoException) => assert.equal(error.code, "ENOENT"),
  );
});
