import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import signature from "cookie-signature";
import { PrismaClient } from "@prisma/client";
import { createAudioVersionWithTrackAsset } from "../server/services/audioVersions";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage6-activity-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 65000 + Math.floor(Math.random() * 200);
const appPort = 65250 + Math.floor(Math.random() * 200);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;
const sessionSecret = "stage6-activity-secret-1234567890";

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;

type CookieJar = { cookie: string };

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

async function apiJson<T>(pathname: string, options: RequestInit = {}, jar?: CookieJar): Promise<{ status: number; body: T; headers: Headers }> {
  const headers = new Headers(options.headers ?? {});
  if (jar?.cookie) headers.set("cookie", jar.cookie);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, { ...options, headers });
  return {
    status: response.status,
    body: await response.json() as T,
    headers: response.headers,
  };
}

async function createUser(input: { username: string; displayName: string }) {
  const password = `${input.username}-pw`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.create({
    data: {
      username: input.username,
      email: `${input.username}@example.invalid`,
      displayName: input.displayName,
      passwordHash,
      role: "user",
      emailVerifiedAt: new Date("2026-07-07T10:00:00.000Z"),
      ageAcknowledgedAt: new Date("2026-07-07T10:00:00.000Z"),
    },
  }).then((user) => ({ id: user.id, username: user.username, password, displayName: user.displayName }));
}

async function createSession(userId: string): Promise<CookieJar> {
  const sid = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await prisma.session.create({
    data: {
      sid,
      expire: expiresAt,
      sess: {
        cookie: {
          originalMaxAge: 1000 * 60 * 60 * 24 * 14,
          expires: expiresAt.toISOString(),
          secure: false,
          httpOnly: true,
          path: "/",
          sameSite: "lax",
        },
        userId,
      },
    },
  });

  const signed = `s:${signature.sign(sid, sessionSecret)}`;
  return { cookie: `collab.sid=${encodeURIComponent(signed)}` };
}

before(async () => {
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
      SESSION_SECRET: sessionSecret,
      UPLOADS_ROOT: path.join(os.tmpdir(), `stage6-activity-uploads-${randomBytes(4).toString("hex")}`),
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForHttp(`http://127.0.0.1:${appPort}/api/ready`);
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await prisma?.$disconnect();
  await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
});

test("Stage 6 activity feed serializes recent project events for members", async () => {
  const owner = await createUser({ username: "stage6_owner", displayName: "Owner Stage6" });
  const viewer = await createUser({ username: "stage6_viewer", displayName: "Viewer Stage6" });
  const outsider = await createUser({ username: "stage6_outsider", displayName: "Outsider Stage6" });

  const project = await prisma.project.create({
    data: {
      title: "Stage 6 Activity",
      type: "album",
      members: {
        create: [
          { userId: owner.id, role: "owner" },
          { userId: viewer.id, role: "viewer" },
        ],
      },
      tracks: {
        create: [{ title: "Track A", lyrics: "", lyricsRevision: 0, tags: [] }],
      },
    },
    include: { tracks: true },
  });

  const track = project.tracks[0];
  const ownerJar = await createSession(owner.id);
  const viewerJar = await createSession(viewer.id);
  const outsiderJar = await createSession(outsider.id);

  const commentResponse = await apiJson<any>(`/api/projects/${project.id}/tracks/${track.id}/comments`, {
    method: "POST",
    body: JSON.stringify({ text: "Need a tighter intro", lineIndex: 2 }),
  }, ownerJar);
  assert.equal(commentResponse.status, 201);

  const projectChatResponse = await apiJson<any>(`/api/projects/${project.id}/chat`, {
    method: "POST",
    body: JSON.stringify({ text: "Let's align on tomorrow's review" }),
  }, ownerJar);
  assert.equal(projectChatResponse.status, 201);

  const taskResponse = await apiJson<any>(`/api/projects/${project.id}/tracks/${track.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "Bounce alt mix" }),
  }, ownerJar);
  assert.equal(taskResponse.status, 201);

  await createAudioVersionWithTrackAsset(prisma, {
    projectId: project.id,
    trackId: track.id,
    uploadedById: owner.id,
    actorName: owner.displayName,
    originalFilename: "reference.wav",
    isExternal: true,
    externalUrl: "https://example.com/reference.wav",
    externalProvider: "other",
  });

  const getProjectResponse = await apiJson<any>(`/api/projects/${project.id}`, { method: "GET" }, ownerJar);
  assert.equal(getProjectResponse.status, 200, JSON.stringify(getProjectResponse.body));
  assert.equal(Array.isArray(getProjectResponse.body.activity), true);
  assert.deepEqual(
    getProjectResponse.body.activity.map((event: any) => event.type),
    ["audio_uploaded", "track_task_created", "project_chat_message_created", "comment_created"],
  );
  assert.equal(getProjectResponse.body.activity[0].payload.trackTitle, "Track A");
  assert.equal(getProjectResponse.body.activity[0].payload.originalFilename, "reference.wav");
  assert.equal(getProjectResponse.body.activity[3].payload.lineIndex, 2);

  const listProjectsResponse = await apiJson<any[]>("/api/projects", { method: "GET" }, viewerJar);
  assert.equal(listProjectsResponse.status, 200);
  assert.equal(listProjectsResponse.body[0].activity.length, 4);

  const outsiderResponse = await apiJson<any>(`/api/projects/${project.id}`, { method: "GET" }, outsiderJar);
  assert.notEqual(outsiderResponse.status, 200);
});

test("Stage 6 activity feed returns latest 20 events in deterministic order", async () => {
  const owner = await createUser({ username: "stage6_limit_owner", displayName: "Limit Owner" });
  const project = await prisma.project.create({
    data: {
      title: "Stage 6 Activity Limit",
      type: "album",
      members: { create: { userId: owner.id, role: "owner" } },
      tracks: { create: [{ title: "Track B", lyrics: "", lyricsRevision: 0, tags: [] }] },
    },
  });
  const ownerJar = await createSession(owner.id);

  await prisma.activityEvent.createMany({
    data: Array.from({ length: 22 }, (_, index) => ({
      projectId: project.id,
      actorId: owner.id,
      type: `event_${index}`,
      payload: { ordinal: index },
      createdAt: new Date(Date.UTC(2026, 6, 7, 12, index, 0)),
    })),
  });

  const response = await apiJson<any>(`/api/projects/${project.id}`, { method: "GET" }, ownerJar);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.activity.length, 20);
  assert.equal(response.body.activity[0].type, "event_21");
  assert.equal(response.body.activity[19].type, "event_2");
});
