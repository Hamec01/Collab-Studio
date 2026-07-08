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
const pgContainer = `stage11-seo-pg-${randomBytes(4).toString("hex")}`;
const pgPassword = `pw_${randomBytes(8).toString("hex")}`;
const pgDatabase = `db_${randomBytes(6).toString("hex")}`;
const pgPort = 58000 + Math.floor(Math.random() * 1000);
const appPort = 59000 + Math.floor(Math.random() * 1000);
const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDatabase}`;

let prisma: PrismaClient;
let serverProcess: ReturnType<typeof spawn> | null = null;
let uploadsDir = "";

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectRoot,
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

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "stage11-seo-uploads-"));

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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/api/ready`);
  } catch (error) {
    serverProcess?.kill("SIGTERM");
    throw error;
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

test("SEO: Dynamic metadata injection and sitemap generation", async () => {
  const passwordHash = await argon2.hash("testpw", { type: argon2.argon2id });

  // Create a public user
  const author = await prisma.user.create({
    data: {
      username: "seoAuthor",
      email: "seo@test.com",
      displayName: "SEO Author",
      passwordHash,
      isPublicProfile: true,
      bio: "An artist for testing SEO",
    },
  });

  const project = await prisma.project.create({
    data: { title: "SEO Project", type: "single" },
  });

  const track = await prisma.track.create({
    data: { projectId: project.id, title: "SEO Track" },
  });

  const snapshot = await prisma.trackSnapshot.create({
    data: { trackId: track.id, title: "SEO Snapshot" },
  });

  const asset = await prisma.trackAsset.create({
    data: {
      projectId: project.id,
      trackId: track.id,
      title: "SEO Asset",
      originalFilename: "seo-key.mp3",
      kind: "MASTER",
      storageKey: "seo-key.mp3",
    },
  });

  // Create a published work
  const work = await prisma.publication.create({
    data: {
      slug: "seo-test-work",
      authorUserId: author.id,
      projectId: project.id,
      trackId: track.id,
      snapshotId: snapshot.id,
      selectedAssetId: asset.id,
      kind: "WORK",
      status: "PUBLISHED",
      title: "My Great SEO Work",
      description: "A description of this amazing work",
    },
  });

  // Test 1: Fetch Profile HTML
  const profileRes = await fetch(`http://127.0.0.1:${appPort}/u/seoAuthor`);
  assert.equal(profileRes.status, 200);
  const profileHtml = await profileRes.text();
  console.log("PROFILE HTML:", profileHtml);
  assert.ok(profileHtml.includes('<meta property="og:title" content="SEO Author (@seoAuthor) | CollabStudio" />'));
  assert.ok(profileHtml.includes('<meta property="og:description" content="An artist for testing SEO" />'));
  assert.ok(profileHtml.includes('@type": "Person"')); // JSON-LD

  // Test 2: Fetch Work HTML
  const workRes = await fetch(`http://127.0.0.1:${appPort}/works/seo-test-work`);
  assert.equal(workRes.status, 200);
  const workHtml = await workRes.text();
  assert.ok(workHtml.includes('<meta property="og:title" content="My Great SEO Work - SEO Author | CollabStudio" />'));
  assert.ok(workHtml.includes('<meta property="og:description" content="A description of this amazing work" />'));
  assert.ok(workHtml.includes('@type": "MusicComposition"')); // JSON-LD

  // Test 3: Fetch robots.txt
  const robotsRes = await fetch(`http://127.0.0.1:${appPort}/robots.txt`);
  assert.equal(robotsRes.status, 200);
  const robotsText = await robotsRes.text();
  assert.ok(robotsText.includes("Disallow: /app/"));
  assert.ok(robotsText.includes(`Sitemap: http://127.0.0.1:${appPort}/sitemap.xml`));

  // Test 4: Fetch sitemap.xml
  const sitemapRes = await fetch(`http://127.0.0.1:${appPort}/sitemap.xml`);
  assert.equal(sitemapRes.status, 200);
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes("<loc>http://127.0.0.1:" + appPort + "/u/seoAuthor</loc>"));
  assert.ok(sitemapXml.includes("<loc>http://127.0.0.1:" + appPort + "/works/seo-test-work</loc>"));
});
