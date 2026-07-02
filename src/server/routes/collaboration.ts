import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireProjectEditor, requireProjectMember } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import {
  commentParamsSchema,
  createAnnotationSchema,
  createChatMessageSchema,
  createCommentSchema,
  createTaskSchema,
  resolveCommentSchema,
  taskParamsSchema,
  trackEntityParamsSchema,
  updateTaskSchema,
} from "../schemas/collaboration";
import {
  collaborationUserSelect,
  serializeAnnotation,
  serializeChatMessage,
  serializeComment,
  serializeTask,
} from "../serializers/collaboration";
import { createProjectMemberNotifications } from "../services/notifications";

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

function validateTrackParams(req: Request, _res: Response, next: NextFunction) {
  trackEntityParamsSchema.parse(req.params);
  next();
}

async function requireTrack(projectId: string, trackId: string) {
  const track = await prisma.track.findFirst({
    where: { id: trackId, projectId },
    select: { id: true },
  });
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
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
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createCommentSchema.parse(req.body);

    const comment = await prisma.$transaction(async (tx) => {
      const track = await tx.track.findFirst({ where: { id: trackId, projectId }, select: { id: true } });
      if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");

      const created = await tx.comment.create({
        data: {
          trackId,
          authorId: user.id,
          text: input.text,
          lineIndex: input.lineIndex ?? null,
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
    const user = requireCurrentUser(req);
    const { projectId, trackId, commentId } = commentParamsSchema.parse(req.params);
    const input = resolveCommentSchema.parse(req.body ?? {});
    const comment = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.comment.findFirst({
          where: { id: commentId, trackId, track: { projectId } },
          select: { id: true, resolved: true },
        });
        if (!existing) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");

        const resolved = input.resolved ?? !existing.resolved;
        return tx.comment.update({
          where: { id: commentId },
          data: {
            resolved,
            resolvedById: resolved ? user.id : null,
            resolvedAt: resolved ? new Date() : null,
          },
          include: commentInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.json(serializeComment(comment));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/chat",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createChatMessageSchema.parse(req.body);
    await requireTrack(projectId, trackId);
    const message = await prisma.chatMessage.create({
      data: { trackId, authorId: user.id, text: input.text },
      include: chatInclude,
    });
    res.status(201).json(serializeChatMessage(message));
  }),
);

router.post(
  "/:projectId/tracks/:trackId/tasks",
  validateTrackParams,
  requireProjectEditor,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createTaskSchema.parse(req.body);
    const task = await prisma.$transaction(
      async (tx) => {
        const track = await tx.track.findFirst({ where: { id: trackId, projectId }, select: { id: true } });
        if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "Track not found");
        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        return tx.task.create({
          data: {
            trackId,
            createdById: user.id,
            assignedToId: assignedToId ?? null,
            title: input.title,
            description: input.description ?? null,
          },
          include: taskInclude,
        });
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
    const { projectId, trackId, taskId } = taskParamsSchema.parse(req.params);
    const input = updateTaskSchema.parse(req.body);
    const task = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id: taskId, trackId, track: { projectId } },
          select: { id: true },
        });
        if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found");

        const assignedToId = await resolveAssignee(tx, projectId, input.assignedToId, input.assignedTo);
        return tx.task.update({
          where: { id: taskId },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(assignedToId !== undefined ? { assignedToId } : {}),
          },
          include: taskInclude,
        });
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
    const user = requireCurrentUser(req);
    const { projectId, trackId } = trackEntityParamsSchema.parse(req.params);
    const input = createAnnotationSchema.parse(req.body);
    await requireTrack(projectId, trackId);
    const annotation = await prisma.annotation.create({
      data: {
        trackId,
        authorId: user.id,
        timestampSeconds: Math.round(input.timestampSeconds),
        text: input.text,
      },
      include: annotationInclude,
    });
    res.status(201).json(serializeAnnotation(annotation));
  }),
);

export default router;
