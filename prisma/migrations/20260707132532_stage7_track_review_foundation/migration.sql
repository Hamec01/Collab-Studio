-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'READY', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "ApproverStatus" AS ENUM ('PENDING', 'APPROVED', 'REQUESTED_CHANGES', 'REMOVED');

-- CreateTable
CREATE TABLE "TrackSnapshot" (
    "id" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "lyricVersionId" UUID,
    "title" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackSnapshotAsset" (
    "snapshotId" UUID NOT NULL,
    "trackAssetId" UUID NOT NULL,

    CONSTRAINT "TrackSnapshotAsset_pkey" PRIMARY KEY ("snapshotId","trackAssetId")
);

-- CreateTable
CREATE TABLE "TrackReview" (
    "id" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackReviewApprover" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ApproverStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackReviewApprover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackSnapshot_trackId_idx" ON "TrackSnapshot"("trackId");

-- CreateIndex
CREATE INDEX "TrackSnapshotAsset_trackAssetId_idx" ON "TrackSnapshotAsset"("trackAssetId");

-- CreateIndex
CREATE INDEX "TrackReview_trackId_status_idx" ON "TrackReview"("trackId", "status");

-- CreateIndex
CREATE INDEX "TrackReview_snapshotId_idx" ON "TrackReview"("snapshotId");

-- CreateIndex
CREATE INDEX "TrackReview_createdById_idx" ON "TrackReview"("createdById");

-- CreateIndex
CREATE INDEX "TrackReviewApprover_reviewId_status_idx" ON "TrackReviewApprover"("reviewId", "status");

-- CreateIndex
CREATE INDEX "TrackReviewApprover_userId_idx" ON "TrackReviewApprover"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackReviewApprover_reviewId_userId_key" ON "TrackReviewApprover"("reviewId", "userId");

-- AddForeignKey
ALTER TABLE "TrackSnapshot" ADD CONSTRAINT "TrackSnapshot_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSnapshot" ADD CONSTRAINT "TrackSnapshot_lyricVersionId_fkey" FOREIGN KEY ("lyricVersionId") REFERENCES "LyricVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSnapshotAsset" ADD CONSTRAINT "TrackSnapshotAsset_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrackSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSnapshotAsset" ADD CONSTRAINT "TrackSnapshotAsset_trackAssetId_fkey" FOREIGN KEY ("trackAssetId") REFERENCES "TrackAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReview" ADD CONSTRAINT "TrackReview_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReview" ADD CONSTRAINT "TrackReview_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrackSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReview" ADD CONSTRAINT "TrackReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReviewApprover" ADD CONSTRAINT "TrackReviewApprover_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "TrackReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReviewApprover" ADD CONSTRAINT "TrackReviewApprover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
