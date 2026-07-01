import { z } from "zod";
import { uuidParam } from "./projects";

export const notificationParamsSchema = z.object({
  notificationId: uuidParam,
});

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
