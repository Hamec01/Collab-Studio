-- Self-hosted PostgreSQL foundation for Collab-Studio.
-- Generated for initial Prisma migration; do not apply without an explicit deploy step.

CREATE TYPE "UserRole" AS ENUM ('admin', 'user');
CREATE TYPE "ProjectRole" AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE "ProjectType" AS ENUM ('single', 'album');
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE "ExternalProvider" AS ENUM ('google', 'yandex', 'telegram', 'other');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session" (
  "sid" TEXT NOT NULL,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE TABLE "Project" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "type" "ProjectType" NOT NULL,
  "coverUrl" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "ProjectRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Track" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "lyrics" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LyricVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "authorId" UUID,
  "lyrics" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isOriginal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LyricVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AudioVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "uploadedById" UUID,
  "filename" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storagePath" TEXT,
  "externalUrl" TEXT,
  "isExternal" BOOLEAN NOT NULL DEFAULT false,
  "externalProvider" "ExternalProvider",
  "versionNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "lineIndex" INTEGER,
  "text" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "createdById" UUID,
  "assignedToId" UUID,
  "title" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Annotation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "timestampSeconds" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "actorId" UUID,
  "projectId" UUID NOT NULL,
  "trackId" UUID,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "IDX_session_expire" ON "session"("expire");
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "ProjectMember_userId_role_idx" ON "ProjectMember"("userId", "role");
CREATE INDEX "Track_projectId_idx" ON "Track"("projectId");
CREATE INDEX "Track_projectId_updatedAt_idx" ON "Track"("projectId", "updatedAt");
CREATE INDEX "LyricVersion_trackId_idx" ON "LyricVersion"("trackId");
CREATE INDEX "LyricVersion_authorId_idx" ON "LyricVersion"("authorId");
CREATE INDEX "LyricVersion_trackId_createdAt_idx" ON "LyricVersion"("trackId", "createdAt");
CREATE INDEX "LyricVersion_trackId_isOriginal_idx" ON "LyricVersion"("trackId", "isOriginal");
CREATE UNIQUE INDEX "AudioVersion_trackId_versionNumber_key" ON "AudioVersion"("trackId", "versionNumber");
CREATE INDEX "AudioVersion_trackId_idx" ON "AudioVersion"("trackId");
CREATE INDEX "AudioVersion_uploadedById_idx" ON "AudioVersion"("uploadedById");
CREATE INDEX "AudioVersion_trackId_createdAt_idx" ON "AudioVersion"("trackId", "createdAt");
CREATE INDEX "Comment_trackId_idx" ON "Comment"("trackId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");
CREATE INDEX "Comment_trackId_resolved_idx" ON "Comment"("trackId", "resolved");
CREATE INDEX "Comment_trackId_createdAt_idx" ON "Comment"("trackId", "createdAt");
CREATE INDEX "ChatMessage_trackId_idx" ON "ChatMessage"("trackId");
CREATE INDEX "ChatMessage_authorId_idx" ON "ChatMessage"("authorId");
CREATE INDEX "ChatMessage_trackId_createdAt_idx" ON "ChatMessage"("trackId", "createdAt");
CREATE INDEX "Task_trackId_idx" ON "Task"("trackId");
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");
CREATE INDEX "Task_trackId_status_idx" ON "Task"("trackId", "status");
CREATE INDEX "Task_assignedToId_status_idx" ON "Task"("assignedToId", "status");
CREATE INDEX "Annotation_trackId_idx" ON "Annotation"("trackId");
CREATE INDEX "Annotation_authorId_idx" ON "Annotation"("authorId");
CREATE INDEX "Annotation_trackId_timestampSeconds_idx" ON "Annotation"("trackId", "timestampSeconds");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");
CREATE INDEX "Notification_trackId_idx" ON "Notification"("trackId");
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_projectId_createdAt_idx" ON "Notification"("projectId", "createdAt");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Track" ADD CONSTRAINT "Track_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LyricVersion" ADD CONSTRAINT "LyricVersion_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LyricVersion" ADD CONSTRAINT "LyricVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudioVersion" ADD CONSTRAINT "AudioVersion_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioVersion" ADD CONSTRAINT "AudioVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
