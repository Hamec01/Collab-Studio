import { z } from "zod";

export const rhymeRequestSchema = z.object({
  word: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(30).default("Russian"),
  context: z.string().trim().max(1000).default(""),
});
