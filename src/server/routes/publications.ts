import path from "node:path";
import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getConfig } from "../config";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { sendLocalAudioResponse } from "../services/audioDelivery";
import {
  buildPublicationSlug,
  canExposePublicWorkAsset,
  publicationInclude,
  serializePrivatePublication,
  serializePublicWork,
} from "../services/publications";
import { ensureVerifiedForProtectedWrite, resolveProjectTrackAccess } from "../services/stage3Access";
import { createWorkPublicationSchema, publicationIdParamsSchema, publicationSlugParamsSchema } from "../schemas/publications";

const publicationRouter = Router();
const publicPublicationRouter = Router();

const UPLOADS_ROOT = path.resolve(getConfig().UPLOADS_DIR);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

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

async function requirePublicationEditorAccess(args: { userId: string; role: "admin" | "user"; projectId: string; trackId: string; breakGlassProjectId?: string }) {
  const access = await resolveProjectTrackAccess({
    prisma,
    user: { id: args.userId, role: args.role },
    projectId: args.projectId,
    trackId: args.trackId,
    breakGlassProjectId: args.breakGlassProjectId,
  });
  if (!access) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
  if (access.role === "viewer") {
    throw new AppError(403, "FORBIDDEN", "Project editor access required");
  }
  return access;
}

async function createPublishedWork(payload: {
  authorUserId: string;
  projectId: string;
  trackId: string;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  language?: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const track = await tx.track.findFirst({
          where: { id: payload.trackId, projectId: payload.projectId },
          select: { id: true, title: true, projectId: true },
        });
        if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

        const asset = await tx.trackAsset.findFirst({
          where: {
            trackId: track.id,
            projectId: payload.projectId,
            deletedAt: null,
            status: "READY",
            storageProvider: "local",
            storageKey: { not: null },
            mimeType: { startsWith: "audio/" },
            externalUrl: null,
            kind: { in: ["MASTER", "AUDIO_VERSION", "INSTRUMENTAL", "ACAPELLA", "STEM", "DEMO", "REFERENCE"] },
          },
          orderBy: [
            { isPrimary: "desc" },
            { versionNumber: "desc" },
            { createdAt: "desc" },
            { id: "asc" },
          ],
        });
        if (!asset) {
          throw new AppError(409, "PUBLICATION_ASSET_REQUIRED", "A ready local TrackAsset is required for a public work");
        }

        const latestLyricVersion = await tx.lyricVersion.findFirst({
          where: { trackId: track.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        const publicationTitle = payload.title?.trim() || track.title;
        const snapshot = await tx.trackSnapshot.create({
          data: {
            trackId: track.id,
            title: publicationTitle,
            lyricVersionId: latestLyricVersion?.id ?? null,
            metadata: { publication: true },
            assets: {
              create: [{ trackAssetId: asset.id }],
            },
          },
        });

        return await tx.publication.create({
          data: {
            kind: "WORK",
            status: "PUBLISHED",
            slug: buildPublicationSlug(publicationTitle),
            authorUserId: payload.authorUserId,
            projectId: payload.projectId,
            trackId: track.id,
            snapshotId: snapshot.id,
            selectedAssetId: asset.id,
            title: publicationTitle,
            description: payload.description?.trim() ? payload.description.trim() : null,
            coverImageUrl: payload.coverImageUrl?.trim() ? payload.coverImageUrl.trim() : null,
            tags: payload.tags ?? [],
            language: payload.language?.trim() ? payload.language.trim() : null,
            metadata: {},
          },
          include: publicationInclude,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }

  throw new AppError(409, "PUBLICATION_CONFLICT", "Could not allocate a unique publication slug");
}

async function getPublicWorkOrThrow(slug: string) {
  const publication = await prisma.publication.findFirst({
    where: {
      slug,
      kind: "WORK",
      status: "PUBLISHED",
      archivedAt: null,
    },
    include: publicationInclude,
  });

  if (!publication) {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "Public work not found");
  }

  return publication;
}

const streamPublicWorkHandler = asyncHandler(async (req, res, next) => {
  const { slug } = publicationSlugParamsSchema.parse(req.params);
  const publication = await getPublicWorkOrThrow(slug);
  const asset = publication.selectedAsset;
  if (!canExposePublicWorkAsset(asset)) {
    throw new AppError(409, "PUBLICATION_AUDIO_UNAVAILABLE", "Published work audio is unavailable");
  }

  await sendLocalAudioResponse({
    req,
    res,
    next,
    uploadsRoot: UPLOADS_ROOT,
    storageKey: asset.storageKey!,
    mimeType: asset.mimeType!,
    originalFilename: asset.originalFilename,
    disposition: req.query.download === "1" ? "attachment" : "inline",
    missingErrorCode: "PUBLICATION_AUDIO_NOT_FOUND",
    missingErrorMessage: "Published work audio file not found",
    streamErrorCode: "PUBLICATION_AUDIO_STREAM_FAILED",
    streamErrorMessage: "Published work audio stream failed",
    logContext: { slug: publication.slug, publicationId: publication.id, assetId: asset.id },
  });
});

publicationRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const publications = await prisma.publication.findMany({
      where: {
        project: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: publicationInclude,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });

    res.json({ publications: publications.map(serializePrivatePublication) });
  }),
);

publicationRouter.post(
  "/works",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const input = createWorkPublicationSchema.parse(req.body);
    await requirePublicationEditorAccess({
      userId: user.id,
      role: user.role,
      projectId: input.projectId,
      trackId: input.trackId,
      breakGlassProjectId: req.session.breakGlassProjectId,
    });

    const publication = await createPublishedWork({
      authorUserId: user.id,
      projectId: input.projectId,
      trackId: input.trackId,
      title: input.title,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      tags: input.tags,
      language: input.language,
    });

    res.status(201).json({ publication: serializePrivatePublication(publication) });
  }),
);

publicationRouter.post(
  "/:publicationId/archive",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const { publicationId } = publicationIdParamsSchema.parse(req.params);
    const current = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { id: true, projectId: true, trackId: true, status: true },
    });
    if (!current) throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");

    await requirePublicationEditorAccess({
      userId: user.id,
      role: user.role,
      projectId: current.projectId,
      trackId: current.trackId,
      breakGlassProjectId: req.session.breakGlassProjectId,
    });

    const publication = await prisma.publication.update({
      where: { id: publicationId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
      include: publicationInclude,
    });

    res.json({ publication: serializePrivatePublication(publication) });
  }),
);

publicPublicationRouter.get(
  "/works/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    const publication = await getPublicWorkOrThrow(slug);
    res.json({ work: serializePublicWork(publication) });
  }),
);

publicPublicationRouter.head(
  "/works/:slug/stream",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    next();
  },
  streamPublicWorkHandler,
);

publicPublicationRouter.get(
  "/works/:slug/stream",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    next();
  },
  streamPublicWorkHandler,
);

publicPublicationRouter.get(
  "/works/:slug/download",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    req.query.download = "1";
    next();
  },
  streamPublicWorkHandler,
);

export { publicationRouter, publicPublicationRouter };

