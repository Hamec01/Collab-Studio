import type { Prisma } from "@prisma/client";
import { sendEmail } from "./email";
import { DeliveryChannel, DeliveryStatus } from "@prisma/client";

export type ProjectNotificationInput = {
  projectId: string;
  trackId?: string;
  actorId: string;
  actorName: string;
  type: string;
  message: string;
};

const EMAIL_PRIORITY_TYPES = [
  "project_invite",
  "message_request",
  "comment_mention",
  "discussion_mention",
  "track_chat_mention",
  "project_chat_mention",
  "task_assigned",
  "project_task_assigned",
  "review_request",
];

function shouldSendEmail(type: string): boolean {
  return EMAIL_PRIORITY_TYPES.includes(type);
}

async function dispatchDeliveries(tx: Prisma.TransactionClient, notificationIds: { id: string, userId: string, userEmail: string | null }[], input: ProjectNotificationInput) {
  if (notificationIds.length === 0) return;

  const requiresEmail = shouldSendEmail(input.type);

  if (requiresEmail) {
    const deliveriesToCreate = notificationIds.map(n => ({
      notificationId: n.id,
      userId: n.userId,
      channel: DeliveryChannel.EMAIL,
      status: DeliveryStatus.PENDING,
    }));

    if (deliveriesToCreate.length > 0) {
      await tx.notificationDelivery.createMany({
        data: deliveriesToCreate,
      });

      // Fire and forget email sends
      for (const n of notificationIds) {
        if (n.userEmail) {
          sendEmail({
            to: n.userEmail,
            subject: `New notification: ${input.type}`,
            body: input.message,
          }).catch(err => console.error("Failed to mock send email:", err));
        }
      }
    }
  }
}

export async function createProjectMemberNotifications(tx: Prisma.TransactionClient, input: ProjectNotificationInput) {
  const recipients = await tx.projectMember.findMany({
    where: {
      projectId: input.projectId,
      userId: { not: input.actorId },
    },
    select: { userId: true, user: { select: { email: true } } },
  });

  if (recipients.length === 0) return;

  const createdNotifications: { id: string; userId: string; userEmail: string | null }[] = [];

  for (const { userId, user } of recipients) {
    const n = await tx.notification.create({
      data: {
        userId,
        actorId: input.actorId,
        actorName: input.actorName,
        projectId: input.projectId,
        trackId: input.trackId,
        type: input.type,
        message: input.message,
      },
    });
    createdNotifications.push({ id: n.id, userId, userEmail: user.email });
  }

  await dispatchDeliveries(tx, createdNotifications, input);
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
    select: { userId: true, user: { select: { email: true } } },
  });

  if (validMembers.length === 0) return;

  const createdNotifications: { id: string; userId: string; userEmail: string | null }[] = [];

  for (const { userId, user } of validMembers) {
    const n = await tx.notification.create({
      data: {
        userId,
        actorId: input.actorId,
        actorName: input.actorName,
        projectId: input.projectId,
        trackId: input.trackId ?? null,
        type: input.type,
        message: input.message,
      },
    });
    createdNotifications.push({ id: n.id, userId, userEmail: user.email });
  }

  await dispatchDeliveries(tx, createdNotifications, input);
}

