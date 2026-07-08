-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "isPublicProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "website" TEXT;
