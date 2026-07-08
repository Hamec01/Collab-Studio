-- CreateEnum
CREATE TYPE "PublicationKind" AS ENUM ('WORK', 'COLLAB');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Publication" (
    "id" UUID NOT NULL,
    "kind" "PublicationKind" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "slug" TEXT NOT NULL,
    "authorUserId" UUID,
    "projectId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "selectedAssetId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");

-- CreateIndex
CREATE INDEX "Publication_authorUserId_status_publishedAt_idx" ON "Publication"("authorUserId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Publication_projectId_idx" ON "Publication"("projectId");

-- CreateIndex
CREATE INDEX "Publication_trackId_idx" ON "Publication"("trackId");

-- CreateIndex
CREATE INDEX "Publication_kind_status_publishedAt_idx" ON "Publication"("kind", "status", "publishedAt");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrackSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_selectedAssetId_fkey" FOREIGN KEY ("selectedAssetId") REFERENCES "TrackAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

