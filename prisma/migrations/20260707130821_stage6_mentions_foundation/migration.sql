-- AlterTable
ALTER TABLE "Annotation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AudioVersion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuthAccount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DiscussionMessage" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "LyricVersion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectChatMessage" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectMember" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectTask" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Track" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrackAsset" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
