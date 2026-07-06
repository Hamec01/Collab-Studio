import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import signature from "cookie-signature";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage5b-slice1-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 63000 + Math.floor(Math.random() * 1000);
const appPort = 64000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;
const sessionSecret = "stage5b-annotations-secret-1234567890";

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
      emailVerifiedAt: new Date("2026-07-06T10:00:00.000Z"),
      ageAcknowledgedAt: new Date("2026-07-06T10:00:00.000Z"),
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
  return {
    cookie: `collab.sid=${encodeURIComponent(signed)}`,
  };
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
      UPLOADS_ROOT: path.join(os.tmpdir(), "stage5b-slice1-uploads"),
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  serverProcess.stderr.on("data", (chunk) => { stderr += String(chunk); });
  serverProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(stderr);
    }
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

test("Stage 5B slice 1 binds annotations to TrackAsset and rejects cross-track assets", async () => {
  const owner = await createUser({ username: "owner_stage5b", displayName: "Owner Stage5B" });
  const project = await prisma.project.create({
    data: {
      title: "Stage 5B annotations",
      type: "album",
      members: { create: { userId: owner.id, role: "owner" } },
      tracks: {
        create: [
          { title: "Track A", lyrics: "", lyricsPlainText: "", lyricsRevision: 0, lyricsDocument: { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "" }] }] }, tags: [] },
          { title: "Track B", lyrics: "", lyricsPlainText: "", lyricsRevision: 0, lyricsDocument: { schemaVersion: 1, blocks: [{ id: "paragraph_002", type: "paragraph", children: [{ text: "" }] }] }, tags: [] },
        ],
      },
    },
    include: { tracks: { orderBy: { createdAt: "asc" } } },
  });

  const trackA = project.tracks[0];
  const trackB = project.tracks[1];

  const assetA = await prisma.trackAsset.create({
    data: {
      trackId: trackA.id,
      projectId: project.id,
      uploadedByUserId: owner.id,
      kind: "AUDIO_VERSION",
      status: "READY",
      originalFilename: "track-a.wav",
      storageProvider: "local",
      mimeType: "audio/wav",
      sizeBytes: 128,
      durationMs: 12000,
      versionNumber: 1,
      isPrimary: true,
    },
  });

  const assetB = await prisma.trackAsset.create({
    data: {
      trackId: trackB.id,
      projectId: project.id,
      uploadedByUserId: owner.id,
      kind: "AUDIO_VERSION",
      status: "READY",
      originalFilename: "track-b.wav",
      storageProvider: "local",
      mimeType: "audio/wav",
      sizeBytes: 128,
      durationMs: 12000,
      versionNumber: 1,
      isPrimary: true,
    },
  });

  const jar = await createSession(owner.id);

  const createResponse = await apiJson<{ id: string; trackAssetId: string | null }>(
    `/api/projects/${project.id}/tracks/${trackA.id}/annotations`,
    {
      method: "POST",
      body: JSON.stringify({
        timestampSeconds: 17,
        text: "Asset-bound note",
        trackAssetId: assetA.id,
      }),
    },
    jar,
  );
  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.trackAssetId, assetA.id);

  const stored = await prisma.annotation.findUniqueOrThrow({ where: { id: createResponse.body.id } });
  assert.equal(stored.trackAssetId, assetA.id);

  const trackResponse = await apiJson<{ annotations: Array<{ id: string; trackAssetId: string | null; text: string }> }>(
    `/api/projects/${project.id}/tracks/${trackA.id}`,
    {},
    jar,
  );
  assert.equal(trackResponse.status, 200);
  assert.deepEqual(trackResponse.body.annotations.map((annotation) => ({ id: annotation.id, trackAssetId: annotation.trackAssetId, text: annotation.text })), [
    { id: createResponse.body.id, trackAssetId: assetA.id, text: "Asset-bound note" },
  ]);

  const rejectResponse = await apiJson<{ error: { code: string } }>(
    `/api/projects/${project.id}/tracks/${trackA.id}/annotations`,
    {
      method: "POST",
      body: JSON.stringify({
        timestampSeconds: 18,
        text: "Wrong asset",
        trackAssetId: assetB.id,
      }),
    },
    jar,
  );
  assert.equal(rejectResponse.status, 404);
  assert.equal(rejectResponse.body.error.code, "TRACK_ASSET_NOT_FOUND");
  assert.equal(await prisma.annotation.count({ where: { text: "Wrong asset" } }), 0);
});
