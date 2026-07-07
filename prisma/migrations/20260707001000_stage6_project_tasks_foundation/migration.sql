CREATE TABLE "ProjectTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "createdById" UUID,
  "assignedToId" UUID,
  "title" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'todo',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");
CREATE INDEX "ProjectTask_createdById_idx" ON "ProjectTask"("createdById");
CREATE INDEX "ProjectTask_assignedToId_idx" ON "ProjectTask"("assignedToId");
CREATE INDEX "ProjectTask_projectId_status_idx" ON "ProjectTask"("projectId", "status");
CREATE INDEX "ProjectTask_assignedToId_status_idx" ON "ProjectTask"("assignedToId", "status");

ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_projectId_fkey"
  FOREIGN KEY ("projectId")
  REFERENCES "Project"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_createdById_fkey"
  FOREIGN KEY ("createdById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_assignedToId_fkey"
  FOREIGN KEY ("assignedToId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
