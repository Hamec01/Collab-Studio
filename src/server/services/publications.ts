import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../middleware/errors";
import { resolveLyricVersion } from "./structuredLyrics";
import { isTrackAssetKindDeliverable, isTrackAssetStatusDeliverable } from "./audioDelivery";

export const publicationKinds = ["WORK", "COLLAB"] as const;
export const publicationStatuses = ["PUBLISHED", "ARCHIVED"] as const;

export const publicationAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isPublicProfile: true,
} as const;

export const publicationSelectedAssetSelect = {
  id: true,
  trackId: true,
  projectId: true,
  uploadedByUserId: true,
  kind: true,
  status: true,
  title: true,
  originalFilename: true,
  storageKey: true,
  storageProvider: true,
  externalUrl: true,
  externalProvider: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  checksum: true,
  waveformData: true,
  metadata: true,
  sourceAssetId: true,
  legacyAudioVersionId: true,
  versionNumber: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export const publicationInclude = {
  author: { select: publicationAuthorSelect },
  project: { select: { id: true, title: true } },
  track: { select: { id: true, title: true } },
  snapshot: {
    include: {
      lyricVersion: true,
    },
  },
  selectedAsset: { select: publicationSelectedAssetSelect },
} satisfies Prisma.PublicationInclude;

export type PublicationWithRelations = Prisma.PublicationGetPayload<{
  include: typeof publicationInclude;
}>;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "work";
}

export function buildPublicationSlug(title: string) {
  return `${slugify(title)}-${randomUUID().slice(0, 8)}`;
}

export function buildPublicWorkPath(slug: string) {
  return `/works/${slug}`;
}

export function buildPublicWorkStreamPath(slug: string) {
  return `/api/public/works/${slug}/stream`;
}

export function buildPublicWorkDownloadPath(slug: string) {
  return `/api/public/works/${slug}/download`;
}

export function canExposePublicWorkAsset(asset: PublicationWithRelations["selectedAsset"]) {
  if (asset.deletedAt) return false;
  if (!isTrackAssetStatusDeliverable(asset.status)) return false;
  if (!isTrackAssetKindDeliverable(asset.kind)) return false;
  if (asset.storageProvider !== "local") return false;
  if (!asset.storageKey || !asset.mimeType || !asset.mimeType.startsWith("audio/")) return false;
  if (asset.externalUrl) return false;
  return true;
}

export function assertPublicationAssetReadyForPublicWork(asset: PublicationWithRelations["selectedAsset"]) {
  if (!canExposePublicWorkAsset(asset)) {
    throw new AppError(409, "PUBLICATION_ASSET_REQUIRED", "A ready local TrackAsset is required for a public work");
  }
}

function serializeAuthor(author: PublicationWithRelations["author"]) {
  if (!author) {
    return {
      displayName: "Deleted user",
      username: null,
      avatarUrl: null,
      publicProfileUrl: null,
    };
  }
  return {
    displayName: author.displayName,
    username: author.isPublicProfile ? author.username : null,
    avatarUrl: author.avatarUrl ?? null,
    publicProfileUrl: author.isPublicProfile ? `/u/${encodeURIComponent(author.username)}` : null,
  };
}

function serializePublicationLyrics(snapshot: PublicationWithRelations["snapshot"]) {
  if (!snapshot.lyricVersion) return null;
  const lyrics = resolveLyricVersion(snapshot.lyricVersion);
  return {
    snapshotId: snapshot.id,
    title: snapshot.title,
    plainText: lyrics.plainText,
  };
}

function extractCollabDetails(publication: PublicationWithRelations) {
  if (publication.kind !== "COLLAB") return undefined;
  const metadata = publication.metadata as Record<string, any> | null;
  if (!metadata || !metadata.collabDetails) return undefined;
  return {
    budget: typeof metadata.collabDetails.budget === "string" ? metadata.collabDetails.budget : null,
    terms: typeof metadata.collabDetails.terms === "string" ? metadata.collabDetails.terms : null,
    rolesNeeded: Array.isArray(metadata.collabDetails.rolesNeeded) ? metadata.collabDetails.rolesNeeded : [],
  };
}

export function serializePrivatePublication(publication: PublicationWithRelations, hasLiked: boolean = false) {
  const isCollab = publication.kind === "COLLAB";
  const streamUrlPath = isCollab ? `/api/public/collabs/${publication.slug}/stream` : buildPublicWorkStreamPath(publication.slug);
  const downloadUrlPath = isCollab ? `/api/public/collabs/${publication.slug}/download` : buildPublicWorkDownloadPath(publication.slug);
  const publicUrlPath = isCollab ? `/collabs/${publication.slug}` : buildPublicWorkPath(publication.slug);

  const streamUrl = canExposePublicWorkAsset(publication.selectedAsset) ? streamUrlPath : null;
  const downloadUrl = canExposePublicWorkAsset(publication.selectedAsset) ? downloadUrlPath : null;

  return {
    id: publication.id,
    kind: publication.kind,
    status: publication.status,
    slug: publication.slug,
    title: publication.title,
    description: publication.description ?? null,
    coverImageUrl: publication.coverImageUrl ?? null,
    tags: publication.tags,
    language: publication.language ?? null,
    projectId: publication.projectId,
    projectTitle: publication.project.title,
    trackId: publication.trackId,
    trackTitle: publication.track.title,
    snapshotId: publication.snapshotId,
    selectedAssetId: publication.selectedAssetId,
    publicUrl: publicUrlPath,
    streamUrl,
    downloadUrl,
    publishedAt: publication.publishedAt.toISOString(),
    archivedAt: publication.archivedAt?.toISOString() ?? null,
    expiresAt: publication.expiresAt?.toISOString() ?? null,
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
    likeCount: publication.likeCount,
    playCount: publication.playCount,
    hasLiked,
    author: serializeAuthor(publication.author),
    lyrics: serializePublicationLyrics(publication.snapshot),
    collabDetails: extractCollabDetails(publication),
  };
}

export function serializePublicWork(publication: PublicationWithRelations, hasLiked: boolean = false) {
  return {
    id: publication.id,
    slug: publication.slug,
    kind: publication.kind,
    title: publication.title,
    description: publication.description ?? null,
    coverImageUrl: publication.coverImageUrl ?? null,
    tags: publication.tags,
    language: publication.language ?? null,
    publishedAt: publication.publishedAt.toISOString(),
    expiresAt: publication.expiresAt?.toISOString() ?? null,
    likeCount: publication.likeCount,
    playCount: publication.playCount,
    hasLiked,
    author: serializeAuthor(publication.author),
    lyrics: serializePublicationLyrics(publication.snapshot),
    collabDetails: extractCollabDetails(publication),
    audio: canExposePublicWorkAsset(publication.selectedAsset)
      ? {
          originalFilename: publication.selectedAsset.originalFilename,
          mimeType: publication.selectedAsset.mimeType,
          sizeBytes: publication.selectedAsset.sizeBytes,
          durationMs: publication.selectedAsset.durationMs,
          streamUrl: publication.kind === "COLLAB" ? `/api/public/collabs/${publication.slug}/stream` : buildPublicWorkStreamPath(publication.slug),
          downloadUrl: publication.kind === "COLLAB" ? `/api/public/collabs/${publication.slug}/download` : buildPublicWorkDownloadPath(publication.slug),
        }
      : null,
  };
}

export async function likePublication(slug: string, userId: string) {
  const publication = await prisma.publication.findUnique({
    where: { slug },
  });
  if (!publication || publication.status !== "PUBLISHED") {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingLike = await tx.publicationLike.findUnique({
        where: { publicationId_userId: { publicationId: publication.id, userId } },
      });
      if (existingLike) return;

      await tx.publicationLike.create({
        data: { publicationId: publication.id, userId },
      });

      await tx.publication.update({
        where: { id: publication.id },
        data: { likeCount: { increment: 1 } },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Ignored
    } else {
      throw err;
    }
  }
}

export async function unlikePublication(slug: string, userId: string) {
  const publication = await prisma.publication.findUnique({
    where: { slug },
  });
  if (!publication || publication.status !== "PUBLISHED") {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");
  }

  await prisma.$transaction(async (tx) => {
    const existingLike = await tx.publicationLike.findUnique({
      where: { publicationId_userId: { publicationId: publication.id, userId } },
    });
    if (!existingLike) return;

    await tx.publicationLike.delete({
      where: { id: existingLike.id },
    });

    await tx.publication.update({
      where: { id: publication.id },
      data: { likeCount: { decrement: 1 } },
    });
  });
}

export async function incrementPublicationPlay(slug: string) {
  const publication = await prisma.publication.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!publication || publication.status !== "PUBLISHED") {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");
  }

  await prisma.publication.update({
    where: { id: publication.id },
    data: { playCount: { increment: 1 } },
  });
}
