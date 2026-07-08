import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(process.cwd());
const pgContainer = `stage10-comments-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 58000 + Math.floor(Math.random() * 1000);
const appPort = 59000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

type CookieJar = { cookie: string };
type JsonResponse<T> = { status: number; body: T; headers: Headers };

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

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage10-comments-uploads-"));

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

test("public comments threads, user blocking, content reporting and moderation gates", async () => {
  const passwordHash = await argon2.hash("123456789012", { type: argon2.argon2id });

  // 1. Seed users
  const userA = await prisma.user.create({
    data: {
      username: "UserA",
      email: "usera@example.com",
      displayName: "User A",
      passwordHash,
      isPublicProfile: true,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const userB = await prisma.user.create({
    data: {
      username: "UserB",
      email: "userb@example.com",
      displayName: "User B",
      passwordHash,
      isPublicProfile: true,
      emailVerifiedAt: null, // UserB is unverified initially
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      username: "AdminUser",
      email: "admin@example.com",
      displayName: "Admin User",
      passwordHash,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "admin",
    },
  });

  // Logins
  const loginResponseA = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "usera", password: "123456789012" }),
  });
  const jarA = { cookie: readSetCookie(loginResponseA.headers) };

  const loginResponseB = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "userb", password: "123456789012" }),
  });
  const jarB = { cookie: readSetCookie(loginResponseB.headers) };

  const loginResponseAdmin = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "adminuser", password: "123456789012" }),
  });
  const jarAdmin = { cookie: readSetCookie(loginResponseAdmin.headers) };

  // 2. Create Project, Track, Asset, and Publication
  const project = await prisma.project.create({
    data: {
      title: "Project A",
      type: "single",
      members: {
        create: {
          userId: userA.id,
          role: "owner",
          capabilityPreset: "owner",
        },
      },
    },
  });
  const track = await prisma.track.create({
    data: { title: "Track A", projectId: project.id },
  });
  const asset = await prisma.trackAsset.create({
    data: {
      trackId: track.id,
      projectId: project.id,
      uploadedByUserId: userA.id,
      storageKey: "some-key.mp3",
      originalFilename: "track.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      durationMs: 10000,
      kind: "AUDIO_VERSION",
      isPrimary: true,
    },
  });

  const lyricVersion = await prisma.lyricVersion.create({
    data: {
      trackId: track.id,
      authorId: userA.id,
      label: "Original",
      isOriginal: true,
      lyrics: "Song lyrics",
    },
  });

  const pubCreateResponse = await apiJson<{ publication: { id: string; slug: string } }>("/api/publications/works", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      trackId: track.id,
      title: "My Public Work",
      description: "Hello description",
      tags: ["pop"],
      language: "ru",
    }),
  }, jarA);

  assert.equal(pubCreateResponse.status, 201);
  const publication = pubCreateResponse.body.publication;

  // 3. Commenting Permissions Verification
  // Anon returns 401
  const anonPost = await apiJson<{ error: { code: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello from guest" }),
  });
  assert.equal(anonPost.status, 401);

  // Unverified UserB returns 403 (EMAIL_VERIFICATION_REQUIRED)
  const unverifiedPost = await apiJson<{ error: { code: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello from unverified B" }),
  }, jarB);
  assert.equal(unverifiedPost.status, 403);
  assert.equal(unverifiedPost.body.error.code, "EMAIL_VERIFICATION_REQUIRED");

  // Verify UserB
  await prisma.user.update({
    where: { id: userB.id },
    data: { emailVerifiedAt: new Date() },
  });

  // Now UserB is verified and should succeed
  const verifiedPostB = await apiJson<{ comment: { text: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello from verified B" }),
  }, jarB);
  assert.equal(verifiedPostB.status, 200);
  assert.equal(verifiedPostB.body.comment.text, "Hello from verified B");

  // UserA posts a comment
  const verifiedPostA = await apiJson<{ comment: { id: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello from verified A" }),
  }, jarA);
  assert.equal(verifiedPostA.status, 200);

  // 4. Closed comments thread check
  // Close comments by UserA
  const closeResponse = await apiJson<{ success: boolean }>(`/api/publications/${publication.slug}/comments/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ closed: true }),
  }, jarA);
  assert.equal(closeResponse.status, 200);

  // User B tries to post on closed thread, returns 403 (COMMENTS_CLOSED)
  const closedPost = await apiJson<{ error: { code: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Blocked post on closed thread" }),
  }, jarB);
  assert.equal(closedPost.status, 403);
  assert.equal(closedPost.body.error.code, "COMMENTS_CLOSED");

  // Re-open comments
  await apiJson<{ success: boolean }>(`/api/publications/${publication.slug}/comments/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ closed: false }),
  }, jarA);

  // 5. User blocking check
  // User A blocks User B
  const blockResponse = await apiJson<{ success: boolean }>(`/api/users/userb/block`, { method: "POST" }, jarA);
  assert.equal(blockResponse.status, 200);

  // User B tries to comment under User A's publication, returns 403 (USER_BLOCKED)
  const blockedPostComment = await apiJson<{ error: { code: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello post after blocked" }),
  }, jarB);
  assert.equal(blockedPostComment.status, 403);
  assert.equal(blockedPostComment.body.error.code, "USER_BLOCKED");

  // Unblock User B
  await apiJson<{ success: boolean }>(`/api/users/userb/unblock`, { method: "POST" }, jarA);

  // 6. Comment hiding check
  // User B comments again (now unblocked)
  const newCommentB = await apiJson<{ comment: { id: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "New comment B to hide" }),
  }, jarB);
  assert.equal(newCommentB.status, 200);

  // User A hides User B's comment
  const hideResponse = await apiJson<{ comment: { isHidden: boolean } }>(`/api/comments/${newCommentB.body.comment.id}/hide`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hidden: true }),
  }, jarA);
  assert.equal(hideResponse.status, 200);
  assert.equal(hideResponse.body.comment.isHidden, true);

  // Verify that User B cannot see the hidden comment in GET comments list
  const listCommentsB = await apiJson<{ comments: Array<{ id: string; text: string }> }>(`/api/publications/${publication.slug}/comments`, {}, jarB);
  assert.equal(listCommentsB.status, 200);
  assert.equal(listCommentsB.body.comments.some(c => c.id === newCommentB.body.comment.id), false);

  // Verify that User A (author) CAN see the hidden comment in list
  const listCommentsA = await apiJson<{ comments: Array<{ id: string; text: string; isHidden: boolean }> }>(`/api/publications/${publication.slug}/comments`, {}, jarA);
  assert.equal(listCommentsA.status, 200);
  const foundComment = listCommentsA.body.comments.find(c => c.id === newCommentB.body.comment.id);
  assert.ok(foundComment);
  assert.equal(foundComment.isHidden, true);

  // 7. Content reporting and admin moderation
  // User B reports User A's comment
  const reportResponse = await apiJson<{ report: { id: string } }>("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contentType: "COMMENT",
      contentId: verifiedPostA.body.comment.id,
      reason: "Harassment and inappropriate language",
    }),
  }, jarB);
  assert.equal(reportResponse.status, 200);
  assert.ok(reportResponse.body.report.id);

  // Admin lists pending reports
  const adminReports = await apiJson<{ reports: Array<{ id: string; reason: string }> }>("/api/admin/reports", {}, jarAdmin);
  assert.equal(adminReports.status, 200);
  assert.ok(adminReports.body.reports.some(r => r.id === reportResponse.body.report.id));

  // Admin suspends User A based on report
  const resolveResponse = await apiJson<{ success: boolean }>(`/api/admin/reports/${reportResponse.body.report.id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "SUSPEND_USER",
      resolution: "Suspended for toxic comments",
    }),
  }, jarAdmin);
  assert.equal(resolveResponse.status, 200);

  // Suspended User A tries to comment, returns 403 (USER_SUSPENDED_OR_BANNED)
  const suspendedPost = await apiJson<{ error: { code: string } }>(`/api/publications/${publication.slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Post from suspended User A" }),
  }, jarA);
  assert.equal(suspendedPost.status, 403);
  assert.equal(suspendedPost.body.error.code, "USER_SUSPENDED_OR_BANNED");
});
