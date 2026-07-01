import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, type ProjectRole } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireProjectEditor, requireProjectMember, requireProjectOwner } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import {
  addMemberSchema,
  createProjectSchema,
  memberParamsSchema,
  projectParamsSchema,
  updateMemberRoleSchema,
  updateProjectSchema,
} from "../schemas/projects";
import { createLyricVersionSchema, createTrackSchema, trackParamsSchema, updateTrackSchema, versionParamsSchema } from "../schemas/tracks";
import { serializeLyricVersion, serializeProject, serializeProjectMember, serializeTrack, trackRelationsInclude } from "../serializers/projects";

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

async function assertOwnerWouldRemain(tx: Prisma.TransactionClient, projectId: string, ignoredUserId?: string) {
  const ownerCount = await tx.projectMember.count({
    where: {
      projectId,
      role: "owner",
      ...(ignoredUserId ? { NOT: { userId: ignoredUserId } } : {}),
    },
  });
  if (ownerCount < 1) {
    throw new AppError(409, "LAST_OWNER", "Project must keep at least one owner");
  }
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const projects = await prisma.project.findMany({
      where:
        user.role === "admin"
          ? undefined
          : {
              members: {
                some: { userId: user.id },
              },
            },
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
    });

    res.json(projects.map(serializeProject));
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

    res.status(201).json(serializeProject(project));
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
    const { projectId } = projectParamsSchema.parse(req.params);
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    res.json(serializeProject(project));
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
    res.json(serializeProject(project));
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
    // TODO Stage 3C: delete or orphan physical audio files after audio storage is migrated.
    await prisma.project.delete({ where: { id: projectId } });
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
  asyncHandler(async (req, res) => {
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = addMemberSchema.parse(req.body);
    const identifier = normalizeIdentifier(input.identifier);

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
        if (existing.role === "owner" && input.role !== "owner") {
          await assertOwnerWouldRemain(tx, projectId, userId);
        }
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
        if (existing.role === "owner") await assertOwnerWouldRemain(tx, projectId, userId);
        await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

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
        if (existing.role === "owner") await assertOwnerWouldRemain(tx, projectId, user.id);
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
    const user = requireCurrentUser(req);
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createTrackSchema.parse(req.body);
    const lyrics = input.lyrics ?? "";

    const track = await prisma.$transaction(async (tx) => {
      const created = await tx.track.create({
        data: {
          projectId,
          title: input.title,
          lyrics,
          tags: input.tags ?? [],
        },
      });
      if (lyrics.trim()) {
        await tx.lyricVersion.create({
          data: {
            trackId: created.id,
            lyrics,
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
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = updateTrackSchema.parse(req.body);

    const track = await prisma.$transaction(async (tx) => {
      const existing = await tx.track.findFirst({ where: { id: trackId, projectId } });
      if (!existing) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      const lyricsChanged = input.lyrics !== undefined && input.lyrics !== existing.lyrics;
      const updated = await tx.track.update({
        where: { id: trackId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
        },
      });

      if (lyricsChanged) {
        await tx.lyricVersion.create({
          data: {
            trackId,
            lyrics: input.lyrics ?? "",
            authorId: user.id,
            label: input.versionLabel ?? "Lyrics update",
          },
        });
      }

      return tx.track.findUniqueOrThrow({
        where: { id: updated.id },
        include: trackRelationsInclude,
      });
    });

    res.json(serializeTrack(track));
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
    // TODO Stage 3C: delete or orphan physical audio files after audio storage is migrated.
    await prisma.track.delete({ where: { id: trackId } });
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
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackParamsSchema.parse(req.params);
    const input = createLyricVersionSchema.parse(req.body);
    await getTrackOrThrow(projectId, trackId);
    const version = await prisma.lyricVersion.create({
      data: { trackId, lyrics: input.lyrics, label: input.label, authorId: user.id },
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

export default router;
