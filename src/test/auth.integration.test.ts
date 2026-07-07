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
const pgContainer = `auth-it-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 56000 + Math.floor(Math.random() * 1000);
const appPort = 57000 + Math.floor(Math.random() * 1000);
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

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "auth-it-uploads-"));

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
      GOOGLE_CLIENT_ID: "dummy-client-id",
      GOOGLE_CLIENT_SECRET: "dummy-client-secret",
      GOOGLE_CALLBACK_URL: `http://127.0.0.1:${appPort}/api/auth/google/callback`,
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

test("auth providers, registration verification and age acknowledgement work end-to-end", async () => {
  const providers = await apiJson<{ googleOAuthEnabled: boolean; publicRegistrationEnabled: boolean }>("/api/auth/providers");
  assert.equal(providers.status, 200);
  assert.equal(providers.body.publicRegistrationEnabled, true);
  assert.equal(providers.body.googleOAuthEnabled, true);

  const registerResponse = await apiJson<{ success: boolean; user: { id: string; emailVerifiedAt: string | null; ageAcknowledgedAt: string | null }; verificationToken: string }>("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "new-user",
      displayName: "New User",
      email: "new@example.com",
      password: "123456789012",
      ageAcknowledged: true,
    }),
  });
  assert.equal(registerResponse.status, 201, JSON.stringify(registerResponse.body));
  assert.equal(registerResponse.body.user.emailVerifiedAt, null);
  assert.match(registerResponse.body.verificationToken, /^[a-f0-9]{64}$/);
  assert.ok(registerResponse.body.user.ageAcknowledgedAt);

  const registerJar = { cookie: readSetCookie(registerResponse.headers) };
  assert.ok(registerJar.cookie.includes("collab.sid="));

  const verifyResponse = await apiJson<{ success: boolean }>("/api/auth/verify-email/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registerResponse.body.verificationToken }),
  }, registerJar);
  assert.equal(verifyResponse.status, 200);
  assert.equal(verifyResponse.body.success, true);

  const meResponse = await apiJson<{ user: { emailVerifiedAt: string | null } }>("/api/auth/me", {}, registerJar);
  assert.equal(meResponse.status, 200);
  assert.ok(meResponse.body.user.emailVerifiedAt);

  const passwordHash = await argon2.hash("123456789012", { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      username: "google-user",
      email: "google@example.com",
      displayName: "Google User",
      passwordHash,
      role: "user",
      emailVerifiedAt: new Date("2026-07-07T00:00:00.000Z"),
      ageAcknowledgedAt: null,
    },
  });

  const loginResponse = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "google-user", password: "123456789012" }),
  });
  assert.equal(loginResponse.status, 200);
  const loginJar = { cookie: readSetCookie(loginResponse.headers) };

  const ackResponse = await apiJson<{ success: boolean; user: { ageAcknowledgedAt: string | null } }>("/api/auth/acknowledge-age", {
    method: "POST",
  }, loginJar);
  assert.equal(ackResponse.status, 200);
  assert.equal(ackResponse.body.success, true);
  assert.ok(ackResponse.body.user.ageAcknowledgedAt);
});
