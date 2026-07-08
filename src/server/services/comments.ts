import { prisma } from "../db";
import { AppError } from "../middleware/errors";
import { ensureVerifiedForProtectedWrite } from "./stage3Access";

export async function addPublicationComment(
  authorId: string,
  publicationSlug: string,
  text: string
) {
  const author = await prisma.user.findUnique({
    where: { id: authorId },
  });
  if (!author) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  if (author.isSuspended || author.isBanned) {
    throw new AppError(403, "USER_SUSPENDED_OR_BANNED", "User account is suspended or banned");
  }

  ensureVerifiedForProtectedWrite(author);

  const publication = await prisma.publication.findUnique({
    where: { slug: publicationSlug },
  });
  if (!publication) throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");

  if (publication.commentsClosed) {
    throw new AppError(403, "COMMENTS_CLOSED", "Comments are closed for this publication");
  }

  // Check if owner of publication has blocked this user
  if (publication.authorUserId) {
    const block = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: publication.authorUserId,
          blockedId: authorId,
        },
      },
    });
    if (block) {
      throw new AppError(403, "USER_BLOCKED", "You are blocked by the author of this publication");
    }
  }

  const comment = await prisma.publicationComment.create({
    data: {
      publicationId: publication.id,
      authorId,
      text,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return comment;
}

export async function getPublicationComments(
  viewerId: string | null,
  publicationSlug: string
) {
  const publication = await prisma.publication.findUnique({
    where: { slug: publicationSlug },
  });
  if (!publication) throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");

  const isAuthor = viewerId === publication.authorUserId;

  const comments = await prisma.publicationComment.findMany({
    where: {
      publicationId: publication.id,
      ...(isAuthor ? {} : { isHidden: false }),
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return comments;
}

export async function toggleCommentsClosed(
  ownerId: string,
  publicationSlug: string,
  closed: boolean
) {
  const publication = await prisma.publication.findUnique({
    where: { slug: publicationSlug },
  });
  if (!publication) throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");

  if (publication.authorUserId !== ownerId) {
    throw new AppError(403, "FORBIDDEN", "Only the author can close or open comments");
  }

  return prisma.publication.update({
    where: { id: publication.id },
    data: { commentsClosed: closed },
  });
}

export async function toggleCommentHidden(
  ownerId: string,
  commentId: string,
  hidden: boolean
) {
  const comment = await prisma.publicationComment.findUnique({
    where: { id: commentId },
    include: { publication: true },
  });
  if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");

  if (comment.publication.authorUserId !== ownerId) {
    throw new AppError(403, "FORBIDDEN", "Only the publication author can hide or show comments");
  }

  return prisma.publicationComment.update({
    where: { id: commentId },
    data: { isHidden: hidden },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

export async function blockUser(blockerId: string, blockedUsername: string) {
  const blocked = await prisma.user.findFirst({
    where: { username: { equals: blockedUsername, mode: "insensitive" } },
  });
  if (!blocked) throw new AppError(404, "USER_NOT_FOUND", "User to block not found");

  if (blocked.id === blockerId) {
    throw new AppError(400, "CANNOT_BLOCK_SELF", "You cannot block yourself");
  }

  return prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: {
        blockerId,
        blockedId: blocked.id,
      },
    },
    create: {
      blockerId,
      blockedId: blocked.id,
    },
    update: {},
  });
}

export async function unblockUser(blockerId: string, blockedUsername: string) {
  const blocked = await prisma.user.findFirst({
    where: { username: { equals: blockedUsername, mode: "insensitive" } },
  });
  if (!blocked) throw new AppError(404, "USER_NOT_FOUND", "User to unblock not found");

  try {
    await prisma.userBlock.delete({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: blocked.id,
        },
      },
    });
  } catch (err) {
    // If not exists, ignore or return success
  }

  return { success: true };
}

export async function createContentReport(
  reporterId: string,
  contentType: "PUBLICATION" | "COMMENT",
  contentId: string,
  reason: string
) {
  const reporter = await prisma.user.findUnique({ where: { id: reporterId } });
  if (!reporter) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  // Validate that the content actually exists
  if (contentType === "PUBLICATION") {
    const pub = await prisma.publication.findUnique({ where: { id: contentId } });
    if (!pub) throw new AppError(404, "PUBLICATION_NOT_FOUND", "Publication not found");
  } else if (contentType === "COMMENT") {
    const comm = await prisma.publicationComment.findUnique({ where: { id: contentId } });
    if (!comm) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");
  } else {
    throw new AppError(400, "INVALID_CONTENT_TYPE", "Invalid content type for report");
  }

  return prisma.contentReport.create({
    data: {
      reporterId,
      contentType,
      contentId,
      reason,
    },
  });
}

export async function getPendingReports(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Admin access required");
  }

  return prisma.contentReport.findMany({
    where: { status: "PENDING" },
    include: {
      reporter: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function resolveReport(
  adminId: string,
  reportId: string,
  action: "SUSPEND_USER" | "BAN_USER" | "REMOVE_CONTENT" | "DISMISS",
  resolution: string
) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Admin access required");
  }

  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
  });
  if (!report) throw new AppError(404, "REPORT_NOT_FOUND", "Report not found");

  await prisma.$transaction(async (tx) => {
    // 1. Apply Action
    if (action === "SUSPEND_USER" || action === "BAN_USER") {
      let targetUserId: string | null = null;
      if (report.contentType === "PUBLICATION") {
        const pub = await tx.publication.findUnique({ where: { id: report.contentId } });
        if (pub) targetUserId = pub.authorUserId;
      } else if (report.contentType === "COMMENT") {
        const comm = await tx.publicationComment.findUnique({ where: { id: report.contentId } });
        if (comm) targetUserId = comm.authorId;
      }

      if (targetUserId) {
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            isSuspended: action === "SUSPEND_USER",
            isBanned: action === "BAN_USER",
          },
        });
      }
    } else if (action === "REMOVE_CONTENT") {
      if (report.contentType === "PUBLICATION") {
        // Change status to ARCHIVED
        await tx.publication.update({
          where: { id: report.contentId },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
      } else if (report.contentType === "COMMENT") {
        // Hide comment
        await tx.publicationComment.update({
          where: { id: report.contentId },
          data: { isHidden: true },
        });
      }
    }

    // 2. Resolve Report
    await tx.contentReport.update({
      where: { id: reportId },
      data: {
        status: "RESOLVED",
        resolution,
      },
    });
  });

  return { success: true };
}
