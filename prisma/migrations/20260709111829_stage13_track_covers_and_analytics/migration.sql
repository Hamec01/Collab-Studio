-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "coverUrl" TEXT;

-- CreateTable
CREATE TABLE "PublicationPlay" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicationPlay_publicationId_idx" ON "PublicationPlay"("publicationId");

-- CreateIndex
CREATE INDEX "PublicationPlay_publicationId_createdAt_idx" ON "PublicationPlay"("publicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PublicationPlay" ADD CONSTRAINT "PublicationPlay_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
