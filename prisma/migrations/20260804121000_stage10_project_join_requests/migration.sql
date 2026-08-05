-- CreateEnum
CREATE TYPE "ProjectJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProjectJoinRequest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "publicationId" UUID,
    "requestedRole" "ProjectRole" NOT NULL DEFAULT 'viewer',
    "message" TEXT,
    "status" "ProjectJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectJoinRequest_projectId_status_idx" ON "ProjectJoinRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectJoinRequest_requesterId_status_idx" ON "ProjectJoinRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ProjectJoinRequest_createdAt_idx" ON "ProjectJoinRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectJoinRequest_projectId_requesterId_key" ON "ProjectJoinRequest"("projectId", "requesterId");

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
