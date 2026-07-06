import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import type { TrackAssetKind, TrackAssetStatus } from "@prisma/client";
import { AppError } from "../middleware/errors";

export const deliverableTrackAssetKinds = new Set<TrackAssetKind>([
  "MASTER",
  "AUDIO_VERSION",
  "INSTRUMENTAL",
  "ACAPELLA",
  "STEM",
  "DEMO",
  "REFERENCE",
]);

export function isTrackAssetKindDeliverable(kind: TrackAssetKind) {
  return deliverableTrackAssetKinds.has(kind);
}

export function isTrackAssetStatusDeliverable(status: TrackAssetStatus) {
  return status === "READY";
}

function isPathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveAudioStoragePath(uploadsRoot: string, storageKey: string) {
  const normalized = storageKey.trim();
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.includes("\\")) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key must be a relative POSIX path");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key contains an invalid path segment");
  }
  if (path.posix.normalize(normalized) !== normalized) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key must already be normalized");
  }
  const resolvedRoot = path.resolve(uploadsRoot);
  const resolved = path.resolve(resolvedRoot, ...normalized.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key escapes uploads root");
  }
  return resolved;
}

export async function resolveExistingAudioStoragePath(uploadsRoot: string, storageKey: string) {
  const resolved = resolveAudioStoragePath(uploadsRoot, storageKey);
  const realRoot = await fsp.realpath(uploadsRoot);
  let current = uploadsRoot;

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

export function parseAudioByteRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
  let start: number;
  let end: number;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
    }
    end = Math.min(end, size - 1);
  } else {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new AppError(416, "INVALID_RANGE", "Invalid audio byte range");
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }
  return { start, end };
}

export function sanitizeContentDispositionFilename(originalFilename: string) {
  const normalized = originalFilename.normalize("NFC").replace(/[\r\n\0]/g, "").trim();
  const safe = normalized.replace(/["\\/]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 150) || "audio";
  const utf8Name = normalized.slice(0, 255) || "audio";
  const encoded = encodeURIComponent(utf8Name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return { safe, encoded };
}

export function buildContentDispositionHeader(originalFilename: string, disposition: "inline" | "attachment") {
  const { safe, encoded } = sanitizeContentDispositionFilename(originalFilename);
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function sendLocalAudioResponse(args: {
  req: Request;
  res: Response;
  next: NextFunction;
  uploadsRoot: string;
  storageKey: string;
  mimeType: string;
  originalFilename: string;
  disposition: "inline" | "attachment";
  missingErrorCode: string;
  missingErrorMessage: string;
  streamErrorCode: string;
  streamErrorMessage: string;
  logContext: Record<string, string>;
}) {
  let storedPath: string;
  let stat;
  try {
    storedPath = await resolveExistingAudioStoragePath(args.uploadsRoot, args.storageKey);
    stat = await fsp.stat(storedPath);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new AppError(404, args.missingErrorCode, args.missingErrorMessage);
    throw new AppError(503, args.streamErrorCode, args.streamErrorMessage);
  }
  if (!stat.isFile() || stat.size < 1) {
    throw new AppError(404, args.missingErrorCode, args.missingErrorMessage);
  }

  let range;
  try {
    range = parseAudioByteRange(args.req.headers.range, stat.size);
  } catch (error) {
    args.res.setHeader("Content-Range", `bytes */${stat.size}`);
    throw error;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? stat.size - 1;
  const contentLength = end - start + 1;
  args.res.status(range ? 206 : 200);
  args.res.setHeader("Accept-Ranges", "bytes");
  args.res.setHeader("Content-Length", String(contentLength));
  args.res.setHeader("Content-Type", args.mimeType);
  args.res.setHeader("Content-Disposition", buildContentDispositionHeader(args.originalFilename, args.disposition));
  args.res.setHeader("Cache-Control", "private, no-store");
  if (range) args.res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  if (args.req.method === "HEAD") {
    args.res.end();
    return;
  }

  const stream = fs.createReadStream(storedPath, { start, end });
  args.req.once("aborted", () => stream.destroy());
  args.res.once("close", () => stream.destroy());
  stream.once("error", () => {
    console.error("Audio stream failed", args.logContext);
    if (!args.res.headersSent) args.next(new AppError(503, args.streamErrorCode, args.streamErrorMessage));
    else args.res.destroy();
  });
  stream.pipe(args.res);
}
