import { promises as fsp } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient, type ProjectType, type UserRole } from "@prisma/client";
import {
  DEFAULT_STAGE3_SMOKE_ENV_FILE,
  STAGE3_SMOKE_PREFIX,
  assertSafeUploadFilePath,
  assertStage3SmokeMarker,
  initializeSmokeDatabaseEnv,
  makeStage3SmokeName,
} from "./stage3SmokeSafety";

type FixtureUser = {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  verified: boolean;
};

type HttpResult = {
  status: number;
  body: any;
  headers: Headers;
};

type ErrorContract = {
  code: string;
  message: string;
};

type BaselineCounts = {
  projects: number;
  users: number;
  uploads: number;
};

class CookieJar {
  private readonly values = new Map<string, string>();

  mergeFromHeaders(headers: Headers) {
    const raw = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const first = cookie.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      this.values.set(first.slice(0, eq), first.slice(eq + 1));
    }
  }

  toHeader() {
    if (this.values.size === 0) return "";
    return [...this.values.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

const smokeDb = initializeSmokeDatabaseEnv(process.env.ENV_FILE ?? DEFAULT_STAGE3_SMOKE_ENV_FILE);
console.log(`STAGE3_SMOKE_DB_TARGET: ${smokeDb.diagnostics}`);

const prisma = new PrismaClient({
  datasources: {
    db: { url: smokeDb.databaseUrl },
  },
});

function jsonBodyOrNull(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function requestJson(baseUrl: string, pathName: string, options: RequestInit, jar?: CookieJar): Promise<HttpResult> {
  const headers = new Headers(options.headers ?? {});
  if (jar) {
    const cookie = jar.toHeader();
    if (cookie) headers.set("cookie", cookie);
  }

  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers,
  });

  if (jar) jar.mergeFromHeaders(response.headers);

  const text = await response.text();
  return {
    status: response.status,
    body: jsonBodyOrNull(text),
    headers: response.headers,
  };
}

function assertStatus(actual: number, expected: number, label: string, details?: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}${details ? ` (${String(details)})` : ""}`);
  }
}

function extractErrorContract(body: unknown): ErrorContract | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return { code, message };
}

function assertErrorResponse(result: HttpResult, expected: { status: number; code: string; message?: string }, label: string) {
  assertStatus(result.status, expected.status, label);
  const error = extractErrorContract(result.body);
  if (!error) {
    throw new Error(`${label}: expected machine-readable error response`);
  }
  if (error.code !== expected.code) {
    throw new Error(`${label}: expected error code ${expected.code}, got ${error.code}`);
  }
  if (expected.message !== undefined && error.message !== expected.message) {
    throw new Error(`${label}: expected error message \"${expected.message}\", got \"${error.message}\"`);
  }
}

function assertPolicyDenied(result: HttpResult, label: string) {
  assertStatus(result.status, 403, label);
  const error = extractErrorContract(result.body);
  if (!error) {
    throw new Error(`${label}: expected machine-readable error response`);
  }
  if (!error.code.trim() || !error.message.trim()) {
    throw new Error(`${label}: expected non-empty machine-readable error code/message`);
  }
}

async function countUploadFiles(root: string) {
  const visit = async (dirPath: string): Promise<number> => {
    let total = 0;
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        total += await visit(path.join(dirPath, entry.name));
      } else if (entry.isFile()) {
        total += 1;
      }
    }
    return total;
  };

  try {
    return await visit(root);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return 0;
    throw error;
  }
}

async function captureExistingDataCounts(uploadsRoot: string): Promise<BaselineCounts> {
  const [projects, users, uploads] = await Promise.all([
    prisma.project.count({ where: { title: { not: { startsWith: STAGE3_SMOKE_PREFIX } } } }),
    prisma.user.count({ where: { username: { not: { startsWith: STAGE3_SMOKE_PREFIX } } } }),
    countUploadFiles(uploadsRoot),
  ]);

  return { projects, users, uploads };
}

async function countSmokeFixturesInDb() {
  const [users, projects, tracks, audioVersions, invites, guestLinks, ownershipAudits, breakGlassAudits] = await Promise.all([
    prisma.user.count({ where: { username: { startsWith: STAGE3_SMOKE_PREFIX } } }),
    prisma.project.count({ where: { title: { startsWith: STAGE3_SMOKE_PREFIX } } }),
    prisma.track.count({ where: { title: { startsWith: STAGE3_SMOKE_PREFIX } } }),
    prisma.audioVersion.count({ where: { originalFilename: { startsWith: STAGE3_SMOKE_PREFIX } } }),
    prisma.projectInvite.count({ where: { project: { title: { startsWith: STAGE3_SMOKE_PREFIX } } } }),
    prisma.guestLink.count({ where: { project: { title: { startsWith: STAGE3_SMOKE_PREFIX } } } }),
    prisma.ownershipTransferAudit.count({ where: { reason: { startsWith: STAGE3_SMOKE_PREFIX } } }),
    prisma.breakGlassAccessAudit.count({ where: { reason: { startsWith: STAGE3_SMOKE_PREFIX } } }),
  ]);

  return { users, projects, tracks, audioVersions, invites, guestLinks, ownershipAudits, breakGlassAudits };
}

async function createFixtureUser(runId: string, suffix: string, role: UserRole, verified: boolean) {
  const username = makeStage3SmokeName(runId, suffix);
  const password = randomBytes(12).toString("hex");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@example.invalid`,
      displayName: username,
      passwordHash,
      role,
      emailVerifiedAt: verified ? new Date() : null,
      ageAcknowledgedAt: verified ? new Date() : null,
    },
    select: { id: true, username: true, role: true },
  });

  return { id: user.id, username: user.username, password, role: user.role, verified } satisfies FixtureUser;
}

async function login(baseUrl: string, user: FixtureUser) {
  const jar = new CookieJar();
  const result = await requestJson(
    baseUrl,
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: user.username, password: user.password }),
    },
    jar,
  );

  assertStatus(result.status, 200, `login ${user.username}`, result.body);
  return jar;
}

function makeWaveFixtureBuffer() {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

async function main() {
  const baseUrl = process.env.STAGE3_SMOKE_BASE_URL ?? "https://collabstudio.run";
  const uploadsRoot = process.env.STAGE3_SMOKE_UPLOADS_DIR ?? process.env.UPLOADS_HOST_DIR ?? "/home/deploy/app-data/collab-studio/uploads";
  const runId = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdInviteIds: string[] = [];
  const createdGuestLinkIds: string[] = [];
  const createdOwnershipAuditIds: string[] = [];
  const createdBreakGlassAuditIds: string[] = [];
  const createdAudioIds: string[] = [];
  const createdFilePaths: string[] = [];

  const summary: Record<string, unknown> = {
    prefix: STAGE3_SMOKE_PREFIX,
    runId,
    checks: {},
  };

  let owner: FixtureUser | undefined;
  let editor: FixtureUser | undefined;
  let viewer: FixtureUser | undefined;
  let unverified: FixtureUser | undefined;
  let scopedEditor: FixtureUser | undefined;
  let invitee: FixtureUser | undefined;
  let admin: FixtureUser | undefined;
  let baselineCounts: BaselineCounts | undefined;
  let checksPassed = false;

  try {
    baselineCounts = await captureExistingDataCounts(uploadsRoot);
    summary.baselineCounts = baselineCounts;

    const oldProject = await prisma.project.findFirst({
      where: { title: { not: { startsWith: STAGE3_SMOKE_PREFIX } } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!oldProject) {
      throw new Error("No non-smoke project found to verify legacy accessibility");
    }

    owner = await createFixtureUser(runId, "owner", "user", true);
    editor = await createFixtureUser(runId, "editor", "user", true);
    viewer = await createFixtureUser(runId, "viewer", "user", true);
    unverified = await createFixtureUser(runId, "unverified", "user", false);
    scopedEditor = await createFixtureUser(runId, "scoped", "user", true);
    invitee = await createFixtureUser(runId, "invitee", "user", true);
    admin = await createFixtureUser(runId, "admin", "admin", true);

    createdUserIds.push(owner.id, editor.id, viewer.id, unverified.id, scopedEditor.id, invitee.id, admin.id);

    const ownerJar = await login(baseUrl, owner);
    const editorJar = await login(baseUrl, editor);
    const viewerJar = await login(baseUrl, viewer);
    const unverifiedJar = await login(baseUrl, unverified);
    const scopedJar = await login(baseUrl, scopedEditor);
    const inviteeJar = await login(baseUrl, invitee);
    const adminJar = await login(baseUrl, admin);

    const createProjectA = await requestJson(
      baseUrl,
      "/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "project-a"), type: "single" satisfies ProjectType }),
      },
      ownerJar,
    );
    assertStatus(createProjectA.status, 201, "create smoke project A", createProjectA.body);
    const projectAId = createProjectA.body?.id as string;
    createdProjectIds.push(projectAId);

    const createProjectB = await requestJson(
      baseUrl,
      "/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "project-b"), type: "single" satisfies ProjectType }),
      },
      ownerJar,
    );
    assertStatus(createProjectB.status, 201, "create smoke project B", createProjectB.body);
    const projectBId = createProjectB.body?.id as string;
    createdProjectIds.push(projectBId);

    for (const [jar, user, role] of [
      [ownerJar, editor, "editor"],
      [ownerJar, viewer, "viewer"],
      [ownerJar, unverified, "editor"],
      [ownerJar, invitee, "viewer"],
    ] as const) {
      const add = await requestJson(
        baseUrl,
        `/api/projects/${projectAId}/members`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier: user.username, role }),
        },
        jar,
      );
      assertStatus(add.status, 201, `add ${role} member ${user.username}`, add.body);
    }

    const trackA1 = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "track-a1"), lyrics: "smoke lyrics" }),
      },
      ownerJar,
    );
    assertStatus(trackA1.status, 201, "create track a1", trackA1.body);
    const trackA1Id = trackA1.body?.id as string;

    const trackA2 = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "track-a2"), lyrics: "second" }),
      },
      ownerJar,
    );
    assertStatus(trackA2.status, 201, "create track a2", trackA2.body);
    const trackA2Id = trackA2.body?.id as string;

    const trackB1 = await requestJson(
      baseUrl,
      `/api/projects/${projectBId}/tracks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "track-b1"), lyrics: "isolation" }),
      },
      ownerJar,
    );
    assertStatus(trackB1.status, 201, "create track b1", trackB1.body);
    const trackB1Id = trackB1.body?.id as string;

    const grantScoped = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks/${trackA1Id}/grants`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: scopedEditor.id, role: "editor", canDownload: false }),
      },
      ownerJar,
    );
    assertStatus(grantScoped.status, 201, "create scoped track grant", grantScoped.body);

    const smokeAudioName = makeStage3SmokeName(runId, "audio.wav");
    const storageKey = `${projectAId}/${trackA1Id}/${smokeAudioName}`;
    const absoluteAudioPath = path.join(uploadsRoot, storageKey);
    await fsp.mkdir(path.dirname(absoluteAudioPath), { recursive: true });
    await fsp.writeFile(absoluteAudioPath, makeWaveFixtureBuffer());
    createdFilePaths.push(absoluteAudioPath);

    const audio = await prisma.audioVersion.create({
      data: {
        trackId: trackA1Id,
        uploadedById: owner.id,
        originalFilename: smokeAudioName,
        storedFilename: smokeAudioName,
        storageKey,
        mimeType: "audio/wav",
        sizeBytes: makeWaveFixtureBuffer().length,
        isExternal: false,
        versionNumber: 1,
      },
      select: { id: true },
    });
    createdAudioIds.push(audio.id);

    const ownerProject = await requestJson(baseUrl, `/api/projects/${projectAId}`, { method: "GET" }, ownerJar);
    assertStatus(ownerProject.status, 200, "owner access to project", ownerProject.body);

    const editorComment = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks/${trackA1Id}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: makeStage3SmokeName(runId, "editor-comment") }),
      },
      editorJar,
    );
    assertStatus(editorComment.status, 201, "editor allowed comment", editorComment.body);

    const editorOwnerAction = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/members`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: scopedEditor.username, role: "viewer" }),
      },
      editorJar,
    );
    assertErrorResponse(editorOwnerAction, { status: 403, code: "FORBIDDEN", message: "Project owner access required" }, "editor denied owner-only members action");

    const viewerRead = await requestJson(baseUrl, `/api/projects/${projectAId}/tracks`, { method: "GET" }, viewerJar);
    assertStatus(viewerRead.status, 200, "viewer can read tracks", viewerRead.body);

    const viewerWrite = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "viewer-write") }),
      },
      viewerJar,
    );
    assertErrorResponse(viewerWrite, { status: 403, code: "FORBIDDEN", message: "Project editor access required" }, "viewer write denied");

    const scopedTrackRead = await requestJson(baseUrl, `/api/projects/${projectAId}/tracks/${trackA1Id}`, { method: "GET" }, scopedJar);
    assertStatus(scopedTrackRead.status, 200, "scoped user track access allowed", scopedTrackRead.body);

    const scopedProjectRead = await requestJson(baseUrl, `/api/projects/${projectAId}`, { method: "GET" }, scopedJar);
    assertErrorResponse(scopedProjectRead, { status: 404, code: "PROJECT_NOT_FOUND", message: "Project not found" }, "scoped user denied project-level access");

    const scopedOtherTrackRead = await requestJson(baseUrl, `/api/projects/${projectAId}/tracks/${trackA2Id}`, { method: "GET" }, scopedJar);
    assertErrorResponse(scopedOtherTrackRead, { status: 404, code: "PROJECT_NOT_FOUND", message: "Project not found" }, "scoped user denied other track");

    const scopedOtherProjectRead = await requestJson(baseUrl, `/api/projects/${projectBId}/tracks/${trackB1Id}`, { method: "GET" }, scopedJar);
    assertErrorResponse(scopedOtherProjectRead, { status: 404, code: "PROJECT_NOT_FOUND", message: "Project not found" }, "scoped user denied other project");

    const guestCreate = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/guest-links`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId: trackA1Id, canDownload: false, expiresInHours: 1 }),
      },
      ownerJar,
    );
    assertStatus(guestCreate.status, 201, "create guest link", guestCreate.body);
    const guestToken = guestCreate.body?.guestLink?.token as string;
    const guestLinkId = guestCreate.body?.guestLink?.id as string;
    createdGuestLinkIds.push(guestLinkId);

    const guestListen = await fetch(`${baseUrl}/api/projects/${projectAId}/tracks/${trackA1Id}/audio/${audio.id}/stream?guestToken=${encodeURIComponent(guestToken)}`, { method: "HEAD" });
    assertStatus(guestListen.status, 200, "guest listen allowed");

    const guestDownloadDenied = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks/${trackA1Id}/audio/${audio.id}/stream?guestToken=${encodeURIComponent(guestToken)}&download=1`,
      { method: "GET" },
    );
    assertErrorResponse(guestDownloadDenied, { status: 403, code: "FORBIDDEN", message: "Guest links cannot download audio" }, "guest download denied");

    const inviteExpired = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/invites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: invitee.id, role: "viewer", scope: "project", expiresInHours: 1 }),
      },
      ownerJar,
    );
    assertStatus(inviteExpired.status, 201, "create invite for expiry", inviteExpired.body);
    const expiredInviteId = inviteExpired.body?.invite?.id as string;
    createdInviteIds.push(expiredInviteId);

    await prisma.projectInvite.update({ where: { id: expiredInviteId }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const acceptExpiredInvite = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/invites/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteExpired.body?.invite?.token }),
      },
      inviteeJar,
    );
    assertErrorResponse(acceptExpiredInvite, { status: 400, code: "INVITE_INVALID", message: "Invite is invalid or expired" }, "expired invite denied");

    const inviteRevoked = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/invites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: scopedEditor.id, role: "viewer", scope: "project", expiresInHours: 1 }),
      },
      ownerJar,
    );
    assertStatus(inviteRevoked.status, 201, "create invite for revoke", inviteRevoked.body);
    const revokedInviteId = inviteRevoked.body?.invite?.id as string;
    createdInviteIds.push(revokedInviteId);

    const revokeInvite = await requestJson(baseUrl, `/api/projects/${projectAId}/invites/${revokedInviteId}/revoke`, { method: "POST" }, ownerJar);
    assertStatus(revokeInvite.status, 200, "revoke invite", revokeInvite.body);

    const acceptRevokedInvite = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/invites/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteRevoked.body?.invite?.token }),
      },
      scopedJar,
    );
    assertErrorResponse(acceptRevokedInvite, { status: 400, code: "INVITE_INVALID", message: "Invite is invalid or expired" }, "revoked invite denied");

    const unverifiedTrackCreate = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: makeStage3SmokeName(runId, "unverified-track") }),
      },
      unverifiedJar,
    );
    assertErrorResponse(unverifiedTrackCreate, { status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email verification is required for this action" }, "unverified track creation denied");

    const unverifiedComment = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/tracks/${trackA1Id}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: makeStage3SmokeName(runId, "unverified-comment") }),
      },
      unverifiedJar,
    );
    assertErrorResponse(unverifiedComment, { status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email verification is required for this action" }, "unverified comment denied");

    const unverifiedDm = await requestJson(
      baseUrl,
      "/api/dm",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "smoke" }),
      },
      unverifiedJar,
    );

    const unverifiedPublication = await requestJson(
      baseUrl,
      "/api/publications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "smoke" }),
      },
      unverifiedJar,
    );

    assertPolicyDenied(unverifiedDm, "unverified DM denied by policy");
    assertPolicyDenied(unverifiedPublication, "unverified publication denied by policy");

    const breakGlassNoReason = await requestJson(
      baseUrl,
      "/api/auth/admin/break-glass/start",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: projectAId }),
      },
      adminJar,
    );
    assertErrorResponse(breakGlassNoReason, { status: 400, code: "VALIDATION_ERROR", message: "projectId and reason are required" }, "break-glass reason required");

    const breakGlassOldProject = await requestJson(
      baseUrl,
      "/api/auth/admin/break-glass/start",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: oldProject.id, reason: makeStage3SmokeName(runId, "break-glass-old-project") }),
      },
      adminJar,
    );
    assertStatus(breakGlassOldProject.status, 200, "break-glass start with reason", breakGlassOldProject.body);

    const oldProjectOpen = await requestJson(baseUrl, `/api/projects/${oldProject.id}`, { method: "GET" }, adminJar);
    assertStatus(oldProjectOpen.status, 200, "old project accessible", oldProjectOpen.body);

    const oldProjectAudit = await prisma.breakGlassAccessAudit.findFirst({
      where: { projectId: oldProject.id, adminUserId: admin.id, reason: makeStage3SmokeName(runId, "break-glass-old-project") },
      select: { id: true },
    });
    if (!oldProjectAudit) throw new Error("Expected break-glass audit record was not created");
    createdBreakGlassAuditIds.push(oldProjectAudit.id);

    const breakGlassRelease = await requestJson(baseUrl, "/api/auth/admin/break-glass/release", { method: "POST" }, adminJar);
    assertStatus(breakGlassRelease.status, 200, "break-glass release", breakGlassRelease.body);

    const transferOwnership = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/owner/transfer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toUserId: editor.id, reason: makeStage3SmokeName(runId, "ownership-transfer") }),
      },
      ownerJar,
    );
    assertStatus(transferOwnership.status, 200, "ownership transfer", transferOwnership.body);

    const ownershipAudit = await prisma.ownershipTransferAudit.findFirst({
      where: { projectId: projectAId, fromUserId: owner.id, toUserId: editor.id, reason: makeStage3SmokeName(runId, "ownership-transfer") },
      select: { id: true },
    });
    if (!ownershipAudit) throw new Error("Expected ownership transfer audit record was not created");
    createdOwnershipAuditIds.push(ownershipAudit.id);

    const newOwnerCanManage = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/members`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: scopedEditor.username, role: "viewer" }),
      },
      editorJar,
    );
    assertStatus(newOwnerCanManage.status, 201, "new owner can manage members", newOwnerCanManage.body);

    const oldOwnerNoLongerOwner = await requestJson(
      baseUrl,
      `/api/projects/${projectAId}/members`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: scopedEditor.username, role: "viewer" }),
      },
      ownerJar,
    );
    assertErrorResponse(oldOwnerNoLongerOwner, { status: 403, code: "FORBIDDEN", message: "Project owner access required" }, "old owner loses owner-only rights");

    summary.checks = {
      ownerAccess: "pass",
      editorAllowedDenied: "pass",
      viewerReadonly: "pass",
      scopeIsolation: "pass",
      guestListenAndNoDownload: "pass",
      inviteExpiryAndRevoke: "pass",
      ownershipTransfer: "pass",
      unverifiedUploadCommentDenied: "pass",
      unverifiedDmPublicationPolicyDenied: "pass",
      breakGlassAudit: "pass",
      oldProjectOpen: "pass",
    };

    summary.outcome = "pass";
    checksPassed = true;
  } finally {
    const cleanupErrors: string[] = [];

    const cleanupStep = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        cleanupErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    for (const filePath of createdFilePaths) {
      await cleanupStep(`remove file ${path.basename(filePath)}`, async () => {
        assertSafeUploadFilePath(filePath, uploadsRoot);
        await fsp.rm(filePath, { force: true });
      });
    }

    for (const id of createdBreakGlassAuditIds) {
      await cleanupStep("remove break-glass audit", async () => {
        const row = await prisma.breakGlassAccessAudit.findUnique({ where: { id }, select: { reason: true } });
        assertStage3SmokeMarker(row?.reason, "break-glass audit");
        await prisma.breakGlassAccessAudit.delete({ where: { id } });
      });
    }

    for (const id of createdOwnershipAuditIds) {
      await cleanupStep("remove ownership transfer audit", async () => {
        const row = await prisma.ownershipTransferAudit.findUnique({ where: { id }, select: { reason: true } });
        assertStage3SmokeMarker(row?.reason, "ownership transfer audit");
        await prisma.ownershipTransferAudit.delete({ where: { id } });
      });
    }

    for (const id of createdGuestLinkIds) {
      await cleanupStep("remove guest link", async () => {
        const row = await prisma.guestLink.findUnique({ where: { id }, select: { project: { select: { title: true } } } });
        assertStage3SmokeMarker(row?.project?.title, "guest link project");
        await prisma.guestLink.delete({ where: { id } });
      });
    }

    for (const id of createdInviteIds) {
      await cleanupStep("remove invite", async () => {
        const row = await prisma.projectInvite.findUnique({ where: { id }, select: { project: { select: { title: true } } } });
        assertStage3SmokeMarker(row?.project?.title, "invite project");
        await prisma.projectInvite.delete({ where: { id } });
      });
    }

    for (const id of createdAudioIds) {
      await cleanupStep("remove audio fixture", async () => {
        const row = await prisma.audioVersion.findUnique({ where: { id }, select: { originalFilename: true } });
        assertStage3SmokeMarker(row?.originalFilename, "audio fixture");
        await prisma.audioVersion.delete({ where: { id } });
      });
    }

    for (const id of createdProjectIds) {
      await cleanupStep("remove project fixture", async () => {
        const row = await prisma.project.findUnique({ where: { id }, select: { title: true } });
        assertStage3SmokeMarker(row?.title, "project fixture");
        await prisma.project.delete({ where: { id } });
      });
    }

    for (const id of createdUserIds) {
      await cleanupStep("remove user fixture", async () => {
        const row = await prisma.user.findUnique({ where: { id }, select: { username: true } });
        assertStage3SmokeMarker(row?.username, "user fixture");
        await prisma.user.delete({ where: { id } });
      });
    }

    await cleanupStep("verify no stage3-smoke DB fixtures remain", async () => {
      const leftovers = await countSmokeFixturesInDb();
      const leftoversTotal = Object.values(leftovers).reduce((sum, value) => sum + value, 0);
      if (leftoversTotal !== 0) {
        throw new Error(`leftover fixtures remain: ${JSON.stringify(leftovers)}`);
      }
    });

    await cleanupStep("verify existing production counts unchanged", async () => {
      if (!baselineCounts) {
        throw new Error("baseline counts were not captured");
      }
      const afterCleanup = await captureExistingDataCounts(uploadsRoot);
      summary.postCleanupCounts = afterCleanup;
      if (
        afterCleanup.projects !== baselineCounts.projects
        || afterCleanup.users !== baselineCounts.users
        || afterCleanup.uploads !== baselineCounts.uploads
      ) {
        throw new Error(
          `existing data counts changed: before=${JSON.stringify(baselineCounts)}, after=${JSON.stringify(afterCleanup)}`,
        );
      }
    });

    await prisma.$disconnect();

    if (cleanupErrors.length > 0) {
      throw new Error(`cleanup failed: ${cleanupErrors.join("; ")}`);
    }

    if (checksPassed) {
      console.log(JSON.stringify(summary, null, 2));
    }
  }
}

main().catch(async (error) => {
  console.error(`STAGE3_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
  await prisma.$disconnect();
});
