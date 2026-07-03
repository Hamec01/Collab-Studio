import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import multer from "multer";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, type ProjectRole } from "@prisma/client";
import { getConfig } from "../config";
import { prisma } from "../db";
import { requireAuth, requireProjectEditor, requireProjectMember, requireProjectOwner } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { inviteRateLimit } from "../middleware/rateLimits";
import {
  acceptInviteSchema,
  addMemberSchema,
  createGuestLinkSchema,
  createInviteSchema,
  createTrackGrantSchema,
  guestLinkParamsSchema,
  inviteParamsSchema,
  createProjectSchema,
  memberParamsSchema,
  projectParamsSchema,
  trackGrantParamsSchema,
  transferOwnershipSchema,
  updateMemberRoleSchema,
  updateProjectSchema,
} from "../schemas/projects";
import { audioStreamParamsSchema, audioTrackParamsSchema, createLyricVersionSchema, createTrackSchema, externalAudioFormSchema, localAudioFormSchema, lyricsLeaseTokenSchema, parseUpdateLyricsDraft, trackParamsSchema, updateTrackSchema, versionParamsSchema } from "../schemas/tracks";
import { serializeAudioVersion, serializeLyricVersion, serializeProject, serializeProjectMember, serializeTrack, trackRelationsInclude } from "../serializers/projects";
import {
  prepareLyricsWrite,
  saveLyricsDraftAtomic,
  structuredTrackWriteData,
  structuredVersionWriteData,
} from "../services/structuredLyrics";
import { collaborationUserSelect } from "../serializers/collaboration";
import { createProjectMemberNotifications } from "../services/notifications";
import {
  canAcquireLyricsLease,
  nextLyricsLeaseExpiry,
} from "../services/lyricsWorkspace";
import {
  ensureVerifiedForProtectedWrite,
  hashOpaqueToken,
  newOpaqueToken,
  nowUtc,
  resolveProjectTrackAccess,
} from "../services/stage3Access";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

const memberInclude = {
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      role: true,
    },
  },
} as const;

const projectInclude = {
  members: {
    include: memberInclude,
    orderBy: { createdAt: "asc" as const },
  },
  tracks: {
    include: trackRelationsInclude,
    orderBy: { updatedAt: "desc" as const },
  },
} as const;

function requireCurrentUser(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  return req.user;
}

function requireVerifiedWriter(req: Request) {
  const user = requireCurrentUser(req);
  ensureVerifiedForProtectedWrite({
    emailVerifiedAt: user.emailVerifiedAt,
    ageAcknowledgedAt: user.ageAcknowledgedAt,
  });
  return user;
}

function requireCapability(req: Request, capability: keyof Express.ProjectAccess["capabilities"]) {
  if (!req.projectAccess?.capabilities[capability]) {
    throw new AppError(403, "FORBIDDEN", "Capability is not allowed for this scope");
  }
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

async function getTrackOrThrow(projectId: string, trackId: string) {
  const track = await prisma.track.findFirst({
    where: { id: trackId, projectId },
    include: trackRelationsInclude,
  });
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
  return track;
}

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const UPLOADS_ROOT = path.resolve(getConfig().UPLOADS_DIR);
const AUDIO_TEMP_DIR = path.join(UPLOADS_ROOT, ".tmp");

type AudioFormat = { extension: string; mimeTypes: readonly string[]; minimumBytes: number; matches: (header: Buffer) => boolean };

function isValidMp3Header(header: Buffer) {
  if (header.subarray(0, 3).toString("ascii") === "ID3") return header.length >= 10;
  if (header.length < 4) return false;
  if (header[0] !== 0xff || (header[1] & 0xe0) !== 0xe0) return false;
  const mpegVersionBits = (header[1] >> 3) & 0x03;
  const layerBits = (header[1] >> 1) & 0x03;
  const bitrateIndex = (header[2] >> 4) & 0x0f;
  const sampleRateIndex = (header[2] >> 2) & 0x03;
  if (mpegVersionBits === 0x01 || layerBits === 0x00) return false;
  if (bitrateIndex === 0x00 || bitrateIndex === 0x0f || sampleRateIndex === 0x03) return false;
  return true;
}

function hasAudioM4aBrand(header: Buffer) {
  if (header.length < 24) return false;
  if (header.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const audioBrands = new Set(["M4A ", "M4B ", "M4P ", "M4R "]);
  for (let offset = 8; offset + 4 <= Math.min(header.length, 72); offset += 4) {
    if (audioBrands.has(header.subarray(offset, offset + 4).toString("ascii"))) return true;
  }
  return false;
}

function hasWebmAudioMarker(header: Buffer) {
  if (!header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return false;
  const asciiHeader = header.toString("ascii");
  return asciiHeader.toLowerCase().includes("webm") && /A_OPUS|A_VORBIS|A_AAC|A_MPEG\/L3/.test(asciiHeader);
}

const audioFormats: readonly AudioFormat[] = [
  { extension: ".mp3", mimeTypes: ["audio/mpeg"], minimumBytes: 10, matches: (header) => isValidMp3Header(header) },
  { extension: ".wav", mimeTypes: ["audio/wav", "audio/x-wav"], minimumBytes: 12, matches: (header) => header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WAVE" },
  { extension: ".flac", mimeTypes: ["audio/flac"], minimumBytes: 4, matches: (header) => header.subarray(0, 4).toString("ascii") === "fLaC" },
  { extension: ".ogg", mimeTypes: ["audio/ogg"], minimumBytes: 32, matches: (header) => header.subarray(0, 4).toString("ascii") === "OggS" && /OpusHead|vorbis|Speex   |fLaC/.test(header.toString("latin1")) },
  { extension: ".aac", mimeTypes: ["audio/aac"], minimumBytes: 7, matches: (header) => header.subarray(0, 4).toString("ascii") === "ADIF" || (header[0] === 0xff && (header[1] & 0xf6) === 0xf0) },
  { extension: ".m4a", mimeTypes: ["audio/mp4"], minimumBytes: 24, matches: (header) => hasAudioM4aBrand(header) },
  { extension: ".webm", mimeTypes: ["audio/webm"], minimumBytes: 64, matches: (header) => hasWebmAudioMarker(header) },
];

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      void fsp.mkdir(AUDIO_TEMP_DIR, { recursive: true, mode: 0o750 }).then(() => callback(null, AUDIO_TEMP_DIR), () => callback(new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable"), AUDIO_TEMP_DIR));
    },
    filename: (_req, _file, callback) => callback(null, `upload-${randomUUID()}.tmp`),
  }),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES, files: 1, fields: 3, parts: 4 },
});

const requireAudioTrack = asyncHandler(async (req, _res, next) => {
  const { projectId, trackId } = audioTrackParamsSchema.parse(req.params);
  const track = await prisma.track.findFirst({ where: { id: trackId, projectId }, select: { id: true } });
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
  next();
});

function parseAudioMultipart(req: Request, res: Response, next: NextFunction) {
  audioUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") return next(new AppError(413, "FILE_TOO_LARGE", "Audio file exceeds the 25 MB limit"));
      return next(new AppError(400, "INVALID_MULTIPART", "Invalid audio upload"));
    }
    next(error);
  });
}

async function readFileHeader(filePath: string) {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function validateUploadedAudio(file: Express.Multer.File) {
  const originalFilename = file.originalname.normalize("NFC");
  if (!originalFilename || originalFilename.length > 255 || /[\/\\\0\r\n]/.test(originalFilename) || originalFilename.includes("..")) {
    throw new AppError(400, "INVALID_FILENAME", "Invalid audio filename");
  }
  const extension = path.extname(originalFilename).toLowerCase();
  const format = audioFormats.find((candidate) => candidate.extension === extension);
  if (!format || !format.mimeTypes.includes(file.mimetype)) throw new AppError(415, "UNSUPPORTED_AUDIO", "Unsupported audio format");

  const stat = await fsp.stat(file.path);
  if (!stat.isFile() || stat.size < 1 || stat.size !== file.size) throw new AppError(400, "INVALID_AUDIO", "Audio file is empty or invalid");
  if (stat.size > MAX_AUDIO_SIZE_BYTES) throw new AppError(413, "FILE_TOO_LARGE", "Audio file exceeds the 25 MB limit");
  const header = await readFileHeader(file.path);
  if (header.length < format.minimumBytes || !format.matches(header)) throw new AppError(415, "UNSUPPORTED_AUDIO", "Audio signature does not match its format");
  return { originalFilename, extension, mimeType: file.mimetype, sizeBytes: stat.size };
}

function createStorageKey(projectId: string, trackId: string, extension: string) {
  const storedFilename = `${randomUUID()}${extension}`;
  return { storedFilename, storageKey: path.posix.join(projectId, trackId, storedFilename) };
}

function resolveStoragePath(storageKey: string) {
  if (!storageKey || path.posix.isAbsolute(storageKey) || storageKey.includes("\\") || storageKey.split("/").some((segment) => segment === "" || segment === "." || segment === "..") || path.posix.normalize(storageKey) !== storageKey) {
    throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
  }
  const resolved = path.resolve(UPLOADS_ROOT, ...storageKey.split("/"));
  if (resolved !== UPLOADS_ROOT && !resolved.startsWith(`${UPLOADS_ROOT}${path.sep}`)) throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
  return resolved;
}
function isPathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveOwnedDirectory(root: string, segments: string[]) {
  const resolvedRoot = path.resolve(root);
  let current = resolvedRoot;

  for (const segment of segments) {
    if (!segment || segment.includes("/") || segment.includes("\\") || segment === "." || segment === "..") {
      throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
    }
    const nextPath = path.resolve(current, segment);
    const relative = path.relative(resolvedRoot, nextPath);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
    }
    const stat = await fsp.lstat(nextPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable");
    }
    current = nextPath;
  }

  return current;
}

async function removeProjectUploadsTree(projectId: string) {
  const projectUploadRoot = await resolveOwnedDirectory(UPLOADS_ROOT, [projectId]);
  await fsp.rm(projectUploadRoot, { recursive: true, force: true });
  console.info("Removed project uploads tree", { projectId });
}

async function removeTrackUploadsTree(projectId: string, trackId: string) {
  const trackUploadRoot = await resolveOwnedDirectory(UPLOADS_ROOT, [projectId, trackId]);
  await fsp.rm(trackUploadRoot, { recursive: true, force: true });
  console.info("Removed track uploads tree", { projectId, trackId });
}

async function ensureStorageDirectory(projectId: string, trackId: string) {
  await fsp.mkdir(UPLOADS_ROOT, { recursive: true, mode: 0o750 });
  const realRoot = await fsp.realpath(UPLOADS_ROOT);
  let current = UPLOADS_ROOT;

  for (const segment of [projectId, trackId]) {
    const candidate = path.join(current, segment);
    try {
      await fsp.mkdir(candidate, { mode: 0o750 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const candidateStat = await fsp.lstat(candidate);
    if (candidateStat.isSymbolicLink() || !candidateStat.isDirectory()) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable");
    }
    const realCandidate = await fsp.realpath(candidate);
    if (!isPathInside(realRoot, realCandidate)) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable");
    }
    current = candidate;
  }

  return current;
}

async function resolveExistingStoragePath(storageKey: string) {
  const resolved = resolveStoragePath(storageKey);
  const realRoot = await fsp.realpath(UPLOADS_ROOT);
  let current = UPLOADS_ROOT;

  for (const segment of storageKey.split("/")) {
    current = path.join(current, segment);
    const segmentStat = await fsp.lstat(current);
    if (segmentStat.isSymbolicLink()) {
      throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
    }
  }

  const realResolved = await fsp.realpath(resolved);
  if (!isPathInside(realRoot, realResolved)) {
    throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
  }
  return realResolved;
}


async function cleanupAudioFile(filePath: string | undefined, audioId: string) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Audio cleanup failed", { audioId });
  }
}

const audioInclude = { uploadedBy: { select: collaborationUserSelect } } as const;

type AudioCreateInput = {
  projectId: string; trackId: string; uploadedById: string; actorName: string; originalFilename: string; storedFilename?: string; storageKey?: string; mimeType?: string; sizeBytes?: number; isExternal: boolean; externalUrl?: string; externalProvider?: "google" | "yandex" | "telegram" | "other";
};

async function createAudioMetadata(input: AudioCreateInput) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const track = await tx.track.findFirst({ where: { id: input.trackId, projectId: input.projectId }, select: { id: true } });
        if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
        const aggregate = await tx.audioVersion.aggregate({ where: { trackId: input.trackId }, _max: { versionNumber: true } });
        const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;
        const audio = await tx.audioVersion.create({
          data: { trackId: input.trackId, uploadedById: input.uploadedById, originalFilename: input.originalFilename, storedFilename: input.storedFilename ?? null, storageKey: input.storageKey ?? null, mimeType: input.mimeType ?? null, sizeBytes: input.sizeBytes ?? null, isExternal: input.isExternal, externalUrl: input.externalUrl ?? null, externalProvider: input.externalProvider ?? null, versionNumber },
          include: audioInclude,
        });
        await createProjectMemberNotifications(tx, { projectId: input.projectId, trackId: input.trackId, actorId: input.uploadedById, actorName: input.actorName, type: "audio_uploaded", message: `uploaded audio version #${versionNumber} "${input.originalFilename.slice(0, 100)}"` });
        return audio;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034");
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new AppError(409, "AUDIO_VERSION_CONFLICT", "Could not allocate an audio version number");
}

function parseByteRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
  let start: number;
  let end: number;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
    end = Math.min(end, size - 1);
  } else {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }
  return { start, end };
}

function contentDispositionFilename(originalFilename: string) {
  const normalized = originalFilename.normalize("NFC").replace(/[\r\n\0]/g, "").trim();
  const safe = normalized.replace(/["\\/]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 150) || "audio";
  const utf8Name = normalized.slice(0, 255) || "audio";
  const encoded = encodeURIComponent(utf8Name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function deleteStoredAudioVersion(audioId: string) {
  const audio = await prisma.audioVersion.findUnique({ where: { id: audioId } });
  if (!audio) throw new AppError(404, "AUDIO_NOT_FOUND", "Audio version not found");
  if (audio.isExternal || !audio.storageKey) { await prisma.$transaction((tx) => tx.audioVersion.delete({ where: { id: audioId } })); return; }
  const references = await prisma.audioVersion.count({ where: { storageKey: audio.storageKey } });
  if (references !== 1) throw new AppError(409, "AUDIO_REFERENCE_CONFLICT", "Audio file has multiple references");
  const storedPath = await resolveExistingStoragePath(audio.storageKey);
  const quarantinePath = `${storedPath}.deleting-${randomUUID()}`;
  try { await fsp.rename(storedPath, quarantinePath); } catch { throw new AppError(500, "AUDIO_DELETE_FAILED", "Audio file could not be prepared for deletion"); }
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.audioVersion.findUnique({ where: { id: audioId }, select: { storageKey: true } });
      if (current?.storageKey !== audio.storageKey) throw new AppError(409, "AUDIO_REFERENCE_CONFLICT", "Audio metadata changed during deletion");
      await tx.audioVersion.delete({ where: { id: audioId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    try { await fsp.rename(quarantinePath, storedPath); } catch { console.error("Audio deletion rollback failed", { audioId }); }
    throw error;
  }
  try { await fsp.unlink(quarantinePath); } catch { console.error("Audio quarantine cleanup failed", { audioId }); throw new AppError(500, "AUDIO_DELETE_FAILED", "Audio file cleanup failed"); }
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const projects = await prisma.project.findMany({
      where: {
        members: {
          some: { userId: user.id },
        },
      },
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
    });

    res.json(projects.map((project) => serializeProject(project, user.id)));
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const input = createProjectSchema.parse(req.body);

    const project = await prisma.$transaction(async (tx) => {
      return tx.project.create({
        data: {
          title: input.title,
          type: input.type,
          coverUrl: input.coverUrl || null,
          tags: input.tags ?? [],
          members: {
            create: {
              userId: user.id,
              role: "owner",
            },
          },
        },
        include: projectInclude,
      });
    });

    res.status(201).json(serializeProject(project, user.id));
  }),
);

router.get(
  "/:projectId",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectMember,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    res.json(serializeProject(project, user.id));
  }),
);

router.patch(
  "/:projectId",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = updateProjectSchema.parse(req.body);
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl || null } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      include: projectInclude,
    });
    res.json(serializeProject(project, user.id));
  }),
);

router.delete(
  "/:projectId",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const { projectId } = projectParamsSchema.parse(req.params);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!existing) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
      await tx.project.delete({ where: { id: projectId } });
    });
    await removeProjectUploadsTree(projectId);
    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/members",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  inviteRateLimit,
  asyncHandler(async (req, res) => {
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = addMemberSchema.parse(req.body);
    const identifier = normalizeIdentifier(input.login ?? input.identifier ?? "");

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: { id: true },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

    try {
      const member = await prisma.projectMember.create({
        data: { projectId, userId: user.id, role: input.role },
        include: memberInclude,
      });
      res.status(201).json({ member: serializeProjectMember(member) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "MEMBER_EXISTS", "User is already a project member");
      }
      throw error;
    }
  }),
);

router.patch(
  "/:projectId/members/:userId",
  (req, _res, next) => {
    memberParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const { projectId, userId } = memberParamsSchema.parse(req.params);
    const input = updateMemberRoleSchema.parse(req.body);

    const member = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
        if (!existing) throw new AppError(404, "MEMBER_NOT_FOUND", "Project member not found");
        if (existing.role === "owner") throw new AppError(409, "OWNER_ROLE_CHANGE_FORBIDDEN", "Project owner role cannot be changed");
        return tx.projectMember.update({
          where: { projectId_userId: { projectId, userId } },
          data: { role: input.role },
          include: memberInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.json({ member: serializeProjectMember(member) });
  }),
);

router.delete(
  "/:projectId/members/:userId",
  (req, _res, next) => {
    memberParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const { projectId, userId } = memberParamsSchema.parse(req.params);

    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
        if (!existing) throw new AppError(404, "MEMBER_NOT_FOUND", "Project member not found");
        if (existing.role === "owner") throw new AppError(409, "OWNER_REMOVAL_FORBIDDEN", "Project owner cannot be removed");
        await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/invites",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  inviteRateLimit,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createInviteSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    if (input.scope === "track" && !input.trackId) throw new AppError(400, "VALIDATION_ERROR", "trackId is required for track-scoped invites");
    if (input.trackId) {
      const track = await prisma.track.findFirst({ where: { id: input.trackId, projectId }, select: { id: true } });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
    }

    const rawToken = newOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const invite = await prisma.projectInvite.create({
      data: {
        projectId,
        createdById: user.id,
        invitedUserId: input.userId ?? null,
        invitedEmail: input.email?.toLowerCase() ?? null,
        role: input.role,
        scope: input.scope,
        trackId: input.trackId ?? null,
        tokenHash,
        expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
      },
      select: {
        id: true,
        projectId: true,
        role: true,
        scope: true,
        trackId: true,
        invitedEmail: true,
        invitedUserId: true,
        expiresAt: true,
      },
    });

    await prisma.activityEvent.create({
      data: {
        projectId,
        actorId: user.id,
        type: "invite_created",
        payload: { inviteId: invite.id, scope: invite.scope, role: invite.role },
      },
    });

    res.status(201).json({ invite: { ...invite, expiresAt: invite.expiresAt.toISOString(), token: rawToken } });
  }),
);

router.post(
  "/:projectId/invites/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = acceptInviteSchema.parse(req.body);
    const tokenHash = hashOpaqueToken(input.token);
    const now = nowUtc();

    const invite = await prisma.projectInvite.findFirst({
      where: { tokenHash, projectId },
      select: {
        id: true,
        role: true,
        scope: true,
        trackId: true,
        status: true,
        revokedAt: true,
        expiresAt: true,
        invitedEmail: true,
        invitedUserId: true,
      },
    });

    if (!invite || invite.status !== "pending" || invite.revokedAt || invite.expiresAt <= now) {
      throw new AppError(400, "INVITE_INVALID", "Invite is invalid or expired");
    }

    const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, email: true } });
    if (invite.invitedUserId && invite.invitedUserId !== me.id) {
      throw new AppError(403, "FORBIDDEN", "Invite is not assigned to current user");
    }
    if (invite.invitedEmail && invite.invitedEmail !== (me.email ?? "")) {
      throw new AppError(403, "FORBIDDEN", "Invite email does not match current user");
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: now,
          acceptedById: me.id,
        },
      });

      if (invite.scope === "project") {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: me.id } },
          update: { role: invite.role },
          create: { projectId, userId: me.id, role: invite.role },
        });
      } else if (invite.trackId) {
        await tx.trackAccessGrant.upsert({
          where: { trackId_userId: { trackId: invite.trackId, userId: me.id } },
          update: { role: invite.role, revokedAt: null, expiresAt: null },
          create: {
            projectId,
            trackId: invite.trackId,
            userId: me.id,
            role: invite.role,
            canDownload: invite.role !== "viewer",
          },
        });
      }

      await tx.activityEvent.create({
        data: {
          projectId,
          actorId: me.id,
          type: "invite_accepted",
          payload: { inviteId: invite.id, scope: invite.scope },
        },
      });
    });

    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/invites/:inviteId/revoke",
  (req, _res, next) => {
    inviteParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId, inviteId } = inviteParamsSchema.parse(req.params);
    await prisma.projectInvite.updateMany({
      where: { id: inviteId, projectId, status: "pending", revokedAt: null },
      data: { status: "revoked", revokedAt: nowUtc() },
    });
    await prisma.activityEvent.create({ data: { projectId, actorId: user.id, type: "invite_revoked", payload: { inviteId } } });
    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/owner/transfer",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = transferOwnershipSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      const target = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: input.toUserId } } });
      if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Target owner must be a project member");
      await tx.projectMember.update({ where: { projectId_userId: { projectId, userId: user.id } }, data: { role: "editor" } });
      await tx.projectMember.update({ where: { projectId_userId: { projectId, userId: input.toUserId } }, data: { role: "owner" } });
      await tx.ownershipTransferAudit.create({ data: { projectId, fromUserId: user.id, toUserId: input.toUserId, reason: input.reason } });
      await tx.activityEvent.create({
        data: {
          projectId,
          actorId: user.id,
          type: "owner_transferred",
          payload: { fromUserId: user.id, toUserId: input.toUserId },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/tracks/:trackId/grants",
  (req, _res, next) => {
    trackGrantParamsSchema.parse({ ...req.params, userId: req.body?.userId });
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = createTrackGrantSchema.parse(req.body);
    const track = await prisma.track.findFirst({ where: { id: trackId, projectId }, select: { id: true } });
    if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

    const grant = await prisma.trackAccessGrant.upsert({
      where: { trackId_userId: { trackId, userId: input.userId } },
      update: {
        role: input.role,
        canDownload: input.canDownload,
        customCapabilities: input.customCapabilities ?? {},
        revokedAt: null,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000) : null,
      },
      create: {
        projectId,
        trackId,
        userId: input.userId,
        role: input.role,
        canDownload: input.canDownload,
        customCapabilities: input.customCapabilities ?? {},
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000) : null,
      },
    });

    await prisma.activityEvent.create({ data: { projectId, actorId: user.id, type: "track_grant_upserted", payload: { trackId, userId: input.userId } } });
    res.status(201).json({ grant });
  }),
);

router.post(
  "/:projectId/guest-links",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createGuestLinkSchema.parse(req.body);
    if (input.trackId) {
      const track = await prisma.track.findFirst({ where: { id: input.trackId, projectId }, select: { id: true } });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
    }
    const token = newOpaqueToken();
    const link = await prisma.guestLink.create({
      data: {
        projectId,
        trackId: input.trackId ?? null,
        tokenHash: hashOpaqueToken(token),
        canDownload: input.canDownload,
        expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
      },
      select: {
        id: true,
        projectId: true,
        trackId: true,
        canListen: true,
        canDownload: true,
        expiresAt: true,
      },
    });
    await prisma.activityEvent.create({ data: { projectId, actorId: user.id, type: "guest_link_created", payload: { guestLinkId: link.id } } });
    res.status(201).json({ guestLink: { ...link, token, expiresAt: link.expiresAt.toISOString() } });
  }),
);

router.post(
  "/:projectId/guest-links/:guestLinkId/revoke",
  (req, _res, next) => {
    guestLinkParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId, guestLinkId } = guestLinkParamsSchema.parse(req.params);
    await prisma.guestLink.updateMany({ where: { id: guestLinkId, projectId, revokedAt: null }, data: { revokedAt: nowUtc() } });
    await prisma.activityEvent.create({ data: { projectId, actorId: user.id, type: "guest_link_revoked", payload: { guestLinkId } } });
    res.json({ success: true });
  }),
);

router.post(
  "/:projectId/leave",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectMember,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);

    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
        if (!existing) throw new AppError(404, "MEMBER_NOT_FOUND", "Project member not found");
        if (existing.role === "owner") throw new AppError(409, "OWNER_LEAVE_FORBIDDEN", "Project owner cannot leave without transfer");
        await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId: user.id } } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.json({ success: true });
  }),
);

router.get(
  "/:projectId/tracks",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectMember,
  asyncHandler(async (req, res) => {
    const { projectId } = projectParamsSchema.parse(req.params);
    const tracks = await prisma.track.findMany({
      where: { projectId },
      include: trackRelationsInclude,
      orderBy: { updatedAt: "desc" },
    });
    res.json(tracks.map(serializeTrack));
  }),
);

router.post(
  "/:projectId/tracks",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createTrackSchema.parse(req.body);
    const lyrics = input.lyrics ?? "";
    const preparedLyrics = prepareLyricsWrite({ content: lyrics, baseRevision: 0, leaseToken: "" });

    const track = await prisma.$transaction(async (tx) => {
      const created = await tx.track.create({
        data: {
          projectId,
          title: input.title,
          ...structuredTrackWriteData(preparedLyrics),
          tags: input.tags ?? [],
        },
      });
      if (lyrics.trim()) {
        await tx.lyricVersion.create({
          data: {
            trackId: created.id,
            ...structuredVersionWriteData(preparedLyrics),
            authorId: user.id,
            label: input.versionLabel ?? "Initial version",
          },
        });
      }
      return tx.track.findUniqueOrThrow({
        where: { id: created.id },
        include: trackRelationsInclude,
      });
    });

    res.status(201).json(serializeTrack(track));
  }),
);

router.get(
  "/:projectId/tracks/:trackId",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectMember,
  asyncHandler(async (req, res) => {
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const track = await getTrackOrThrow(projectId, trackId);
    res.json(serializeTrack(track));
  }),
);

router.patch(
  "/:projectId/tracks/:trackId",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = updateTrackSchema.parse(req.body);

    const track = await prisma.$transaction(async (tx) => {
      const existing = await tx.track.findFirst({ where: { id: trackId, projectId } });
      if (!existing) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      const updated = await tx.track.update({
        where: { id: trackId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
        },
      });

      return tx.track.findUniqueOrThrow({
        where: { id: updated.id },
        include: trackRelationsInclude,
      });
    });

    res.json(serializeTrack(track));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/lyrics/lease",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const now = nowUtc();
    const leaseToken = newOpaqueToken();

    try {
      const lease = await prisma.$transaction(
        async (tx) => {
          const track = await tx.track.findFirst({
            where: { id: trackId, projectId },
            select: { id: true },
          });
          if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

          const existing = await tx.lyricsEditLease.findUnique({
            where: { trackId },
            select: { id: true, expiresAt: true },
          });
          if (!canAcquireLyricsLease(existing, now)) {
            throw new AppError(409, "LYRICS_LEASE_HELD", "Lyrics are being edited in another session");
          }
          if (existing) {
            await tx.lyricsEditLease.deleteMany({
              where: { id: existing.id, expiresAt: { lte: now } },
            });
          }

          return tx.lyricsEditLease.create({
            data: {
              trackId,
              userId: user.id,
              tokenHash: hashOpaqueToken(leaseToken),
              acquiredAt: now,
              heartbeatAt: now,
              expiresAt: nextLyricsLeaseExpiry(now),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      res.status(201).json({
        leaseToken,
        acquiredAt: lease.acquiredAt.toISOString(),
        expiresAt: lease.expiresAt.toISOString(),
        heartbeatIntervalMs: 30_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
        throw new AppError(409, "LYRICS_LEASE_HELD", "Lyrics are being edited in another session");
      }
      throw error;
    }
  }),
);

router.put(
  "/:projectId/tracks/:trackId/lyrics/lease",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const { leaseToken } = lyricsLeaseTokenSchema.parse(req.body);
    const now = nowUtc();
    const expiresAt = nextLyricsLeaseExpiry(now);
    const updated = await prisma.lyricsEditLease.updateMany({
      where: {
        trackId,
        track: { projectId },
        userId: user.id,
        tokenHash: hashOpaqueToken(leaseToken),
        expiresAt: { gt: now },
      },
      data: { heartbeatAt: now, expiresAt },
    });
    if (updated.count !== 1) {
      throw new AppError(409, "LYRICS_LEASE_LOST", "Lyrics edit lease is missing or expired");
    }
    res.json({ expiresAt: expiresAt.toISOString() });
  }),
);

router.delete(
  "/:projectId/tracks/:trackId/lyrics/lease",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const { leaseToken } = lyricsLeaseTokenSchema.parse(req.body);
    const released = await prisma.lyricsEditLease.deleteMany({
      where: { trackId, track: { projectId }, userId: user.id, tokenHash: hashOpaqueToken(leaseToken) },
    });
    res.json({ released: released.count === 1 });
  }),
);

router.put(
  "/:projectId/tracks/:trackId/lyrics/draft",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = parseUpdateLyricsDraft(req.body);
    const result = await saveLyricsDraftAtomic(prisma, {
      projectId,
      trackId,
      userId: user.id,
      write: input,
      now: nowUtc(),
    });

    res.json({
      ...result,
      updatedBy: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  }),
);

router.delete(
  "/:projectId/tracks/:trackId",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectOwner,
  asyncHandler(async (req, res) => {
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const existing = await prisma.track.findFirst({ where: { id: trackId, projectId }, select: { id: true } });
    if (!existing) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
    await prisma.$transaction(async (tx) => {
      await tx.track.delete({ where: { id: trackId } });
    });
    await removeTrackUploadsTree(projectId, trackId);
    res.json({ success: true });
  }),
);

router.get(
  "/:projectId/tracks/:trackId/versions",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectMember,
  asyncHandler(async (req, res) => {
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    await getTrackOrThrow(projectId, trackId);
    const versions = await prisma.lyricVersion.findMany({ where: { trackId }, orderBy: { createdAt: "desc" } });
    res.json(versions.map(serializeLyricVersion));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/versions",
  (req, _res, next) => {
    trackParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = createLyricVersionSchema.parse(req.body);
    await getTrackOrThrow(projectId, trackId);
    const preparedLyrics = prepareLyricsWrite({ content: input.lyrics, baseRevision: 0, leaseToken: "" });
    const version = await prisma.lyricVersion.create({
      data: {
        trackId,
        ...structuredVersionWriteData(preparedLyrics),
        label: input.label,
        authorId: user.id,
      },
    });
    res.status(201).json(serializeLyricVersion(version));
  }),
);

router.patch(
  "/:projectId/tracks/:trackId/versions/:versionId/pin",
  (req, _res, next) => {
    versionParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    requireVerifiedWriter(req);
    const { projectId, trackId, versionId } = versionParamsSchema.parse(req.params);

    const version = await prisma.$transaction(async (tx) => {
      const existing = await tx.lyricVersion.findFirst({
        where: { id: versionId, trackId, track: { projectId } },
      });
      if (!existing) throw new AppError(404, "VERSION_NOT_FOUND", "Lyric version not found");

      await tx.lyricVersion.updateMany({ where: { trackId }, data: { isOriginal: false } });
      return tx.lyricVersion.update({ where: { id: versionId }, data: { isOriginal: true } });
    });

    res.json(serializeLyricVersion(version));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/audio",
  (req, _res, next) => { audioTrackParamsSchema.parse(req.params); next(); },
  requireProjectEditor,
  requireAudioTrack,
  parseAudioMultipart,
  (req, res, next) => {
    void (async () => {
      const user = requireVerifiedWriter(req);
      requireCapability(req, "canUploadAudio");
      const { projectId, trackId } = audioTrackParamsSchema.parse(req.params);
      let finalPath: string | undefined;
      let committed = false;
      try {
        if (req.file) {
          localAudioFormSchema.parse(req.body);
          const validated = await validateUploadedAudio(req.file);
          const storage = createStorageKey(projectId, trackId, validated.extension);
          const storageDirectory = await ensureStorageDirectory(projectId, trackId);
          finalPath = path.join(storageDirectory, storage.storedFilename);
          if (finalPath !== resolveStoragePath(storage.storageKey)) throw new AppError(500, "INVALID_STORAGE_KEY", "Stored audio path is invalid");
          await fsp.rename(req.file.path, finalPath);
          const audio = await createAudioMetadata({ projectId, trackId, uploadedById: user.id, actorName: user.displayName, originalFilename: validated.originalFilename, storedFilename: storage.storedFilename, storageKey: storage.storageKey, mimeType: validated.mimeType, sizeBytes: validated.sizeBytes, isExternal: false });
          committed = true;
          res.status(201).json(serializeAudioVersion(audio, projectId));
          return;
        }

        const external = externalAudioFormSchema.parse(req.body);
        const audio = await createAudioMetadata({ projectId, trackId, uploadedById: user.id, actorName: user.displayName, originalFilename: external.label, isExternal: true, externalUrl: external.externalUrl, externalProvider: external.externalProvider });
        committed = true;
        res.status(201).json(serializeAudioVersion(audio, projectId));
      } catch (error) {
        if (req.file && !committed) await cleanupAudioFile(req.file.path, "temporary-upload");
        if (finalPath && !committed) await cleanupAudioFile(finalPath, "uncommitted-upload");
        next(error);
      }
    })();
  },
);

const streamAudioHandler = asyncHandler(async (req, res, next) => {
  const { projectId, trackId, audioId } = audioStreamParamsSchema.parse(req.params);

  if (req.user) {
    const access = await resolveProjectTrackAccess({
      prisma,
      user: { id: req.user.id, role: req.user.role },
      projectId,
      trackId,
      breakGlassProjectId: req.session.breakGlassProjectId,
    });
    if (!access) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
  } else {
    const guestToken = typeof req.query.guestToken === "string" ? req.query.guestToken : "";
    if (!guestToken) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }
    const tokenHash = hashOpaqueToken(guestToken);
    const guestLink = await prisma.guestLink.findFirst({
      where: {
        tokenHash,
        projectId,
        OR: [{ trackId: null }, { trackId }],
        revokedAt: null,
        expiresAt: { gt: nowUtc() },
        canListen: true,
      },
      select: { id: true, canDownload: true },
    });
    if (!guestLink) {
      throw new AppError(404, "GUEST_LINK_NOT_FOUND", "Guest access token is invalid or expired");
    }
    if (req.query.download === "1" || req.query.download === "true") {
      throw new AppError(403, "FORBIDDEN", "Guest links cannot download audio");
    }
  }

  const audio = await prisma.audioVersion.findFirst({ where: { id: audioId, trackId, track: { projectId } } });
  if (!audio) throw new AppError(404, "AUDIO_NOT_FOUND", "Audio version not found");
  if (audio.isExternal || !audio.storageKey || !audio.mimeType) throw new AppError(409, "EXTERNAL_AUDIO", "External audio is not available through the local stream endpoint");
  let storedPath: string;
  let stat;
  try {
    storedPath = await resolveExistingStoragePath(audio.storageKey);
    stat = await fsp.stat(storedPath);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new AppError(404, "AUDIO_FILE_NOT_FOUND", "Audio file not found");
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable");
  }
  if (!stat.isFile() || stat.size < 1) throw new AppError(404, "AUDIO_FILE_NOT_FOUND", "Audio file not found");

  let range;
  try { range = parseByteRange(req.headers.range, stat.size); } catch (error) {
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    throw error;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? stat.size - 1;
  const contentLength = end - start + 1;
  res.status(range ? 206 : 200);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", String(contentLength));
  res.setHeader("Content-Type", audio.mimeType);
  res.setHeader("Content-Disposition", contentDispositionFilename(audio.originalFilename));
  res.setHeader("Cache-Control", "private, no-store");
  if (range) res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  if (req.method === "HEAD") { res.end(); return; }

  const stream = fs.createReadStream(storedPath, { start, end });
  req.once("aborted", () => stream.destroy());
  res.once("close", () => stream.destroy());
  stream.once("error", () => {
    console.error("Audio stream failed", { audioId });
    if (!res.headersSent) next(new AppError(503, "STORAGE_UNAVAILABLE", "Audio storage is unavailable")); else res.destroy();
  });
  stream.pipe(res);
});

router.head(
  "/:projectId/tracks/:trackId/audio/:audioId/stream",
  (req, _res, next) => { audioStreamParamsSchema.parse(req.params); next(); },
  streamAudioHandler,
);

router.get(
  "/:projectId/tracks/:trackId/audio/:audioId/stream",
  (req, _res, next) => { audioStreamParamsSchema.parse(req.params); next(); },
  streamAudioHandler,
);

router.get(
  "/:projectId/tracks/:trackId/audio/:audioId/download",
  (req, _res, next) => { audioStreamParamsSchema.parse(req.params); next(); },
  requireProjectMember,
  asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    const { projectId, trackId } = audioStreamParamsSchema.parse(req.params);
    const access = await resolveProjectTrackAccess({
      prisma,
      user: { id: req.user.id, role: req.user.role },
      projectId,
      trackId,
      breakGlassProjectId: req.session.breakGlassProjectId,
    });
    if (!access || !access.capabilities.canDownload) {
      next(new AppError(403, "FORBIDDEN", "Download is not allowed for this scope"));
      return;
    }
    req.query.download = "1";
    next();
  }),
  streamAudioHandler,
);

export default router;
