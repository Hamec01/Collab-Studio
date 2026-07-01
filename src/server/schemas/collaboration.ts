import { z } from "zod";
import { uuidParam } from "./projects";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const nullableAssignee = z.string().uuid().nullable().optional();

export const trackEntityParamsSchema = z.object({
  projectId: uuidParam,
  trackId: uuidParam,
});

export const commentParamsSchema = trackEntityParamsSchema.extend({
  commentId: uuidParam,
});

export const taskParamsSchema = trackEntityParamsSchema.extend({
  taskId: uuidParam,
});

export const createCommentSchema = z.object({
  text: nonEmptyText(5000),
  lineIndex: z.number().int().min(0).max(100000).nullable().optional(),
});

export const resolveCommentSchema = z.object({
  resolved: z.boolean().optional(),
});

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
});
