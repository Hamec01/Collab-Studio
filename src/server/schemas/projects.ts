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
  initialTrackTitle: z.string().trim().min(1).max(160).optional(),
  coverUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).superRefine((value, context) => {
  if (value.type === "single" && !value.initialTrackTitle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialTrackTitle"],
      message: "Single projects require an initial track title",
    });
  }
  if (value.type === "album" && value.initialTrackTitle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialTrackTitle"],
      message: "Album projects must not set an initial track title",
    });
  }
});

export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    type: z.enum(["single", "album"]).optional(),
    coverUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const addMemberSchema = z
  .object({
    login: z.string().trim().min(1).max(254).optional(),
    identifier: z.string().trim().min(1).max(254).optional(),
    role: z.enum(["editor", "viewer"]),
  })
  .refine((value) => Boolean(value.login || value.identifier), {
    message: "Login is required",
  });

export const updateMemberRoleSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export const createInviteSchema = z
  .object({
    email: z.string().trim().email().max(254).optional(),
    userId: uuidParam.optional(),
    role: z.enum(["editor", "viewer"]),
    scope: z.enum(["project", "track"]).default("project"),
    trackId: uuidParam.optional(),
    expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
  })
  .refine((value) => Boolean(value.email || value.userId), { message: "email or userId is required" });

export const inviteParamsSchema = z.object({
  projectId: uuidParam,
  inviteId: uuidParam,
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export const transferOwnershipSchema = z.object({
  toUserId: uuidParam,
  reason: z.string().trim().min(8).max(500),
});

export const trackGrantParamsSchema = z.object({
  projectId: uuidParam,
  trackId: uuidParam,
  userId: uuidParam,
});

export const createTrackGrantSchema = z.object({
  userId: uuidParam,
  role: z.enum(["editor", "viewer"]),
  canDownload: z.boolean().default(false),
  expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
  customCapabilities: z.record(z.string(), z.boolean()).optional(),
});

export const createGuestLinkSchema = z.object({
  trackId: uuidParam.optional(),
  canDownload: z.boolean().default(false),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(48),
});

export const guestLinkParamsSchema = z.object({
  projectId: uuidParam,
  guestLinkId: uuidParam,
});
