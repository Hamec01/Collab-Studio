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
const pgContainer = `stage9-profile-pg-${randomBytes(4).toString("hex")}`;
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
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage9-profile-uploads-"));

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

test("public profile opt-in stays private until enabled and never leaks private fields", async () => {
  const passwordHash = await argon2.hash("123456789012", { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      username: "Hamilio",
      email: "hamilio@example.com",
      displayName: "Hamilio",
      passwordHash,
      role: "user",
    },
  });

  const beforeOptIn = await apiJson<{ error: { code: string } }>("/api/public/users/hamilio");
  assert.equal(beforeOptIn.status, 404);
  assert.equal(beforeOptIn.body.error.code, "PUBLIC_PROFILE_NOT_FOUND");

  const loginResponse = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "hamilio", password: "123456789012" }),
  });
  assert.equal(loginResponse.status, 200);
  const jar = { cookie: readSetCookie(loginResponse.headers) };

  const invalidWebsite = await apiJson<{ error: { code: string } }>("/api/profile/me", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Hamilio",
      isPublicProfile: true,
      bio: "",
      location: "",
      website: "javascript:alert(1)",
    }),
  }, jar);
  assert.equal(invalidWebsite.status, 400);

  const updateResponse = await apiJson<{ user: { isPublicProfile: boolean; bio: string | null; location: string | null; website: string | null } }>("/api/profile/me", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Hamilio Public",
      isPublicProfile: true,
      bio: "Пишу и продюсирую.",
      location: "Berlin",
      website: "https://example.com",
    }),
  }, jar);
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.user.isPublicProfile, true);

  const meResponse = await apiJson<{ user: { email: string | null; isPublicProfile: boolean; bio: string | null } }>("/api/profile/me", {}, jar);
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.body.user.email, "hamilio@example.com");
  assert.equal(meResponse.body.user.isPublicProfile, true);

  const publicResponse = await apiJson<Record<string, unknown>>("/api/public/users/HAMILIO");
  assert.equal(publicResponse.status, 200);
  const profile = (publicResponse.body as { profile: Record<string, unknown> }).profile;
  assert.equal(profile.username, "Hamilio");
  assert.equal(profile.displayName, "Hamilio Public");
  assert.equal(profile.bio, "Пишу и продюсирую.");
  assert.equal(profile.location, "Berlin");
  assert.equal(profile.website, "https://example.com");
  assert.equal("email" in profile, false);
  assert.equal("role" in profile, false);
  assert.equal("emailVerifiedAt" in profile, false);
  assert.equal("ageAcknowledgedAt" in profile, false);
});
