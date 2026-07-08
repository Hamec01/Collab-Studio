import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage9-work-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 58100 + Math.floor(Math.random() * 1000);
const appPort = 59100 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

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

async function apiJson<T>(pathname: string, options: RequestInit = {}, jar?: CookieJar) {
  const headers = new Headers(options.headers ?? {});
  if (jar?.cookie) headers.set("cookie", jar.cookie);
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, { ...options, headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as T : null as T,
    headers: response.headers,
  };
}

function readSetCookie(headers: Headers) {
  const setCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return setCookie.map((entry) => entry.split(";")[0]).join("; ");
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage9-work-uploads-"));

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
      ALLOW_PUBLIC_REGISTRATION: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  serverProcess.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
  serverProcess.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });

  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/api/ready`);
  } catch {
    serverProcess?.kill("SIGTERM");
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

test("work publication snapshots current lyrics, serves public audio and archives cleanly", async () => {
  const ownerPassword = "123456789012";
  const passwordHash = await argon2.hash(ownerPassword, { type: argon2.argon2id });
  const owner = await prisma.user.create({
    data: {
      username: "publisher",
      email: "publisher@example.com",
      displayName: "Publisher",
      passwordHash,
      isPublicProfile: true,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const projectId = randomUUID();
  const trackId = randomUUID();
  const assetId = randomUUID();
  await prisma.project.create({
    data: {
      id: projectId,
      title: "Public Release",
      type: "single",
      members: {
        create: {
          userId: owner.id,
          role: "owner",
          capabilityPreset: "owner",
        },
      },
      tracks: {
        create: {
          id: trackId,
          title: "Neon Lights",
          lyrics: "first version",
          lyricVersions: {
            create: {
              authorId: owner.id,
              label: "Original",
              isOriginal: true,
              lyrics: "first version",
            },
          },
          trackAssets: {
            create: {
              id: assetId,
              projectId,
              uploadedByUserId: owner.id,
              kind: "AUDIO_VERSION",
              status: "READY",
              title: "Primary mix",
              originalFilename: "neon-lights.wav",
              storageKey: `${projectId}/${trackId}/neon-lights.wav`,
              storageProvider: "local",
              mimeType: "audio/wav",
              sizeBytes: 8,
              durationMs: 1200,
              versionNumber: 1,
              isPrimary: true,
              metadata: {},
            },
          },
        },
      },
    },
  });

  const audioDir = path.join(uploadsDir, projectId, trackId);
  await mkdir(audioDir, { recursive: true });
  const audioBytes = Buffer.from("WAVEDEMO");
  await writeFile(path.join(audioDir, "neon-lights.wav"), audioBytes);

  const loginResponse = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "publisher", password: ownerPassword }),
  });
  assert.equal(loginResponse.status, 200);
  const jar = { cookie: readSetCookie(loginResponse.headers) };

  const createResponse = await apiJson<{ publication: { slug: string; snapshotId: string; projectId: string } }>("/api/publications/collabs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      trackId,
      title: "Neon Lights Public",
      description: "Public snapshot description",
      tags: ["pop", "night"],
      language: "ru",
      budget: "$500",
      terms: "Split 50/50",
      rolesNeeded: ["Vocalist", "Producer"],
    }),
  }, jar);
  assert.equal(createResponse.status, 201);
  const slug = createResponse.body.publication.slug;

  await prisma.track.update({
    where: { id: trackId },
    data: { lyrics: "changed after publish", lyricsPlainText: null, lyricsDocument: null },
  });
  await prisma.lyricVersion.create({
    data: {
      trackId,
      authorId: owner.id,
      label: "Second",
      lyrics: "changed after publish",
    },
  });

  const publicResponse = await apiJson<{ work: Record<string, unknown>; collab: Record<string, unknown> }>(`/api/public/collabs/${slug}`);
  assert.equal(publicResponse.status, 200);
  const work = publicResponse.body.collab as {
    title: string;
    description: string | null;
    tags: string[];
    author: { username: string | null; publicProfileUrl: string | null };
    lyrics: { plainText: string } | null;
    audio: { streamUrl: string; downloadUrl: string } | null;
    collabDetails: { budget: string; terms: string; rolesNeeded: string[] } | null;
    expiresAt: string | null;
  };
  assert.equal(work.title, "Neon Lights Public");
  assert.equal(work.description, "Public snapshot description");
  assert.deepEqual(work.tags, ["pop", "night"]);
  assert.equal(work.author.username, "publisher");
  assert.equal(work.author.publicProfileUrl, "/u/publisher");
  assert.equal(work.lyrics?.plainText, "first version");
  assert.equal(work.collabDetails?.budget, "$500");
  assert.equal(work.collabDetails?.terms, "Split 50/50");
  assert.deepEqual(work.collabDetails?.rolesNeeded, ["Vocalist", "Producer"]);
  assert.ok(work.expiresAt);
  assert.equal(work.audio?.streamUrl, `/api/public/collabs/${slug}/stream`);
  assert.equal(work.audio?.downloadUrl, `/api/public/collabs/${slug}/download`);
  assert.equal("projectId" in publicResponse.body.collab, false);
  assert.equal("trackId" in publicResponse.body.collab, false);
  assert.equal("snapshotId" in publicResponse.body.collab, false);

  const streamResponse = await fetch(`http://127.0.0.1:${appPort}/api/public/collabs/${slug}/stream`);
  assert.equal(streamResponse.status, 200);
  assert.equal(streamResponse.headers.get("content-type"), "audio/wav");
  assert.equal(Buffer.from(await streamResponse.arrayBuffer()).toString("utf8"), audioBytes.toString("utf8"));

  const rangeResponse = await fetch(`http://127.0.0.1:${appPort}/api/public/collabs/${slug}/stream`, {
    headers: { range: "bytes=0-3" },
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-3/${audioBytes.length}`);
  assert.equal(Buffer.from(await rangeResponse.arrayBuffer()).toString("utf8"), audioBytes.subarray(0, 4).toString("utf8"));

  const publicationRecord = await prisma.publication.findFirstOrThrow({ where: { slug }, select: { id: true } });
  const archiveViaApi = await apiJson<{ publication: { status: string } }>(`/api/publications/${publicationRecord.id}/archive`, {
    method: "POST",
  }, jar);
  assert.equal(archiveViaApi.status, 200);
  assert.equal(archiveViaApi.body.publication.status, "ARCHIVED");

  const hiddenAfterArchive = await apiJson<{ error: { code: string } }>(`/api/public/collabs/${slug}`);
  assert.equal(hiddenAfterArchive.status, 404);
  assert.equal(hiddenAfterArchive.body.error.code, "PUBLICATION_NOT_FOUND");
});

test("outsider cannot create a publication for a foreign project", async () => {
  const outsiderPassword = "123456789012";
  const passwordHash = await argon2.hash(outsiderPassword, { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      username: "outsider",
      email: "outsider@example.com",
      displayName: "Outsider",
      passwordHash,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const loginResponse = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "outsider", password: outsiderPassword }),
  });
  assert.equal(loginResponse.status, 200);
  const jar = { cookie: readSetCookie(loginResponse.headers) };

  const ownerProject = await prisma.project.findFirstOrThrow({
    where: { title: "Public Release" },
    include: { tracks: { take: 1 } },
  });

  const denied = await apiJson<{ error: { code: string } }>("/api/publications/collabs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: ownerProject.id,
      trackId: ownerProject.tracks[0]!.id,
      title: "Should fail",
    }),
  }, jar);

  assert.ok(denied.status === 403 || denied.status === 404);
  const total = await prisma.publication.count();
  assert.equal(total, 1);
});
