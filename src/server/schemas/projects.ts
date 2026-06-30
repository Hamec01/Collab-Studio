import { z } from "zod";

export const uuidParam = z.string().uuid();

export const projectParamsSchema = z.object({
  projectId: uuidParam,
});

export const memberParamsSchema = z.object({
  projectId: uuidParam,
  userId: uuidParam,
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: z.enum(["single", "album"]),
  coverUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    type: z.enum(["single", "album"]).optional(),
    coverUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const addMemberSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  role: z.enum(["editor", "viewer"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
});
