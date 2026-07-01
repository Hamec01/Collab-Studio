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
