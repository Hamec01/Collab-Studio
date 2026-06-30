import { z } from "zod";
import { uuidParam } from "./projects";

export const trackParamsSchema = z.object({
  projectId: uuidParam,
  trackId: uuidParam,
});

export const versionParamsSchema = z.object({
  projectId: uuidParam,
  trackId: uuidParam,
  versionId: uuidParam,
});

export const createTrackSchema = z.object({
  title: z.string().trim().min(1).max(160),
  lyrics: z.string().max(200000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  versionLabel: z.string().trim().min(1).max(160).optional(),
});

export const updateTrackSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    lyrics: z.string().max(200000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    versionLabel: z.string().trim().min(1).max(160).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "versionLabel"), { message: "At least one track field is required" });

export const createLyricVersionSchema = z.object({
  lyrics: z.string().min(1).max(200000),
  label: z.string().trim().min(1).max(160),
});
