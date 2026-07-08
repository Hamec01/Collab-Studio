import { z } from "zod";

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url("URL must be valid")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "URL must use http or https");

export const publicationSlugParamsSchema = z.object({
  slug: z.string().trim().min(3).max(80),
});

export const publicationIdParamsSchema = z.object({
  publicationId: z.string().uuid(),
});

export const createWorkPublicationSchema = z.object({
  projectId: z.string().uuid(),
  trackId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(3000).optional().or(z.literal("")),
  coverImageUrl: optionalHttpUrlSchema.optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  language: z.string().trim().min(1).max(40).optional().or(z.literal("")),
});

export type CreateWorkPublicationInput = z.infer<typeof createWorkPublicationSchema>;

export const createCollabPublicationSchema = z.object({
  projectId: z.string().uuid(),
  trackId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(3000).optional().or(z.literal("")),
  coverImageUrl: optionalHttpUrlSchema.optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  language: z.string().trim().min(1).max(40).optional().or(z.literal("")),
  budget: z.string().trim().max(100).optional().or(z.literal("")),
  terms: z.string().trim().max(1000).optional().or(z.literal("")),
  rolesNeeded: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

export type CreateCollabPublicationInput = z.infer<typeof createCollabPublicationSchema>;
