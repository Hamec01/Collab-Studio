import { prisma } from "../db";
import { AppError } from "../middleware/errors";
import { ensureVerifiedForProtectedWrite } from "./stage3Access";

const MAX_TEXT_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 2000;

async function resolveUserByHandle(handle: string) {
  const user = await prisma.user.findFirst({
    where: { username: { equals: handle, mode: "insensitive" } },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

async function assertNotBlocked(senderId: string, recipientId: string) {
  const block = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: recipientId, blockedId: senderId } },
  });
  if (block) throw new AppError(403, "USER_BLOCKED", "You have been blocked by this user");
}

/**
 * Send a DM request from `senderId` to `recipientHandle`.
 * Rules:
 * - sender must be verified (email + age)
 * - sender must not be blocked by recipient
 * - sender must not be suspended/banned
 * - only one pending/accepted request per (sender, recipient) pair
 */
export async function sendDmRequest(senderId: string, recipientHandle: string, text: string) {
  if (!text || text.trim().length === 0) {
    throw new AppError(400, "EMPTY_TEXT", "Message text cannot be empty");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(400, "TEXT_TOO_LONG", `Message text must be at most ${MAX_TEXT_LENGTH} characters`);
  }

  const sender = await prisma.user.findUnique({ where: { id: senderId } });
  if (!sender) throw new AppError(404, "USER_NOT_FOUND", "Sender not found");
  if (sender.isSuspended || sender.isBanned) {
    throw new AppError(403, "USER_SUSPENDED_OR_BANNED", "Your account is suspended or banned");
  }

  ensureVerifiedForProtectedWrite(sender);

  const recipient = await resolveUserByHandle(recipientHandle);
  if (recipient.id === senderId) {
    throw new AppError(400, "CANNOT_DM_SELF", "You cannot send a DM to yourself");
  }

  await assertNotBlocked(senderId, recipient.id);

  // Check existing request
  const existing = await prisma.directMessageRequest.findUnique({
    where: { senderId_recipientId: { senderId, recipientId: recipient.id } },
  });
  if (existing) {
    if (existing.status === "BLOCKED") {
      throw new AppError(403, "USER_BLOCKED", "You have been blocked by this user");
    }
    if (existing.status === "PENDING" || existing.status === "ACCEPTED") {
      throw new AppError(409, "DUPLICATE_REQUEST", "A DM request or conversation already exists with this user");
    }
    // REJECTED: allow re-request (delete old and create new)
    await prisma.directMessageRequest.delete({ where: { id: existing.id } });
  }

  const request = await prisma.directMessageRequest.create({
    data: {
      senderId,
      recipientId: recipient.id,
      text: text.trim(),
      status: "PENDING",
    },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      recipient: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return request;
}

/**
 * List incoming pending DM requests for `userId`.
 */
export async function listIncomingDmRequests(userId: string) {
  return prisma.directMessageRequest.findMany({
    where: { recipientId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

/**
 * List accepted DM conversations for `userId`.
 */
export async function listAcceptedConversations(userId: string) {
  const requests = await prisma.directMessageRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      recipient: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        where: { isDeleted: false },
      },
    },
  });
  return requests;
}

type DmAction = "accept" | "reject" | "block";

/**
 * Respond to an incoming DM request.
 */
export async function respondToDmRequest(userId: string, requestId: string, action: DmAction) {
  const request = await prisma.directMessageRequest.findUnique({ where: { id: requestId } });
  if (!request || request.recipientId !== userId) {
    throw new AppError(404, "DM_REQUEST_NOT_FOUND", "DM request not found");
  }
  if (request.status !== "PENDING") {
    throw new AppError(409, "DM_REQUEST_ALREADY_HANDLED", "DM request has already been handled");
  }

  const statusMap: Record<DmAction, string> = {
    accept: "ACCEPTED",
    reject: "REJECTED",
    block: "BLOCKED",
  };

  const updated = await prisma.directMessageRequest.update({
    where: { id: requestId },
    data: { status: statusMap[action] as "ACCEPTED" | "REJECTED" | "BLOCKED" },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  // If blocking, also create a UserBlock
  if (action === "block") {
    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: request.senderId } },
      create: { blockerId: userId, blockedId: request.senderId },
      update: {},
    });
  }

  return updated;
}

async function assertConversationParticipant(userId: string, requestId: string) {
  const request = await prisma.directMessageRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError(404, "DM_REQUEST_NOT_FOUND", "Conversation not found");
  if (request.senderId !== userId && request.recipientId !== userId) {
    throw new AppError(403, "NOT_PARTICIPANT", "You are not a participant in this conversation");
  }
  if (request.status !== "ACCEPTED") {
    throw new AppError(403, "CONVERSATION_NOT_OPEN", "This conversation has not been accepted yet");
  }
  return request;
}

/**
 * List messages in an accepted conversation.
 */
export async function listConversationMessages(userId: string, requestId: string) {
  await assertConversationParticipant(userId, requestId);
  return prisma.directMessage.findMany({
    where: { requestId, isDeleted: false },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

/**
 * Send a message in an accepted conversation.
 */
export async function sendDirectMessage(userId: string, requestId: string, text: string) {
  if (!text || text.trim().length === 0) {
    throw new AppError(400, "EMPTY_TEXT", "Message text cannot be empty");
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(400, "TEXT_TOO_LONG", `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  const sender = await prisma.user.findUnique({ where: { id: userId } });
  if (!sender) throw new AppError(404, "USER_NOT_FOUND", "Sender not found");
  if (sender.isSuspended || sender.isBanned) {
    throw new AppError(403, "USER_SUSPENDED_OR_BANNED", "Your account is suspended or banned");
  }

  ensureVerifiedForProtectedWrite(sender);

  const request = await assertConversationParticipant(userId, requestId);

  // Check the other participant hasn't blocked the sender
  const otherId = request.senderId === userId ? request.recipientId : request.senderId;
  await assertNotBlocked(userId, otherId);

  const message = await prisma.directMessage.create({
    data: {
      requestId,
      senderId: userId,
      text: text.trim(),
    },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  // Update conversation timestamp for sorting
  await prisma.directMessageRequest.update({
    where: { id: requestId },
    data: { updatedAt: new Date() },
  });

  return message;
}
