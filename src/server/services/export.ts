import * as archiver from "archiver";
import { Writable } from "stream";
import { prisma } from "../db";
import { ReviewStatus } from "@prisma/client";
import { resolveTrackAssetStoragePath } from "./trackAssets";
import * as fsp from "fs/promises";
import * as path from "path";
import { getConfig } from "../config";

const config = getConfig();

export async function isProjectReady(projectId: string) {
  const tracks = await prisma.track.findMany({
    where: { projectId },
    include: {
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (tracks.length === 0) return false;

  return tracks.every((track) => {
    const latestReview = track.reviews[0];
    return latestReview?.status === ReviewStatus.READY;
  });
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9а-яё]/gi, "_").toLowerCase();
}

export async function generateProjectExportStream(projectId: string, outputStream: Writable) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      tracks: {
        include: {
          trackAssets: { where: { isPrimary: true, status: "READY" }, take: 1 },
        },
        orderBy: { createdAt: "asc" }
      },
      members: {
        include: { user: { select: { displayName: true, email: true } } },
      },
    },
  });

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(outputStream);

  const metadata = {
    title: project.title,
    createdAt: project.createdAt,
    members: project.members.map((m) => ({
      role: m.role,
      name: m.user.displayName,
      email: m.user.email,
    })),
    tracks: project.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
    })),
  };

  archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

  for (let i = 0; i < project.tracks.length; i++) {
    const track = project.tracks[i];
    const trackNumber = String(i + 1).padStart(2, "0");
    const trackFolderName = `${trackNumber} - ${sanitizeFilename(track.title)}`;

    const primaryAsset = track.trackAssets[0];
    if (primaryAsset) {
      if (primaryAsset.storageProvider === "local" && primaryAsset.storageKey) {
        const filePath = resolveTrackAssetStoragePath(config.UPLOADS_DIR, primaryAsset.storageKey);
        try {
          await fsp.access(filePath);
          const ext = path.extname(primaryAsset.originalFilename) || ".wav";
          archive.file(filePath, { name: `audio/${trackFolderName}${ext}` });
        } catch {
          archive.append("Audio file is missing from storage.", { name: `audio/${trackFolderName}_ERROR.txt` });
        }
      } else {
        archive.append(`External audio: ${primaryAsset.originalFilename}`, { name: `audio/${trackFolderName}_EXTERNAL.txt` });
      }
    }

    const latestLyricVersion = await prisma.lyricVersion.findFirst({
      where: { trackId: track.id },
      orderBy: { createdAt: "desc" },
    });

    if (latestLyricVersion && latestLyricVersion.plainText) {
      archive.append(latestLyricVersion.plainText, { name: `lyrics/${trackFolderName}.txt` });
    }
  }

  await archive.finalize();
}
