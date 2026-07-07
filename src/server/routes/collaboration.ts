import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireProjectEditor } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import {
  commentParamsSchema,
  createAnnotationSchema,
  createChatMessageSchema,
  createCommentSchema,
  createLyricsDiscussionMessageSchema,
  createLyricsDiscussionThreadSchema,
  createTaskSchema,
  discussionThreadParamsSchema,
  projectTaskParamsSchema,
  reanchorLyricsDiscussionThreadSchema,
  resolveCommentSchema,
  resolveLyricsDiscussionThreadSchema,
  taskParamsSchema,
  trackEntityParamsSchema,
  updateTaskSchema,
} from "../schemas/collaboration";
import { projectParamsSchema } from "../schemas/projects";
import {
  collaborationUserSelect,
  serializeAnnotation,
  serializeChatMessage,
  serializeComment,
  serializeProjectChatMessage,
  serializeProjectTask,
  serializeTask,
} from "../serializers/collaboration";
import { discussionThreadInclude, serializeLyricsDiscussionThread } from "../serializers/discussions";
import { recordActivityEvent } from "../services/activity";
import { createProjectMemberNotifications, createTargetedNotifications } from "../services/notifications";
import { ensureVerifiedForProtectedWrite } from "../services/stage3Access";
import { readTrackLyrics } from "../services/structuredLyrics";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

const commentInclude = {
  author: { select: collaborationUserSelect },
  resolvedBy: { select: collaborationUserSelect },
} as const;

const chatInclude = {
  author: { select: collaborationUserSelect },
} as const;

const taskInclude = {
  createdBy: { select: collaborationUserSelect },
  assignedTo: { select: collaborationUserSelect },
} as const;

const annotationInclude = {
  author: { select: collaborationUserSelect },
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

function validateTrackParams(req: Request, _res: Response, next: NextFunction) {
  trackEntityParamsSchema.parse(req.params);
  next();
}

async function requireTrack(projectId: string, trackId: string) {
  const track = await prisma.track.findFirst({
    where: { id: trackId, projectId },
    select: { id: true, title: true },
  });
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
  return track;
}

type CollaborationDb = Prisma.TransactionClient | typeof prisma;

async function resolveAssignee(db: CollaborationDb, projectId: string, assignedToId?: string | null, assignedTo?: string | null) {
  if (assignedToId !== undefined) {
    if (assignedToId === null) return null;
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assignedToId } },
      select: { userId: true },
    });
    if (!member) throw new AppError(400, "INVALID_ASSIGNEE", "Assignee must be a project member");
    return member.userId;
  }
  if (assignedTo === undefined) return undefined;
  if (assignedTo === null) return null;

  const identifier = assignedTo.trim();
  const matches = await db.projectMember.findMany({
    where: {
      projectId,
      user: {
        OR: [{ username: identifier.toLowerCase() }, { displayName: identifier }],
      },
    },
    select: { userId: true },
    take: 2,
  });
  if (matches.length === 0) throw new AppError(400, "INVALID_ASSIGNEE", "Assignee must be a project member");
  if (matches.length > 1) throw new AppError(409, "AMBIGUOUS_ASSIGNEE", "Assignee identifier is ambiguous");
  return matches[0].userId;
}

router.post(
  "/:projectId/tracks/:trackId/comments",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createCommentSchema.parse(req.body);

    const comment = await prisma.$transaction(async (tx) => {
      const track = await tx.track.findFirst({ where: { id: trackId, projectId }, select: { id: true, title: true } });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      const created = await tx.comment.create({
        data: {
          trackId,
          authorId: user.id,
          text: input.text,
          lineIndex: input.lineIndex ?? null,
          mentions: input.mentions ?? [],
        },
        include: commentInclude,
      });

      const preview = input.text.length > 80 ? `${input.text.slice(0, 80)}...` : input.text;
      await createProjectMemberNotifications(tx, {
        projectId,
        trackId,
        actorId: user.id,
        actorName: user.displayName,
        type: "comment_created",
        message: `left a comment: \"${preview}\"`,
      });

      if (input.mentions && input.mentions.length > 0) {
        await createTargetedNotifications(tx, {
          projectId,
          trackId,
          actorId: user.id,
          actorName: user.displayName,
          type: "comment_mention",
          message: `mentioned you in a comment: \"${preview}\"`,
          userIds: input.mentions,
        });
      }

      await recordActivityEvent(tx, {
        projectId,
        actorId: user.id,
        type: "comment_created",
        payload: {
          trackId,
          trackTitle: track.title,
          commentId: created.id,
          lineIndex: created.lineIndex,
          preview,
        },
      });
      return created;
    });

    res.status(201).json(serializeComment(comment));
  }),
);

router.put(
  "/:projectId/tracks/:trackId/comments/:commentId/resolve",
  (req, _res, next) => {
    commentParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId, commentId } = commentParamsSchema.parse(req.params);
    const input = resolveCommentSchema.parse(req.body ?? {});
    const comment = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.comment.findFirst({
          where: { id: commentId, trackId, track: { projectId } },
          select: { id: true, resolved: true, lineIndex: true, track: { select: { title: true } } },
        });
        if (!existing) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");

        const resolved = input.resolved ?? !existing.resolved;
        const updated = await tx.comment.update({
          where: { id: commentId },
          data: {
            resolved,
            resolvedById: resolved ? user.id : null,
            resolvedAt: resolved ? new Date() : null,
          },
          include: commentInclude,
        });
        await recordActivityEvent(tx, {
          projectId,
          actorId: user.id,
          type: "comment_resolved",
          payload: {
            trackId,
            trackTitle: existing.track.title,
            commentId,
            lineIndex: existing.lineIndex,
            resolved,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.json(serializeComment(comment));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/discussions/threads",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createLyricsDiscussionThreadSchema.parse(req.body);

    const thread = await prisma.$transaction(async (tx) => {
      const track = await tx.track.findFirst({
        where: { id: trackId, projectId },
        select: { id: true, lyrics: true, lyricsDocument: true, lyricsPlainText: true, lyricsRevision: true },
      });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      if (input.anchor) {
        const document = readTrackLyrics(track).document;
        if (!document.blocks.some((block) => block.id === input.anchor.blockId)) {
          throw new AppError(400, "INVALID_ANCHOR_BLOCK", "Anchor block does not exist in the current lyrics document");
        }
      }

      return tx.discussionThread.create({
        data: {
          projectId,
          trackId,
          createdById: user.id,
          sourceLyricsRevision: track.lyricsRevision,
          anchorBlockId: input.anchor?.blockId ?? null,
          anchorStartOffsetHint: input.anchor?.startOffsetHint ?? null,
          anchorEndOffsetHint: input.anchor?.endOffsetHint ?? null,
          anchorQuote: input.anchor?.quote ?? null,
          anchorPrefix: input.anchor?.prefix ?? null,
          anchorSuffix: input.anchor?.suffix ?? null,
          messages: {
            create: {
              authorId: user.id,
              body: input.body,
            },
          },
        },
        include: discussionThreadInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(201).json(serializeLyricsDiscussionThread(thread, readTrackLyrics(await prisma.track.findUniqueOrThrow({ where: { id: thread.trackId } })).document));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/discussions/threads/:threadId/messages",
  (req, _res, next) => {
    discussionThreadParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId, threadId } = discussionThreadParamsSchema.parse(req.params);
    const input = createLyricsDiscussionMessageSchema.parse(req.body);

    const thread = await prisma.$transaction(async (tx) => {
      const existing = await tx.discussionThread.findFirst({
        where: { id: threadId, projectId, trackId },
        select: { id: true },
      });
      if (!existing) throw new AppError(404, "DISCUSSION_THREAD_NOT_FOUND", "Discussion thread not found");

      await tx.discussionMessage.create({
        data: {
          threadId,
          authorId: user.id,
          body: input.body,
          mentions: input.mentions ?? [],
        },
      });

      return tx.discussionThread.findUniqueOrThrow({
        where: { id: threadId },
        include: discussionThreadInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (input.mentions && input.mentions.length > 0) {
      await prisma.$transaction(async (tx) => {
        const preview = input.body.length > 80 ? `${input.body.slice(0, 80)}...` : input.body;
        await createTargetedNotifications(tx, {
          projectId,
          trackId,
          actorId: user.id,
          actorName: user.displayName,
          type: "discussion_mention",
          message: `mentioned you in a discussion: \"${preview}\"`,
          userIds: input.mentions ?? [],
        });
      });
    }

    res.status(201).json(serializeLyricsDiscussionThread(thread, readTrackLyrics(await prisma.track.findUniqueOrThrow({ where: { id: trackId } })).document));
  }),
);

router.put(
  "/:projectId/tracks/:trackId/discussions/threads/:threadId/resolve",
  (req, _res, next) => {
    discussionThreadParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId, threadId } = discussionThreadParamsSchema.parse(req.params);
    const input = resolveLyricsDiscussionThreadSchema.parse(req.body ?? {});

    const thread = await prisma.$transaction(async (tx) => {
      const existing = await tx.discussionThread.findFirst({
        where: { id: threadId, projectId, trackId },
        select: { id: true, resolvedAt: true },
      });
      if (!existing) throw new AppError(404, "DISCUSSION_THREAD_NOT_FOUND", "Discussion thread not found");
      const resolved = input.resolved ?? !existing.resolvedAt;
      return tx.discussionThread.update({
        where: { id: threadId },
        data: {
          resolvedAt: resolved ? new Date() : null,
          resolvedById: resolved ? user.id : null,
        },
        include: discussionThreadInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json(serializeLyricsDiscussionThread(thread, readTrackLyrics(await prisma.track.findUniqueOrThrow({ where: { id: trackId } })).document));
  }),
);

router.put(
  "/:projectId/tracks/:trackId/discussions/threads/:threadId/reanchor",
  (req, _res, next) => {
    discussionThreadParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId, threadId } = discussionThreadParamsSchema.parse(req.params);
    const input = reanchorLyricsDiscussionThreadSchema.parse(req.body);

    const thread = await prisma.$transaction(async (tx) => {
      const track = await tx.track.findFirst({
        where: { id: trackId, projectId },
        select: { id: true, lyrics: true, lyricsDocument: true, lyricsPlainText: true, lyricsRevision: true },
      });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
      const existing = await tx.discussionThread.findFirst({
        where: { id: threadId, projectId, trackId },
        select: { id: true },
      });
      if (!existing) throw new AppError(404, "DISCUSSION_THREAD_NOT_FOUND", "Discussion thread not found");
      const document = readTrackLyrics(track).document;
      if (!document.blocks.some((block) => block.id === input.blockId)) {
        throw new AppError(400, "INVALID_ANCHOR_BLOCK", "Anchor block does not exist in the current lyrics document");
      }
      return tx.discussionThread.update({
        where: { id: threadId },
        data: {
          anchorBlockId: input.blockId,
          anchorQuote: input.quote ?? null,
          anchorPrefix: input.prefix ?? null,
          anchorSuffix: input.suffix ?? null,
          anchorStartOffsetHint: input.startOffsetHint ?? null,
          anchorEndOffsetHint: input.endOffsetHint ?? null,
          sourceLyricsRevision: track.lyricsRevision,
          resolvedAt: null,
          resolvedById: null,
        },
        include: discussionThreadInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json(serializeLyricsDiscussionThread(thread, readTrackLyrics(await prisma.track.findUniqueOrThrow({ where: { id: trackId } })).document));
  }),
);

router.post(
  "/:projectId/chat",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canChat");
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createChatMessageSchema.parse(req.body);

    const message = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");

      const created = await tx.projectChatMessage.create({
        data: {
          projectId,
          authorId: user.id,
          text: input.text,
          mentions: input.mentions ?? [],
        },
        include: chatInclude,
      });

      const preview = input.text.length > 80 ? `${input.text.slice(0, 80)}...` : input.text;
      await createProjectMemberNotifications(tx, {
        projectId,
        actorId: user.id,
        actorName: user.displayName,
        type: "project_chat_message_created",
        message: `left a project chat message: \"${preview}\"`,
      });

      if (input.mentions && input.mentions.length > 0) {
        await createTargetedNotifications(tx, {
          projectId,
          actorId: user.id,
          actorName: user.displayName,
          type: "project_chat_mention",
          message: `mentioned you in project chat: \"${preview}\"`,
          userIds: input.mentions,
        });
      }

      await recordActivityEvent(tx, {
        projectId,
        actorId: user.id,
        type: "project_chat_message_created",
        payload: {
          messageId: created.id,
          preview,
        },
      });

      return created;
    });

    res.status(201).json(serializeProjectChatMessage(message));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/chat",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canChat");
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createChatMessageSchema.parse(req.body);
    const track = await requireTrack(projectId, trackId);
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { trackId, authorId: user.id, text: input.text, mentions: input.mentions ?? [] },
        include: chatInclude,
      });
      const preview = input.text.length > 80 ? `${input.text.slice(0, 80)}...` : input.text;
      await recordActivityEvent(tx, {
        projectId,
        actorId: user.id,
        type: "track_chat_message_created",
        payload: {
          trackId,
          trackTitle: track.title,
          messageId: created.id,
          preview,
        },
      });

      if (input.mentions && input.mentions.length > 0) {
        await createTargetedNotifications(tx, {
          projectId,
          trackId,
          actorId: user.id,
          actorName: user.displayName,
          type: "track_chat_mention",
          message: `mentioned you in track chat: \"${preview}\"`,
          userIds: input.mentions,
        });
      }

      return created;
    });
    res.status(201).json(serializeChatMessage(message));
  }),
);

router.post(
  "/:projectId/tasks",
  (req, _res, next) => {
    projectParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canCreateTask");
    const { projectId } = projectParamsSchema.parse(req.params);
    const input = createTaskSchema.parse(req.body);

    const task = await prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
        if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        const created = await tx.projectTask.create({
          data: {
            projectId,
            createdById: user.id,
            assignedToId: assignedToId ?? null,
            title: input.title,
            description: input.description ?? null,
          },
          include: taskInclude,
        });
        await recordActivityEvent(tx, {
          projectId,
          actorId: user.id,
          type: "project_task_created",
          payload: {
            taskId: created.id,
            taskTitle: created.title,
            assignedToId: created.assignedToId,
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.status(201).json(serializeProjectTask(task));
  }),
);

router.put(
  "/:projectId/tasks/:taskId",
  (req, _res, next) => {
    projectTaskParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canCreateTask");
    const { projectId, taskId } = projectTaskParamsSchema.parse(req.params);
    const input = updateTaskSchema.parse(req.body);

    const task = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectTask.findFirst({
          where: { id: taskId, projectId },
          select: { id: true },
        });
        if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found");

        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        const updated = await tx.projectTask.update({
          where: { id: taskId },
          data: {
            title: input.title,
            description: input.description,
            status: input.status,
            ...(assignedToId !== undefined ? { assignedToId } : {}),
          },
          include: taskInclude,
        });
        await recordActivityEvent(tx, {
          projectId,
          actorId: user.id,
          type: "project_task_updated",
          payload: {
            taskId: updated.id,
            taskTitle: updated.title,
            status: updated.status,
            assignedToId: updated.assignedToId,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.json(serializeProjectTask(task));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/tasks",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canCreateTask");
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createTaskSchema.parse(req.body);
    const task = await prisma.$transaction(
      async (tx) => {
        const track = await tx.track.findFirst({ where: { id: trackId, projectId }, select: { id: true, title: true } });
        if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        const created = await tx.task.create({
          data: {
            trackId,
            createdById: user.id,
            assignedToId: assignedToId ?? null,
            title: input.title,
            description: input.description ?? null,
          },
          include: taskInclude,
        });
        await recordActivityEvent(tx, {
          projectId,
          actorId: user.id,
          type: "track_task_created",
          payload: {
            trackId,
            trackTitle: track.title,
            taskId: created.id,
            taskTitle: created.title,
            assignedToId: created.assignedToId,
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.status(201).json(serializeTask(task));
  }),
);

router.put(
  "/:projectId/tracks/:trackId/tasks/:taskId",
  (req, _res, next) => {
    taskParamsSchema.parse(req.params);
    next();
  },
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canCreateTask");
    const { projectId, trackId, taskId } = taskParamsSchema.parse(req.params);
    const input = updateTaskSchema.parse(req.body);
    const task = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id: taskId, trackId, track: { projectId } },
          select: { id: true, track: { select: { title: true } } },
        });
        if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found");

        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        const updated = await tx.task.update({
          where: { id: taskId },
          data: {
            title: input.title,
            description: input.description,
            status: input.status,
            ...(assignedToId !== undefined ? { assignedToId } : {}),
          },
          include: taskInclude,
        });
        await recordActivityEvent(tx, {
          projectId,
          actorId: user.id,
          type: "track_task_updated",
          payload: {
            trackId,
            trackTitle: existing.track.title,
            taskId: updated.id,
            taskTitle: updated.title,
            status: updated.status,
            assignedToId: updated.assignedToId,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.json(serializeTask(task));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/annotations",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireVerifiedWriter(req);
    requireCapability(req, "canComment");
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createAnnotationSchema.parse(req.body);
    await requireTrack(projectId, trackId);
    if (input.trackAssetId) {
      const asset = await prisma.trackAsset.findFirst({
        where: {
          id: input.trackAssetId,
          trackId,
          projectId,
          deletedAt: null,
          status: { not: "DELETED" },
        },
        select: { id: true },
      });
      if (!asset) {
        throw new AppError(404, "TRACK_ASSET_NOT_FOUND", "Track asset not found");
      }
    }
    const annotation = await prisma.annotation.create({
      data: {
        trackId,
        trackAssetId: input.trackAssetId ?? null,
        authorId: user.id,
        timestampSeconds: Math.floor(input.timestampSeconds),
        text: input.text,
      },
      include: annotationInclude,
    });
    res.status(201).json(serializeAnnotation(annotation));
  }),
);

export default router;
