CREATE TABLE "ProjectChatMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "authorId" UUID,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectChatMessage_projectId_idx" ON "ProjectChatMessage"("projectId");
CREATE INDEX "ProjectChatMessage_authorId_idx" ON "ProjectChatMessage"("authorId");
CREATE INDEX "ProjectChatMessage_projectId_createdAt_idx" ON "ProjectChatMessage"("projectId", "createdAt");

ALTER TABLE "ProjectChatMessage"
  ADD CONSTRAINT "ProjectChatMessage_projectId_fkey"
  FOREIGN KEY ("projectId")
  REFERENCES "Project"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ProjectChatMessage"
  ADD CONSTRAINT "ProjectChatMessage_authorId_fkey"
  FOREIGN KEY ("authorId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
