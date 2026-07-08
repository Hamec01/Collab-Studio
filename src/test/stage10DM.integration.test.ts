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
const pgContainer = `stage10-dm-pg-${randomBytes(4).toString("hex")}`;
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
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage10-dm-uploads-"));

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

test("DM system: request flow, auth gates, blocking, accept/reject, messaging", async () => {
  const passwordHash = await argon2.hash("123456789012", { type: argon2.argon2id });

  // Seed users
  const userA = await prisma.user.create({
    data: {
      username: "UserA",
      email: "usera@dm.example.com",
      displayName: "User A",
      passwordHash,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const userB = await prisma.user.create({
    data: {
      username: "UserB",
      email: "userb@dm.example.com",
      displayName: "User B",
      passwordHash,
      emailVerifiedAt: null, // initially unverified
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  const userC = await prisma.user.create({
    data: {
      username: "UserC",
      email: "userc@dm.example.com",
      displayName: "User C",
      passwordHash,
      emailVerifiedAt: new Date(),
      ageAcknowledgedAt: new Date(),
      role: "user",
    },
  });

  // Logins
  const loginA = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "usera", password: "123456789012" }),
  });
  const jarA = { cookie: readSetCookie(loginA.headers) };

  const loginB = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "userb", password: "123456789012" }),
  });
  const jarB = { cookie: readSetCookie(loginB.headers) };

  const loginC = await apiJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "userc", password: "123456789012" }),
  });
  const jarC = { cookie: readSetCookie(loginC.headers) };

  // 1. Anonymous cannot send DM → 401
  const anonSend = await apiJson<{ error: { code: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserB", text: "Hello from guest" }),
  });
  assert.equal(anonSend.status, 401);

  // 2. Unverified UserB cannot send DM → 403 EMAIL_VERIFICATION_REQUIRED
  const unverifiedSend = await apiJson<{ error: { code: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserA", text: "Hello from unverified" }),
  }, jarB);
  assert.equal(unverifiedSend.status, 403);
  assert.equal(unverifiedSend.body.error.code, "EMAIL_VERIFICATION_REQUIRED");

  // Verify UserB
  await prisma.user.update({ where: { id: userB.id }, data: { emailVerifiedAt: new Date() } });

  // 3. Verified UserA sends DM request to UserB → 200
  const sendResult = await apiJson<{ request: { id: string; status: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserB", text: "Hey UserB, let's collaborate!" }),
  }, jarA);
  assert.equal(sendResult.status, 200);
  assert.equal(sendResult.body.request.status, "PENDING");
  const requestId = sendResult.body.request.id;

  // 4. Sending a second request to same user → 409 DUPLICATE_REQUEST
  const dupSend = await apiJson<{ error: { code: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserB", text: "Duplicate request" }),
  }, jarA);
  assert.equal(dupSend.status, 409);
  assert.equal(dupSend.body.error.code, "DUPLICATE_REQUEST");

  // 5. Cannot send DM to self → 400 CANNOT_DM_SELF
  const selfSend = await apiJson<{ error: { code: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserA", text: "Hi myself" }),
  }, jarA);
  assert.equal(selfSend.status, 400);
  assert.equal(selfSend.body.error.code, "CANNOT_DM_SELF");

  // 6. UserB lists incoming requests → sees request from UserA
  const incomingRequests = await apiJson<{ requests: Array<{ id: string; status: string }> }>("/api/dm/requests", {}, jarB);
  assert.equal(incomingRequests.status, 200);
  assert.ok(incomingRequests.body.requests.some((r) => r.id === requestId));

  // 7. Cannot send message before acceptance → 403 CONVERSATION_NOT_OPEN
  const prematureMsg = await apiJson<{ error: { code: string } }>(`/api/dm/conversations/${requestId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Premature message" }),
  }, jarA);
  assert.equal(prematureMsg.status, 403);
  assert.equal(prematureMsg.body.error.code, "CONVERSATION_NOT_OPEN");

  // 8. UserB accepts DM request → 200, status becomes ACCEPTED
  const acceptResult = await apiJson<{ request: { id: string; status: string } }>(`/api/dm/requests/${requestId}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  }, jarB);
  assert.equal(acceptResult.status, 200);
  assert.equal(acceptResult.body.request.status, "ACCEPTED");

  // 9. UserA can now send message → 200
  const sendMsg = await apiJson<{ message: { id: string; text: string } }>(`/api/dm/conversations/${requestId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Great to connect!" }),
  }, jarA);
  assert.equal(sendMsg.status, 200);
  assert.equal(sendMsg.body.message.text, "Great to connect!");

  // 10. UserB replies → 200
  const replyMsg = await apiJson<{ message: { id: string; text: string } }>(`/api/dm/conversations/${requestId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Welcome!" }),
  }, jarB);
  assert.equal(replyMsg.status, 200);

  // 11. List messages → 2 messages
  const msgs = await apiJson<{ messages: Array<{ id: string; text: string }> }>(`/api/dm/conversations/${requestId}/messages`, {}, jarA);
  assert.equal(msgs.status, 200);
  assert.equal(msgs.body.messages.length, 2);

  // 12. UserC cannot access UserA/B's conversation → 403 NOT_PARTICIPANT
  const outsiderMsg = await apiJson<{ error: { code: string } }>(`/api/dm/conversations/${requestId}/messages`, {}, jarC);
  assert.equal(outsiderMsg.status, 403);
  assert.equal(outsiderMsg.body.error.code, "NOT_PARTICIPANT");

  // 13. UserC sends DM to UserA, but UserA blocks → blocked future request
  const cToA = await apiJson<{ request: { id: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserA", text: "Hi from C!" }),
  }, jarC);
  assert.equal(cToA.status, 200);

  // UserA blocks UserC's DM request
  const blockCResult = await apiJson<{ request: { status: string } }>(`/api/dm/requests/${cToA.body.request.id}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "block" }),
  }, jarA);
  assert.equal(blockCResult.status, 200);
  assert.equal(blockCResult.body.request.status, "BLOCKED");

  // UserC tries to send another DM to UserA → 403 USER_BLOCKED
  const cBlockedSend = await apiJson<{ error: { code: string } }>("/api/dm/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: "UserA", text: "Trying again" }),
  }, jarC);
  assert.equal(cBlockedSend.status, 403);
  assert.equal(cBlockedSend.body.error.code, "USER_BLOCKED");

  // 14. UserA lists conversations → sees UserB conversation
  const convos = await apiJson<{ conversations: Array<{ id: string }> }>("/api/dm/conversations", {}, jarA);
  assert.equal(convos.status, 200);
  assert.ok(convos.body.conversations.some((c) => c.id === requestId));

  // Suppress unused variable warnings
  void userA;
  void userB;
  void userC;
});
