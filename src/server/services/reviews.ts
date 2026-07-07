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

  // Future slice: evaluate if review status transitions to READY or INVALIDATED
}
