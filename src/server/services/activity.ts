import type { Prisma } from "@prisma/client";

export const PROJECT_ACTIVITY_LIMIT = 20;

export type ActivityEventPayload = Prisma.InputJsonObject;

export function recordActivityEvent(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    actorId?: string | null;
    type: string;
    payload?: ActivityEventPayload;
  },
) {
  return tx.activityEvent.create({
    data: {
      projectId: input.projectId,
      actorId: input.actorId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    },
  });
}
