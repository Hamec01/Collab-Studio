-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PublicationLike" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicationLike_publicationId_idx" ON "PublicationLike"("publicationId");

-- CreateIndex
CREATE INDEX "PublicationLike_userId_idx" ON "PublicationLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationLike_publicationId_userId_key" ON "PublicationLike"("publicationId", "userId");

-- AddForeignKey
ALTER TABLE "PublicationLike" ADD CONSTRAINT "PublicationLike_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationLike" ADD CONSTRAINT "PublicationLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
