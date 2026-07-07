import { Prisma, ReviewStatus, ApproverStatus } from "@prisma/client";

export async function createTrackSnapshot(tx: Prisma.TransactionClient, trackId: string, title: string) {
  const track = await tx.track.findUniqueOrThrow({ where: { id: trackId }, select: { title: true } });
  
  const latestLyricVersion = await tx.lyricVersion.findFirst({
    where: { trackId },
    orderBy: { createdAt: "desc" },
  });

  const primaryAssets = await tx.trackAsset.findMany({
    where: { trackId, isPrimary: true },
  });

  const snapshot = await tx.trackSnapshot.create({
    data: {
      trackId,
      title: title || track.title,
      lyricVersionId: latestLyricVersion?.id ?? null,
      metadata: {},
      assets: {
        create: primaryAssets.map((asset) => ({
          trackAssetId: asset.id,
        })),
      },
    },
    include: { assets: true },
  });

  return snapshot;
}

export async function createTrackReview(tx: Prisma.TransactionClient, trackId: string, snapshotId: string, createdById: string) {
  return await tx.trackReview.create({
    data: {
      trackId,
      snapshotId,
      createdById,
      status: ReviewStatus.PENDING,
    },
  });
}

export async function addReviewApprovers(tx: Prisma.TransactionClient, reviewId: string, userIds: string[]) {
  const data = userIds.map((userId) => ({
    reviewId,
    userId,
    status: ApproverStatus.PENDING,
  }));
  
  if (data.length > 0) {
    await tx.trackReviewApprover.createMany({ data });
  }
}

export async function submitApprovalResponse(
  tx: Prisma.TransactionClient, 
  reviewId: string, 
  userId: string, 
  status: ApproverStatus, 
  note?: string
) {
  const approver = await tx.trackReviewApprover.findUniqueOrThrow({
    where: { reviewId_userId: { reviewId, userId } },
  });

  await tx.trackReviewApprover.update({
    where: { id: approver.id },
    data: {
      status,
      note,
      respondedAt: new Date(),
    },
  });

  await evaluateReviewReadyStatus(tx, reviewId);
}

export async function evaluateReviewReadyStatus(tx: Prisma.TransactionClient, reviewId: string) {
  const approvers = await tx.trackReviewApprover.findMany({
    where: { reviewId },
  });

  const activeApprovers = approvers.filter((a) => a.status !== ApproverStatus.REMOVED);
  const allApproved = activeApprovers.length > 0 && activeApprovers.every((a) => a.status === ApproverStatus.APPROVED);

  const review = await tx.trackReview.findUniqueOrThrow({ where: { id: reviewId } });
  
  if (review.status === ReviewStatus.INVALIDATED) {
    return; // Don't change status if already invalidated
  }

  if (allApproved && review.status !== ReviewStatus.READY) {
    await tx.trackReview.update({
      where: { id: reviewId },
      data: { status: ReviewStatus.READY },
    });
  } else if (!allApproved && review.status === ReviewStatus.READY) {
    await tx.trackReview.update({
      where: { id: reviewId },
      data: { status: ReviewStatus.PENDING },
    });
  }
}

export async function removeReviewApprover(tx: Prisma.TransactionClient, reviewId: string, userId: string, reason?: string) {
  const approver = await tx.trackReviewApprover.findUniqueOrThrow({
    where: { reviewId_userId: { reviewId, userId } },
  });

  await tx.trackReviewApprover.update({
    where: { id: approver.id },
    data: {
      status: ApproverStatus.REMOVED,
      note: reason,
      respondedAt: new Date(),
    },
  });

  await evaluateReviewReadyStatus(tx, reviewId);
}

export async function invalidateTrackReviews(tx: Prisma.TransactionClient, trackId: string) {
  await tx.trackReview.updateMany({
    where: {
      trackId,
      status: { in: [ReviewStatus.PENDING, ReviewStatus.READY] },
    },
    data: { status: ReviewStatus.INVALIDATED },
  });
}
