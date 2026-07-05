import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient, type ExternalProvider, type Prisma } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage5a-slice2-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 56000 + Math.floor(Math.random() * 1000);
const appPort = 57000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

type CookieJar = {
  cookie: string;
};

type SeededUser = {
  id: string;
  username: string;
  password: string;
  displayName: string;
};

type JsonResponse<T> = {
  status: number;
  body: T;
  headers: Headers;
};

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

  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin);
  }
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
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
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
  outsider?: SeededUser;
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
    include: {
      tracks: true,
    },
  });

  return { projectId: project.id, trackId: project.tracks[0].id };
}

async function insertLegacyAudio(trackId: string, uploadedById: string, input: {
  originalFilename: string;
  versionNumber: number;
  externalUrl?: string | null;
  externalProvider?: ExternalProvider | null;
}) {
  return prisma.audioVersion.create({
    data: {
      trackId,
      uploadedById,
      originalFilename: input.originalFilename,
      storedFilename: input.externalUrl ? null : `${input.originalFilename}.stored`,
      storageKey: input.externalUrl ? null : `project/${trackId}/${input.originalFilename}.stored`,
      mimeType: input.externalUrl ? null : "audio/wav",
      sizeBytes: input.externalUrl ? null : 1024,
      durationSeconds: input.externalUrl ? null : 12.5,
      externalUrl: input.externalUrl ?? null,
      isExternal: Boolean(input.externalUrl),
      externalProvider: input.externalProvider ?? null,
      versionNumber: input.versionNumber,
      createdAt: new Date(`2026-07-05T10:0${input.versionNumber}:00.000Z`),
    },
  });
}

async function insertTrackAsset(data: Prisma.TrackAssetUncheckedCreateInput) {
  return prisma.trackAsset.create({ data });
}

function findTrack(projects: Array<any>, projectId: string, trackId: string) {
  const project = projects.find((entry) => entry.id === projectId);
  assert.ok(project, `project ${projectId} not found`);
  const track = project.tracks.find((entry: any) => entry.id === trackId);
  assert.ok(track, `track ${trackId} not found`);
  return track;
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage5a-slice2-uploads-"));

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

  await runCommand("npx", ["prisma", "migrate", "deploy"], {
    env: { DATABASE_URL: databaseUrl },
  });

  prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

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
    if (!serverProcess.killed) {
      serverProcess.kill("SIGKILL");
    }
  }
  await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
  }
});

test("Stage 5A slice 2 API contract and permissions", async () => {
  const owner = await createUser({ username: "owner-stage5a", displayName: "Owner Stage5A" });
  const editor = await createUser({ username: "editor-stage5a", displayName: "Editor Stage5A" });
  const viewer = await createUser({ username: "viewer-stage5a", displayName: "Viewer Stage5A" });
  const outsider = await createUser({ username: "outsider-stage5a", displayName: "Outsider Stage5A" });

  const ownerJar = await login(owner.username, owner.password);
  const editorJar = await login(editor.username, editor.password);
  const viewerJar = await login(viewer.username, viewer.password);
  const outsiderJar = await login(outsider.username, outsider.password);

  const singleResponse = await apiJson<any>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ title: "slice2 single", type: "single", initialTrackTitle: "single track" }),
  }, ownerJar);
  assert.equal(singleResponse.status, 201);
  assert.equal(singleResponse.body.tracks.length, 1);
  assert.deepEqual(singleResponse.body.tracks[0].assets, []);
  assert.deepEqual(singleResponse.body.tracks[0].audioVersions, []);

  const albumResponse = await apiJson<any>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ title: "slice2 album", type: "album" }),
  }, ownerJar);
  assert.equal(albumResponse.status, 201);
  assert.deepEqual(albumResponse.body.tracks, []);

  const albumTrackResponse = await apiJson<any>(`/api/projects/${albumResponse.body.id}/tracks`, {
    method: "POST",
    body: JSON.stringify({ title: "album added track" }),
  }, ownerJar);
  assert.equal(albumTrackResponse.status, 201);
  assert.deepEqual(albumTrackResponse.body.assets, []);
  assert.deepEqual(albumTrackResponse.body.audioVersions, []);

  const emptyScenario = await createProjectWithTrack({ title: "empty-scenario", owner, editor, viewer });
  const legacyScenario = await createProjectWithTrack({ title: "legacy-scenario", owner, editor, viewer });
  const mappedScenario = await createProjectWithTrack({ title: "mapped-scenario", owner, editor, viewer });
  const partialScenario = await createProjectWithTrack({ title: "partial-scenario", owner, editor, viewer });
  const nativeScenario = await createProjectWithTrack({ title: "native-scenario", owner, editor, viewer });
  const statusScenario = await createProjectWithTrack({ title: "status-scenario", owner, editor, viewer });
  const primaryScenario = await createProjectWithTrack({ title: "primary-scenario", owner, editor, viewer });
  const mismatchProject = await createProjectWithTrack({ title: "mismatch-scenario", owner, editor, viewer });
  const externalScenario = await createProjectWithTrack({ title: "external-scenario", owner, editor, viewer });

  const legacyA = await insertLegacyAudio(legacyScenario.trackId, owner.id, { originalFilename: "legacy-a.wav", versionNumber: 1 });
  const legacyB = await insertLegacyAudio(legacyScenario.trackId, owner.id, { originalFilename: "legacy-b.wav", versionNumber: 2 });

  const mappedA = await insertLegacyAudio(mappedScenario.trackId, owner.id, { originalFilename: "mapped-a.wav", versionNumber: 1 });
  const mappedB = await insertLegacyAudio(mappedScenario.trackId, owner.id, { originalFilename: "mapped-b.wav", versionNumber: 2 });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: mappedScenario.trackId,
    projectId: mappedScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: mappedA.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: mappedA.id,
    versionNumber: 1,
    isPrimary: false,
  });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: mappedScenario.trackId,
    projectId: mappedScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: mappedB.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: mappedB.id,
    versionNumber: 2,
    isPrimary: true,
  });

  const partialA = await insertLegacyAudio(partialScenario.trackId, owner.id, { originalFilename: "partial-a.wav", versionNumber: 1 });
  await insertLegacyAudio(partialScenario.trackId, owner.id, { originalFilename: "partial-b.wav", versionNumber: 2 });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: partialScenario.trackId,
    projectId: partialScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: partialA.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: partialA.id,
    versionNumber: 1,
    isPrimary: false,
  });

  await insertTrackAsset({
    id: randomUUID(),
    trackId: nativeScenario.trackId,
    projectId: nativeScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "REFERENCE",
    status: "READY",
    originalFilename: "reference.pdf",
    storageProvider: "local",
    mimeType: "application/pdf",
    sizeBytes: 250,
    durationMs: null,
    metadata: { source: "native" },
    externalUrl: "https://example.com/reference.pdf",
    externalProvider: "other",
    isPrimary: false,
  });

  const readyStatusAudio = await insertLegacyAudio(statusScenario.trackId, owner.id, { originalFilename: "ready.wav", versionNumber: 1 });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: statusScenario.trackId,
    projectId: statusScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "READY",
    originalFilename: readyStatusAudio.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: readyStatusAudio.id,
    versionNumber: 1,
    isPrimary: false,
  });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: statusScenario.trackId,
    projectId: statusScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "UPLOADING",
    originalFilename: "uploading.wav",
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: null,
    versionNumber: 2,
    isPrimary: false,
  });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: statusScenario.trackId,
    projectId: statusScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "FAILED",
    originalFilename: "failed.wav",
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: null,
    versionNumber: 3,
    isPrimary: false,
  });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: statusScenario.trackId,
    projectId: statusScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "AUDIO_VERSION",
    status: "DELETED",
    originalFilename: "deleted.wav",
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: null,
    versionNumber: 4,
    isPrimary: false,
  });

  const primaryA = await insertLegacyAudio(primaryScenario.trackId, owner.id, { originalFilename: "primary-a.wav", versionNumber: 1 });
  const primaryB = await insertLegacyAudio(primaryScenario.trackId, owner.id, { originalFilename: "primary-b.wav", versionNumber: 2 });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: primaryScenario.trackId,
    projectId: primaryScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "MASTER",
    status: "READY",
    originalFilename: primaryA.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: primaryA.id,
    versionNumber: 1,
    isPrimary: true,
    createdAt: new Date("2026-07-05T10:00:00.000Z"),
  });
  await insertTrackAsset({
    id: randomUUID(),
    trackId: primaryScenario.trackId,
    projectId: primaryScenario.projectId,
    uploadedByUserId: owner.id,
    kind: "MASTER",
    status: "READY",
    originalFilename: primaryB.originalFilename,
    storageProvider: "local",
    mimeType: "audio/wav",
    sizeBytes: 1000,
    durationMs: 1000,
    metadata: {},
    legacyAudioVersionId: primaryB.id,
    versionNumber: 2,
    isPrimary: true,
    createdAt: new Date("2026-07-05T10:01:00.000Z"),
  });

  await prisma.project.create({
    data: {
      title: "mismatch-other-project",
      type: "album",
      members: { create: { userId: owner.id, role: "owner" } },
    },
  }).then(async (otherProject) => {
    await insertTrackAsset({
      id: randomUUID(),
      trackId: mismatchProject.trackId,
      projectId: otherProject.id,
      uploadedByUserId: owner.id,
      kind: "REFERENCE",
      status: "READY",
      originalFilename: "cross-project.mp3",
      storageProvider: "local",
      mimeType: "audio/mpeg",
      sizeBytes: 100,
      durationMs: 1000,
      metadata: {},
      isPrimary: false,
    });
  });

  const externalAudio = await insertLegacyAudio(externalScenario.trackId, owner.id, {
    originalFilename: "external link",
    versionNumber: 1,
    externalUrl: "https://example.com/external.mp3",
    externalProvider: "other",
  });
  assert.ok(externalAudio.isExternal);

  const projectsList = await apiJson<any[]>("/api/projects", { method: "GET" }, ownerJar);
  assert.equal(projectsList.status, 200, JSON.stringify(projectsList.body));
  const legacyTrackFromList = findTrack(projectsList.body, legacyScenario.projectId, legacyScenario.trackId);
  assert.equal(legacyTrackFromList.audioVersions.length, 2);
  assert.equal(Array.isArray(legacyTrackFromList.assets), true);
  assert.equal(legacyTrackFromList.assets.length, 2);
  assert.equal(legacyTrackFromList.assets.filter((asset: any) => asset.isPrimary).length, 1);
  assert.equal("storageKey" in legacyTrackFromList.assets[0], false);

  const legacyProject = await apiJson<any>(`/api/projects/${legacyScenario.projectId}`, { method: "GET" }, ownerJar);
  assert.equal(legacyProject.status, 200, JSON.stringify(legacyProject.body));
  const legacyTrackFromProject = legacyProject.body.tracks.find((track: any) => track.id === legacyScenario.trackId);
  assert.equal(legacyTrackFromProject.assets.length, 2);
  assert.equal(legacyTrackFromProject.audioVersions.length, 2);

  const legacyTrackResponse = await apiJson<any>(`/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(legacyTrackResponse.status, 200, JSON.stringify(legacyTrackResponse.body));
  assert.equal(legacyTrackResponse.body.assets.length, 2);
  assert.equal(legacyTrackResponse.body.assets[0].legacyAudioVersionId, legacyB.id);
  assert.equal(legacyTrackResponse.body.assets[0].streamUrl, `/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}/audio/${legacyB.id}/stream`);

  const emptyTrackResponse = await apiJson<any>(`/api/projects/${emptyScenario.projectId}/tracks/${emptyScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(emptyTrackResponse.status, 200);
  assert.deepEqual(emptyTrackResponse.body.assets, []);

  const mappedTrackResponse = await apiJson<any>(`/api/projects/${mappedScenario.projectId}/tracks/${mappedScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(mappedTrackResponse.body.audioVersions.length, 2);
  assert.equal(mappedTrackResponse.body.assets.length, 2);
  assert.equal(mappedTrackResponse.body.assets.filter((asset: any) => asset.legacyAudioVersionId === mappedA.id).length, 1);
  assert.equal(mappedTrackResponse.body.assets.filter((asset: any) => asset.legacyAudioVersionId === mappedB.id).length, 1);
  assert.equal(mappedTrackResponse.body.assets.filter((asset: any) => asset.isPrimary).length, 1);

  const partialTrackResponse = await apiJson<any>(`/api/projects/${partialScenario.projectId}/tracks/${partialScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(partialTrackResponse.body.audioVersions.length, 2);
  assert.equal(partialTrackResponse.body.assets.length, 2);
  assert.equal(partialTrackResponse.body.assets.filter((asset: any) => asset.legacyAudioVersionId === partialA.id).length, 1);
  assert.equal(partialTrackResponse.body.assets.filter((asset: any) => asset.originalFilename === "partial-b.wav").length, 1);

  const nativeTrackResponse = await apiJson<any>(`/api/projects/${nativeScenario.projectId}/tracks/${nativeScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(nativeTrackResponse.body.assets.length, 1);
  assert.equal(nativeTrackResponse.body.assets[0].streamUrl, null);
  assert.equal(nativeTrackResponse.body.assets[0].downloadUrl, null);
  assert.equal(nativeTrackResponse.body.assets[0].externalUrl, "https://example.com/reference.pdf");

  const statusTrackResponse = await apiJson<any>(`/api/projects/${statusScenario.projectId}/tracks/${statusScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(statusTrackResponse.body.assets.length, 3);
  assert.equal(statusTrackResponse.body.assets.some((asset: any) => asset.status === "DELETED"), false);
  const readyAsset = statusTrackResponse.body.assets.find((asset: any) => asset.status === "READY");
  const uploadingAsset = statusTrackResponse.body.assets.find((asset: any) => asset.status === "UPLOADING");
  const failedAsset = statusTrackResponse.body.assets.find((asset: any) => asset.status === "FAILED");
  assert.ok(readyAsset.streamUrl);
  assert.equal(uploadingAsset.streamUrl, null);
  assert.equal(failedAsset.streamUrl, null);

  const primaryTrackResponse = await apiJson<any>(`/api/projects/${primaryScenario.projectId}/tracks/${primaryScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(primaryTrackResponse.body.assets.filter((asset: any) => asset.isPrimary).length, 1);
  const primaryRowsInDb = await prisma.trackAsset.count({ where: { trackId: primaryScenario.trackId, isPrimary: true } });
  assert.equal(primaryRowsInDb, 2);

  const mismatchTrackResponse = await apiJson<any>(`/api/projects/${mismatchProject.projectId}/tracks/${mismatchProject.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(mismatchTrackResponse.body.assets.length, 0);

  const externalTrackResponse = await apiJson<any>(`/api/projects/${externalScenario.projectId}/tracks/${externalScenario.trackId}`, { method: "GET" }, ownerJar);
  assert.equal(externalTrackResponse.body.assets.length, 1);
  assert.equal(externalTrackResponse.body.assets[0].externalUrl, "https://example.com/external.mp3");
  assert.equal(externalTrackResponse.body.assets[0].streamUrl, null);
  assert.equal(externalTrackResponse.body.assets[0].downloadUrl, null);
  assert.equal(externalTrackResponse.body.assets[0].externalProvider, "other");

  const viewerTrackResponse = await apiJson<any>(`/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}`, { method: "GET" }, viewerJar);
  assert.equal(viewerTrackResponse.status, 200);
  assert.equal(viewerTrackResponse.body.assets.length, 2);

  const editorTrackResponse = await apiJson<any>(`/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}`, { method: "GET" }, editorJar);
  assert.equal(editorTrackResponse.status, 200);
  assert.equal(editorTrackResponse.body.assets.length, 2);

  const outsiderTrackResponse = await apiJson<any>(`/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}`, { method: "GET" }, outsiderJar);
  assert.equal(outsiderTrackResponse.status, 404);

  const anonymousTrackResponse = await apiJson<any>(`/api/projects/${legacyScenario.projectId}/tracks/${legacyScenario.trackId}`, { method: "GET" });
  assert.equal(anonymousTrackResponse.status, 401);
});
