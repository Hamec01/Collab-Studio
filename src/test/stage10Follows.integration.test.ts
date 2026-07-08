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
const pgContainer = `stage10-follows-pg-${randomBytes(4).toString("hex")}`;
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
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage10-follows-uploads-"));

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

test("follows and unfollows logic between two users, verification of counts and isFollowing", async () => {
  const passwordHash = await argon2.hash("123456789012", { type: argon2.argon2id });
  
  // Create User A (Follower)
  await prisma.user.create({
    data: {
      username: "UserA",
      email: "usera@example.com",
      displayName: "User A",
      passwordHash,
      isPublicProfile: true,
      role: "user",
    },
  });

  // Create User B (Following)
  await prisma.user.create({
    data: {
      username: "UserB",
      email: "userb@example.com",
      displayName: "User B",
      passwordHash,
      isPublicProfile: true,
      role: "user",
    },
  });

  // 1. Unauthenticated gets 404 for follow route or 401
  const anonFollow = await apiJson<{ error: { code: string } }>("/api/profile/users/userb/follow", { method: "POST" });
  assert.equal(anonFollow.status, 401);

  // Login as User A
  const loginResponse = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "usera", password: "123456789012" }),
  });
  assert.equal(loginResponse.status, 200);
  const jarA = { cookie: readSetCookie(loginResponse.headers) };

  // 2. Query initial public profile of User B
  const initialProfile = await apiJson<{ profile: { followersCount: number; followingCount: number; isFollowing: boolean } }>("/api/public/users/UserB");
  assert.equal(initialProfile.status, 200);
  assert.equal(initialProfile.body.profile.followersCount, 0);
  assert.equal(initialProfile.body.profile.followingCount, 0);
  assert.equal(initialProfile.body.profile.isFollowing, false);

  // 3. User A follows User B
  const followResponse = await apiJson<{ status: string }>("/api/profile/users/USERB/follow", { method: "POST" }, jarA);
  assert.equal(followResponse.status, 200);
  assert.equal(followResponse.body.status, "ok");

  // 4. Query public profile of User B authenticated (User A views User B)
  const profileAfterFollowAuth = await apiJson<{ profile: { followersCount: number; followingCount: number; isFollowing: boolean } }>("/api/public/users/userb", {}, jarA);
  assert.equal(profileAfterFollowAuth.status, 200);
  assert.equal(profileAfterFollowAuth.body.profile.followersCount, 1);
  assert.equal(profileAfterFollowAuth.body.profile.followingCount, 0);
  assert.equal(profileAfterFollowAuth.body.profile.isFollowing, true);

  // Anonymous views User B
  const profileAfterFollowAnon = await apiJson<{ profile: { followersCount: number; followingCount: number; isFollowing: boolean } }>("/api/public/users/userb");
  assert.equal(profileAfterFollowAnon.status, 200);
  assert.equal(profileAfterFollowAnon.body.profile.followersCount, 1);
  assert.equal(profileAfterFollowAnon.body.profile.isFollowing, false);

  // 5. Try to follow self (User A follows User A)
  const selfFollow = await apiJson<{ error: { code: string } }>("/api/profile/users/usera/follow", { method: "POST" }, jarA);
  assert.equal(selfFollow.status, 400);
  assert.equal(selfFollow.body.error.code, "CANNOT_FOLLOW_SELF");

  // 6. User A unfollows User B
  const unfollowResponse = await apiJson<{ status: string }>("/api/profile/users/userb/unfollow", { method: "POST" }, jarA);
  assert.equal(unfollowResponse.status, 200);
  assert.equal(unfollowResponse.body.status, "ok");

  // 7. Verify counts after unfollow
  const profileAfterUnfollow = await apiJson<{ profile: { followersCount: number; followingCount: number; isFollowing: boolean } }>("/api/public/users/userb", {}, jarA);
  assert.equal(profileAfterUnfollow.status, 200);
  assert.equal(profileAfterUnfollow.body.profile.followersCount, 0);
  assert.equal(profileAfterUnfollow.body.profile.isFollowing, false);
});
