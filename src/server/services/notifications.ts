import type { Prisma } from "@prisma/client";

export type ProjectNotificationInput = {
  projectId: string;
  trackId?: string;
  actorId: string;
  actorName: string;
  type: string;
  message: string;
};

export async function createProjectMemberNotifications(tx: Prisma.TransactionClient, input: ProjectNotificationInput) {
  const recipients = await tx.projectMember.findMany({
    where: {
      projectId: input.projectId,
      userId: { not: input.actorId },
    },
    select: { userId: true },
  });

  if (recipients.length === 0) return;

  await tx.notification.createMany({
    data: recipients.map(({ userId }) => ({
      userId,
      actorId: input.actorId,
      actorName: input.actorName,
      projectId: input.projectId,
      trackId: input.trackId,
      type: input.type,
      message: input.message,
    })),
  });
}

export async function createTargetedNotifications(tx: Prisma.TransactionClient, input: ProjectNotificationInput & { userIds: string[] }) {
  const uniqueIds = Array.from(new Set(input.userIds.filter((id) => id !== input.actorId)));
  if (uniqueIds.length === 0) return;

  // Ensure recipients are project members
  const validMembers = await tx.projectMember.findMany({
    where: {
      projectId: input.projectId,
      userId: { in: uniqueIds },
    },
    select: { userId: true },
  });

  if (validMembers.length === 0) return;

  await tx.notification.createMany({
    data: validMembers.map(({ userId }) => ({
      userId,
      actorId: input.actorId,
      actorName: input.actorName,
      projectId: input.projectId,
      trackId: input.trackId ?? null,
      type: input.type,
      message: input.message,
    })),
  });
}

