import { z } from "zod";
import { uuidParam } from "./projects";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const nullableAssignee = z.string().uuid().nullable().optional();
const anchorBlockIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const trackEntityParamsSchema = z.object({
  projectId: uuidParam,
  trackId: uuidParam,
});

export const commentParamsSchema = trackEntityParamsSchema.extend({
  commentId: uuidParam,
});

export const discussionThreadParamsSchema = trackEntityParamsSchema.extend({
  threadId: uuidParam,
});

export const taskParamsSchema = trackEntityParamsSchema.extend({
  taskId: uuidParam,
});

export const projectTaskParamsSchema = z.object({
  projectId: uuidParam,
  taskId: uuidParam,
});

export const createCommentSchema = z.object({
  text: nonEmptyText(5000),
  lineIndex: z.number().int().min(0).max(100000).nullable().optional(),
});

export const resolveCommentSchema = z.object({
  resolved: z.boolean().optional(),
});

const discussionAnchorSchema = z.object({
  blockId: anchorBlockIdSchema,
  quote: z.string().max(2000).nullable().optional(),
  prefix: z.string().max(255).nullable().optional(),
  suffix: z.string().max(255).nullable().optional(),
  startOffsetHint: z.number().int().min(0).max(200000).nullable().optional(),
  endOffsetHint: z.number().int().min(0).max(200000).nullable().optional(),
}).strict();

export const createLyricsDiscussionThreadSchema = z.object({
  body: nonEmptyText(5000),
  anchor: discussionAnchorSchema.optional(),
});

export const createLyricsDiscussionMessageSchema = z.object({
  body: nonEmptyText(5000),
});

export const resolveLyricsDiscussionThreadSchema = z.object({
  resolved: z.boolean().optional(),
});

export const reanchorLyricsDiscussionThreadSchema = discussionAnchorSchema;

export const createChatMessageSchema = z.object({
  text: nonEmptyText(5000),
});

const taskStatusSchema = z
  .enum(["todo", "in-progress", "in_progress", "done"])
  .transform((status) => (status === "in-progress" ? "in_progress" : status));

const assigneeFields = {
  assignedToId: nullableAssignee,
  assignedTo: z.string().trim().min(1).max(160).nullable().optional(),
};

export const createTaskSchema = z
  .object({
    title: nonEmptyText(300),
    description: z.string().trim().max(5000).nullable().optional(),
    ...assigneeFields,
  })
  .refine((input) => !(input.assignedToId !== undefined && input.assignedTo !== undefined), {
    message: "Provide either assignedToId or assignedTo",
  });

export const updateTaskSchema = z
  .object({
    title: nonEmptyText(300).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: taskStatusSchema.optional(),
    ...assigneeFields,
  })
  .refine((input) => !(input.assignedToId !== undefined && input.assignedTo !== undefined), {
    message: "Provide either assignedToId or assignedTo",
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one task field is required",
  });

export const createAnnotationSchema = z.object({
  timestampSeconds: z.number().finite().min(0).max(604800),
  text: nonEmptyText(5000),
  trackAssetId: z.string().uuid().nullable().optional(),
});
