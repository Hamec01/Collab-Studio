-- Stage 4B slice 7: lyrics-only discussions and stable anchors
CREATE TYPE "DiscussionTargetType" AS ENUM ('lyrics');

CREATE TABLE "DiscussionThread" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "targetType" "DiscussionTargetType" NOT NULL DEFAULT 'lyrics',
    "createdById" UUID,
    "resolvedById" UUID,
    "sourceLyricVersionId" UUID,
    "sourceLyricsRevision" INTEGER,
    "anchorBlockId" TEXT,
    "anchorStartOffsetHint" INTEGER,
    "anchorEndOffsetHint" INTEGER,
    "anchorQuote" TEXT,
    "anchorPrefix" TEXT,
    "anchorSuffix" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscussionThread_projectId_idx" ON "DiscussionThread"("projectId");
CREATE INDEX "DiscussionThread_trackId_idx" ON "DiscussionThread"("trackId");
CREATE INDEX "DiscussionThread_createdById_idx" ON "DiscussionThread"("createdById");
CREATE INDEX "DiscussionThread_resolvedById_idx" ON "DiscussionThread"("resolvedById");
CREATE INDEX "DiscussionThread_trackId_resolvedAt_idx" ON "DiscussionThread"("trackId", "resolvedAt");
CREATE INDEX "DiscussionThread_trackId_createdAt_idx" ON "DiscussionThread"("trackId", "createdAt");
CREATE INDEX "DiscussionThread_trackId_anchorBlockId_idx" ON "DiscussionThread"("trackId", "anchorBlockId");

CREATE INDEX "DiscussionMessage_threadId_idx" ON "DiscussionMessage"("threadId");
CREATE INDEX "DiscussionMessage_authorId_idx" ON "DiscussionMessage"("authorId");
CREATE INDEX "DiscussionMessage_threadId_createdAt_idx" ON "DiscussionMessage"("threadId", "createdAt");

ALTER TABLE "DiscussionThread"
ADD CONSTRAINT "DiscussionThread_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionThread"
ADD CONSTRAINT "DiscussionThread_trackId_fkey"
FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionThread"
ADD CONSTRAINT "DiscussionThread_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscussionThread"
ADD CONSTRAINT "DiscussionThread_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscussionThread"
ADD CONSTRAINT "DiscussionThread_sourceLyricVersionId_fkey"
FOREIGN KEY ("sourceLyricVersionId") REFERENCES "LyricVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscussionMessage"
ADD CONSTRAINT "DiscussionMessage_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionMessage"
ADD CONSTRAINT "DiscussionMessage_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
