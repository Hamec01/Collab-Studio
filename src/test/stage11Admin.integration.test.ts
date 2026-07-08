import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import argon2 from "argon2";
import * as cookie from "cookie";
import signature from "cookie-signature";

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn>;
let appPort: number;

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
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

async function createAuthCookie(email: string, sessionSecret: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const sid = crypto.randomBytes(16).toString("hex");
  const sess = {
    cookie: { originalMaxAge: 2592000000, expires: new Date(Date.now() + 2592000000).toISOString(), secure: false, httpOnly: true, path: "/" },
    userId: user.id
  };
  
  await prisma.$executeRaw`
    INSERT INTO "session" ("sid", "sess", "expire") 
    VALUES (${sid}, ${JSON.stringify(sess)}::json, NOW() + INTERVAL '30 days')
  `;
  
  const signed = "s:" + signature.sign(sid, sessionSecret);
  return cookie.serialize("collab.sid", signed, { path: "/", httpOnly: true });
}

describe("Stage 11 Slice 2: Admin Panel", async () => {
  const pgContainer = `stage11-admin-pg-${crypto.randomBytes(4).toString("hex")}`;
  const pgPassword = `pw_${crypto.randomBytes(8).toString("hex")}`;
  const pgDatabase = `db_${crypto.randomBytes(6).toString("hex")}`;
  const pgPort = 58000 + Math.floor(Math.random() * 1000);
  const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;
  const sessionSecret = crypto.randomBytes(32).toString("hex");
  
  before(async () => {
    appPort = 59000 + Math.floor(Math.random() * 1000);
    const projectRoot = path.join(process.cwd());

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
        SESSION_SECRET: sessionSecret,
      },
    });

    await waitForHttp(`http://127.0.0.1:${appPort}/api/ready`);
  });

  after(async () => {
    await prisma.$disconnect();
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => serverProcess.once("close", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (!serverProcess.killed) serverProcess.kill("SIGKILL");
    }
    await runCommand("docker", ["rm", "-f", pgContainer]).catch(() => undefined);
  });

  it("should deny access to regular users", async () => {
    const passwordHash = await argon2.hash("test", { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        username: "user11",
        email: "user11@test.com",
        displayName: "User 11",
        passwordHash,
        role: "user",
      }
    });

    const sessionCookie = await createAuthCookie("user11@test.com", sessionSecret);

    const res = await fetch(`http://127.0.0.1:${appPort}/api/admin/users`, {
      headers: { Cookie: sessionCookie },
    });

    assert.equal(res.status, 403);
  });

  it("should allow access to admin users and return stats", async () => {
    const passwordHash = await argon2.hash("test", { type: argon2.argon2id });
    const admin = await prisma.user.create({
      data: {
        username: "admin11",
        email: "admin11@test.com",
        displayName: "Admin 11",
        passwordHash,
        role: "admin",
      }
    });

    const sessionCookie = await createAuthCookie("admin11@test.com", sessionSecret);

    const res = await fetch(`http://127.0.0.1:${appPort}/api/admin/stats`, {
      headers: { Cookie: sessionCookie },
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.stats);
    assert.ok(typeof data.stats.totalUsers === "number");
  });

  it("should suspend a user", async () => {
    const sessionCookie = await createAuthCookie("admin11@test.com", sessionSecret);
    const userToSuspend = await prisma.user.findUniqueOrThrow({ where: { email: "user11@test.com" } });

    const res = await fetch(`http://127.0.0.1:${appPort}/api/admin/users/${userToSuspend.id}/suspend`, {
      method: "POST",
      headers: { 
        "Cookie": sessionCookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "suspend" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.user.deletedAt !== null, true);

    // Verify in db
    const checkUser = await prisma.user.findUnique({ where: { id: userToSuspend.id } });
    assert.equal(checkUser?.deletedAt !== null, true);
  });

  it("should resolve a content report", async () => {
    const user11 = await prisma.user.findUniqueOrThrow({ where: { email: "user11@test.com" } });
    const sessionCookie = await createAuthCookie("admin11@test.com", sessionSecret);

    const report = await prisma.contentReport.create({
      data: {
        reporterId: user11.id,
        contentType: "PUBLICATION",
        contentId: crypto.randomUUID(),
        reason: "Test Reason",
      }
    });

    const res = await fetch(`http://127.0.0.1:${appPort}/api/admin/reports/${report.id}/resolve`, {
      method: "POST",
      headers: { 
        "Cookie": sessionCookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "RESOLVED", resolution: "Took action" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.report.status, "RESOLVED");
    assert.equal(data.report.resolution, "Took action");
  });
});
