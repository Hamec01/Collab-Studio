import { z } from "zod";
import {
  isLyricsDocument,
  normalizeLyricsDocument,
  type LyricsDocument,
} from "../../features/track-workspace/lyrics/lyricsDocument";
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
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    versionLabel: z.string().trim().min(1).max(160).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "versionLabel"), { message: "At least one track field is required" });

export const lyricsLeaseTokenSchema = z.object({
  leaseToken: z.string().min(32).max(256).regex(/^[a-zA-Z0-9_-]+$/),
});

const lyricsDraftBaseSchema = {
  content: z.string().max(200000),
  baseRevision: z.number().int().nonnegative(),
  leaseToken: lyricsLeaseTokenSchema.shape.leaseToken,
};

const structuredLyricsDocumentSchema = z
  .unknown()
  .refine(isLyricsDocument, "Invalid lyrics document");

const lyricVersionLabelSchema = z.string().trim().min(1).max(160);

export const createLyricVersionSchema = z.union([
  z.object({
    lyrics: z.string().min(1).max(200000),
    label: lyricVersionLabelSchema,
  }).strict(),
  z.object({
    document: structuredLyricsDocumentSchema,
    label: lyricVersionLabelSchema,
  }).strict(),
]);

export type CreateLyricVersionInput =
  | { lyrics: string; label: string }
  | { document: LyricsDocument; label: string };

export function parseCreateLyricVersion(input: unknown): CreateLyricVersionInput {
  const parsed = createLyricVersionSchema.parse(input);
  if ("lyrics" in parsed) return parsed;
  return {
    document: normalizeLyricsDocument(parsed.document),
    label: parsed.label,
  };
}

export const updateLyricsDraftSchema = z.union([
  z.object(lyricsDraftBaseSchema).strict(),
  z.object({
    document: structuredLyricsDocumentSchema,
    baseRevision: lyricsDraftBaseSchema.baseRevision,
    leaseToken: lyricsDraftBaseSchema.leaseToken,
  }).strict(),
]);

export type UpdateLyricsDraftInput =
  | { content: string; baseRevision: number; leaseToken: string }
  | { document: LyricsDocument; baseRevision: number; leaseToken: string };

export function parseUpdateLyricsDraft(input: unknown): UpdateLyricsDraftInput {
  const parsed = updateLyricsDraftSchema.parse(input);
  if ("content" in parsed) return parsed;
  return {
    document: normalizeLyricsDocument(parsed.document),
    baseRevision: parsed.baseRevision,
    leaseToken: parsed.leaseToken,
  };
}

function isPrivateAudioHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  if (normalized.includes(":")) return true;
  if (!normalized.includes(".")) return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
}

export const httpsExternalAudioUrl = z.string().trim().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !isPrivateAudioHostname(url.hostname);
}, "External URL must be a public HTTPS URL");

export const audioTrackParamsSchema = trackParamsSchema;
export const audioStreamParamsSchema = trackParamsSchema.extend({ audioId: uuidParam });
export const localAudioFormSchema = z.object({}).strict();
export const externalAudioFormSchema = z.object({
  label: z.string().trim().min(1).max(255).regex(/^[^\u0000-\u001F\u007F]+$/),
  externalUrl: httpsExternalAudioUrl,
  externalProvider: z.enum(["google", "yandex", "telegram", "other"]),
}).strict();
