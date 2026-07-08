import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

export function serializePrivatePublication(publication: PublicationWithRelations) {
  const streamUrl = canExposePublicWorkAsset(publication.selectedAsset)
    ? buildPublicWorkStreamPath(publication.slug)
    : null;
  const downloadUrl = canExposePublicWorkAsset(publication.selectedAsset)
    ? buildPublicWorkDownloadPath(publication.slug)
    : null;

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
    publicUrl: buildPublicWorkPath(publication.slug),
    streamUrl,
    downloadUrl,
    publishedAt: publication.publishedAt.toISOString(),
    archivedAt: publication.archivedAt?.toISOString() ?? null,
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
    author: serializeAuthor(publication.author),
    lyrics: serializePublicationLyrics(publication.snapshot),
  };
}

export function serializePublicWork(publication: PublicationWithRelations) {
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
    author: serializeAuthor(publication.author),
    lyrics: serializePublicationLyrics(publication.snapshot),
    audio: canExposePublicWorkAsset(publication.selectedAsset)
      ? {
          originalFilename: publication.selectedAsset.originalFilename,
          mimeType: publication.selectedAsset.mimeType,
          sizeBytes: publication.selectedAsset.sizeBytes,
          durationMs: publication.selectedAsset.durationMs,
          streamUrl: buildPublicWorkStreamPath(publication.slug),
          downloadUrl: buildPublicWorkDownloadPath(publication.slug),
        }
      : null,
  };
}
