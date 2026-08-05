import path from "node:path";
import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getConfig } from "../config";
import { prisma } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { sendLocalAudioResponse } from "../services/audioDelivery";
import { recordActivityEvent } from "../services/activity";
import { createTargetedNotifications } from "../services/notifications";
import {
  buildPublicationSlug,
  canExposePublicWorkAsset,
  publicationInclude,
  serializePrivatePublication,
  serializePublicWork,
  likePublication,
  unlikePublication,
  incrementPublicationPlay,
} from "../services/publications";
import { readTrackLyrics, structuredVersionWriteData } from "../services/structuredLyrics";
import { ensureVerifiedForProtectedWrite, resolveProjectTrackAccess } from "../services/stage3Access";
import {
  createWorkPublicationSchema,
  createCollabPublicationSchema,
  createProjectJoinRequestSchema,
  publicationIdParamsSchema,
  publicationSlugParamsSchema,
} from "../schemas/publications";

const publicationRouter = Router();
const publicPublicationRouter = Router();
publicPublicationRouter.use(optionalAuth);

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
  allowDownload?: boolean;
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
          select: {
            id: true,
            title: true,
            projectId: true,
            lyrics: true,
            lyricsDocument: true,
            lyricsPlainText: true,
          },
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

        const preparedLyrics = readTrackLyrics(track);
        const publicationLyricVersion = await tx.lyricVersion.create({
          data: {
            trackId: track.id,
            ...structuredVersionWriteData(preparedLyrics),
            authorId: payload.authorUserId,
            label: "Publication snapshot",
          },
        });

        const publicationTitle = payload.title?.trim() || track.title;
        const snapshot = await tx.trackSnapshot.create({
          data: {
            trackId: track.id,
            title: publicationTitle,
            lyricVersionId: publicationLyricVersion.id,
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
            metadata: {
              allowDownload: payload.allowDownload !== false,
            },
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

async function createPublishedCollab(payload: {
  authorUserId: string;
  projectId: string;
  trackId: string;
  allowDownload?: boolean;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  language?: string;
  budget?: string;
  terms?: string;
  rolesNeeded?: string[];
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const track = await tx.track.findFirst({
          where: { id: payload.trackId, projectId: payload.projectId },
          select: {
            id: true,
            title: true,
            projectId: true,
            lyrics: true,
            lyricsDocument: true,
            lyricsPlainText: true,
          },
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
          throw new AppError(409, "PUBLICATION_ASSET_REQUIRED", "A ready local TrackAsset is required for a public collab");
        }

        const preparedLyrics = readTrackLyrics(track);
        const publicationLyricVersion = await tx.lyricVersion.create({
          data: {
            trackId: track.id,
            ...structuredVersionWriteData(preparedLyrics),
            authorId: payload.authorUserId,
            label: "Publication snapshot",
          },
        });

        const publicationTitle = payload.title?.trim() || track.title;
        const snapshot = await tx.trackSnapshot.create({
          data: {
            trackId: track.id,
            title: publicationTitle,
            lyricVersionId: publicationLyricVersion.id,
            metadata: { publication: true },
            assets: {
              create: [{ trackAssetId: asset.id }],
            },
          },
        });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiration

        const collabDetails = {
          budget: payload.budget?.trim() || null,
          terms: payload.terms?.trim() || null,
          rolesNeeded: payload.rolesNeeded ?? [],
        };

        return await tx.publication.create({
          data: {
            kind: "COLLAB",
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
            expiresAt,
            metadata: {
              allowDownload: payload.allowDownload !== false,
              collabDetails,
            },
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

async function getPublicWorkOrThrow(slug: string, viewerId?: string | null) {
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

  if (viewerId && publication.authorUserId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: publication.authorUserId },
          { blockerId: publication.authorUserId, blockedId: viewerId },
        ],
      },
    });
    if (block) {
      throw new AppError(403, "USER_BLOCKED", "Access denied due to a user block");
    }
  }

  return publication;
}

async function getPublicCollabOrThrow(slug: string, viewerId?: string | null) {
  const publication = await prisma.publication.findFirst({
    where: {
      slug,
      kind: "COLLAB",
      status: "PUBLISHED",
      archivedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: publicationInclude,
  });

  if (!publication) {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "Public collab not found or expired");
  }

  if (viewerId && publication.authorUserId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: publication.authorUserId },
          { blockerId: publication.authorUserId, blockedId: viewerId },
        ],
      },
    });
    if (block) {
      throw new AppError(403, "USER_BLOCKED", "Access denied due to a user block");
    }
  }

  return publication;
}

async function createProjectJoinRequestFromPublication(args: {
  slug: string;
  requesterId: string;
  requesterDisplayName: string;
  requestedRole: "viewer" | "editor";
  message: string | null;
  kind: "WORK" | "COLLAB";
}) {
  const publication = args.kind === "WORK"
    ? await getPublicWorkOrThrow(args.slug, args.requesterId)
    : await getPublicCollabOrThrow(args.slug, args.requesterId);

  if (publication.authorUserId === args.requesterId) {
    throw new AppError(409, "JOIN_REQUEST_SELF_FORBIDDEN", "You are already the author of this project");
  }

  const isMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: publication.projectId,
        userId: args.requesterId,
      },
    },
    select: { id: true },
  });

  if (isMember) {
    throw new AppError(409, "ALREADY_PROJECT_MEMBER", "You are already a project member");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.projectJoinRequest.findUnique({
      where: {
        projectId_requesterId: {
          projectId: publication.projectId,
          requesterId: args.requesterId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "PENDING") {
      throw new AppError(409, "JOIN_REQUEST_ALREADY_PENDING", "Join request is already pending");
    }

    const request = existing
      ? await tx.projectJoinRequest.update({
        where: { id: existing.id },
        data: {
          publicationId: publication.id,
          requestedRole: args.requestedRole,
          message: args.message,
          status: "PENDING",
          reviewedById: null,
          reviewedAt: null,
          decisionReason: null,
        },
      })
      : await tx.projectJoinRequest.create({
        data: {
          projectId: publication.projectId,
          requesterId: args.requesterId,
          publicationId: publication.id,
          requestedRole: args.requestedRole,
          message: args.message,
          status: "PENDING",
        },
      });

    const ownerIds = await tx.projectMember.findMany({
      where: { projectId: publication.projectId, role: "owner" },
      select: { userId: true },
    });

    await createTargetedNotifications(tx, {
      projectId: publication.projectId,
      trackId: publication.trackId,
      actorId: args.requesterId,
      actorName: args.requesterDisplayName,
      type: "project_join_request",
      message: `просит доступ в проект \"${publication.project.title}\"`,
      userIds: ownerIds.map((owner) => owner.userId),
    });

    await recordActivityEvent(tx, {
      projectId: publication.projectId,
      actorId: args.requesterId,
      type: "project_join_requested",
      payload: {
        requestId: request.id,
        requestedRole: request.requestedRole,
        publicationId: publication.id,
        publicationKind: publication.kind,
        publicationSlug: publication.slug,
      },
    });

    return request;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const streamPublicWorkHandler = asyncHandler(async (req, res, next) => {
  const { slug } = publicationSlugParamsSchema.parse(req.params);
  const publication = await getPublicWorkOrThrow(slug, req.user?.id);
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

const streamPublicCollabHandler = asyncHandler(async (req, res, next) => {
  const { slug } = publicationSlugParamsSchema.parse(req.params);
  const publication = await getPublicCollabOrThrow(slug, req.user?.id);
  const asset = publication.selectedAsset;
  if (!canExposePublicWorkAsset(asset)) {
    throw new AppError(409, "PUBLICATION_AUDIO_UNAVAILABLE", "Published collab audio is unavailable");
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
    missingErrorMessage: "Published collab audio file not found",
    streamErrorCode: "PUBLICATION_AUDIO_STREAM_FAILED",
    streamErrorMessage: "Published collab audio stream failed",
    logContext: { slug: publication.slug, publicationId: publication.id, assetId: asset.id },
  });
});

publicationRouter.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const userPubs = await prisma.publication.findMany({
      where: { authorUserId: user.id },
      select: { id: true, title: true, playCount: true, likeCount: true }
    });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    const plays = await prisma.publicationPlay.findMany({
      where: {
        publication: { authorUserId: user.id },
        createdAt: { gte: startDate }
      },
      select: { publicationId: true, createdAt: true }
    });

    const likes = await prisma.publicationLike.findMany({
      where: {
        publication: { authorUserId: user.id },
        createdAt: { gte: startDate }
      },
      select: { publicationId: true, createdAt: true }
    });

    const dailyData: Record<string, { date: string; plays: number; likes: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyData[dateStr] = { date: dateStr, plays: 0, likes: 0 };
    }

    for (const play of plays) {
      const dateStr = play.createdAt.toISOString().split("T")[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].plays += 1;
      }
    }

    for (const like of likes) {
      const dateStr = like.createdAt.toISOString().split("T")[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].likes += 1;
      }
    }

    const byDate = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    let totalPlays = 0;
    let totalLikes = 0;
    for (const pub of userPubs) {
      totalPlays += pub.playCount;
      totalLikes += pub.likeCount;
    }

    res.json({
      totalPlays,
      totalLikes,
      byDate,
      publications: userPubs.map(pub => ({
        id: pub.id,
        title: pub.title,
        plays: pub.playCount,
        likes: pub.likeCount
      }))
    });
  })
);

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

    res.json({ publications: publications.map(p => serializePrivatePublication(p)) });
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
      allowDownload: input.allowDownload,
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
  "/collabs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    const input = createCollabPublicationSchema.parse(req.body);
    await requirePublicationEditorAccess({
      userId: user.id,
      role: user.role,
      projectId: input.projectId,
      trackId: input.trackId,
      breakGlassProjectId: req.session.breakGlassProjectId,
    });

    const publication = await createPublishedCollab({
      authorUserId: user.id,
      projectId: input.projectId,
      trackId: input.trackId,
      allowDownload: input.allowDownload,
      title: input.title,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      tags: input.tags,
      language: input.language,
      budget: input.budget,
      terms: input.terms,
      rolesNeeded: input.rolesNeeded,
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
    const publication = await getPublicWorkOrThrow(slug, req.user?.id);
    let hasLiked = false;
    if (req.user) {
      const like = await prisma.publicationLike.findUnique({
        where: { publicationId_userId: { publicationId: publication.id, userId: req.user.id } }
      });
      hasLiked = !!like;
    }
    res.json({ work: serializePublicWork(publication, hasLiked) });
  }),
);

publicPublicationRouter.post(
  "/works/:slug/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await likePublication(slug, req.user!.id);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.delete(
  "/works/:slug/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await unlikePublication(slug, req.user!.id);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.post(
  "/works/:slug/play",
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await incrementPublicationPlay(slug);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.post(
  "/works/:slug/join-request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    const input = createProjectJoinRequestSchema.parse(req.body ?? {});

    const request = await createProjectJoinRequestFromPublication({
      slug,
      requesterId: user.id,
      requesterDisplayName: user.displayName,
      requestedRole: input.requestedRole ?? "viewer",
      message: input.message?.trim() ? input.message.trim() : null,
      kind: "WORK",
    });

    res.status(201).json({
      request: {
        id: request.id,
        projectId: request.projectId,
        status: request.status,
        requestedRole: request.requestedRole,
        message: request.message,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      },
    });
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

publicPublicationRouter.get(
  "/collabs/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    const publication = await getPublicCollabOrThrow(slug, req.user?.id);
    let hasLiked = false;
    if (req.user) {
      const like = await prisma.publicationLike.findUnique({
        where: { publicationId_userId: { publicationId: publication.id, userId: req.user.id } }
      });
      hasLiked = !!like;
    }
    res.json({ collab: serializePublicWork(publication, hasLiked) });
  }),
);

publicPublicationRouter.post(
  "/collabs/:slug/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await likePublication(slug, req.user!.id);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.delete(
  "/collabs/:slug/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await unlikePublication(slug, req.user!.id);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.post(
  "/collabs/:slug/play",
  asyncHandler(async (req, res) => {
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    await incrementPublicationPlay(slug);
    res.json({ ok: true });
  }),
);

publicPublicationRouter.post(
  "/collabs/:slug/join-request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { slug } = publicationSlugParamsSchema.parse(req.params);
    const input = createProjectJoinRequestSchema.parse(req.body ?? {});

    const request = await createProjectJoinRequestFromPublication({
      slug,
      requesterId: user.id,
      requesterDisplayName: user.displayName,
      requestedRole: input.requestedRole ?? "viewer",
      message: input.message?.trim() ? input.message.trim() : null,
      kind: "COLLAB",
    });

    res.status(201).json({
      request: {
        id: request.id,
        projectId: request.projectId,
        status: request.status,
        requestedRole: request.requestedRole,
        message: request.message,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      },
    });
  }),
);

publicPublicationRouter.head(
  "/collabs/:slug/stream",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    next();
  },
  streamPublicCollabHandler,
);

publicPublicationRouter.get(
  "/collabs/:slug/stream",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    next();
  },
  streamPublicCollabHandler,
);

publicPublicationRouter.get(
  "/collabs/:slug/download",
  (req, _res, next) => {
    publicationSlugParamsSchema.parse(req.params);
    req.query.download = "1";
    next();
  },
  streamPublicCollabHandler,
);

export { publicationRouter, publicPublicationRouter };

