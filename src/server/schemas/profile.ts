import { z } from "zod";

const websiteSchema = z
  .string()
  .trim()
  .max(2048)
  .url("Website must be a valid URL")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Website must use http or https");

export const publicProfileParamsSchema = z.object({
  handle: z.string().trim().min(1).max(40),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  isPublicProfile: z.boolean(),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  website: websiteSchema.optional().or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
