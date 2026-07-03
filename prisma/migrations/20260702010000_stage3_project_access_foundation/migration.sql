-- Stage 3 additive access foundation

CREATE TYPE "CapabilityPreset" AS ENUM ('legacy', 'owner', 'editor', 'viewer', 'custom');
CREATE TYPE "AccessScope" AS ENUM ('project', 'track');
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "BreakGlassStatus" AS ENUM ('active', 'released', 'expired');

ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "ageAcknowledgedAt" TIMESTAMP(3);

ALTER TABLE "Project"
  ADD COLUMN "quotaTier" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "entitlements" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ProjectMember"
  ADD COLUMN "capabilityPreset" "CapabilityPreset" NOT NULL DEFAULT 'legacy',
  ADD COLUMN "customCapabilities" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "EmailVerificationToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInvite" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "invitedUserId" UUID,
  "invitedEmail" TEXT,
  "role" "ProjectRole" NOT NULL,
  "scope" "AccessScope" NOT NULL DEFAULT 'project',
  "trackId" UUID,
  "tokenHash" TEXT NOT NULL,
  "status" "InviteStatus" NOT NULL DEFAULT 'pending',
  "customCapabilities" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackAccessGrant" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "trackId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "ProjectRole" NOT NULL DEFAULT 'viewer',
  "canDownload" BOOLEAN NOT NULL DEFAULT false,
  "customCapabilities" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestLink" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "trackId" UUID,
  "tokenHash" TEXT NOT NULL,
  "canListen" BOOLEAN NOT NULL DEFAULT true,
  "canDownload" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnershipTransferAudit" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "fromUserId" UUID NOT NULL,
  "toUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnershipTransferAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BreakGlassAccessAudit" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "adminUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "BreakGlassStatus" NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BreakGlassAccessAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityEvent" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "actorId" UUID,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE UNIQUE INDEX "ProjectInvite_tokenHash_key" ON "ProjectInvite"("tokenHash");
CREATE UNIQUE INDEX "TrackAccessGrant_trackId_userId_key" ON "TrackAccessGrant"("trackId", "userId");
CREATE UNIQUE INDEX "GuestLink_tokenHash_key" ON "GuestLink"("tokenHash");

CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "ProjectInvite_projectId_idx" ON "ProjectInvite"("projectId");
CREATE INDEX "ProjectInvite_trackId_idx" ON "ProjectInvite"("trackId");
CREATE INDEX "ProjectInvite_invitedEmail_idx" ON "ProjectInvite"("invitedEmail");
CREATE INDEX "ProjectInvite_status_idx" ON "ProjectInvite"("status");
CREATE INDEX "ProjectInvite_expiresAt_idx" ON "ProjectInvite"("expiresAt");
CREATE INDEX "TrackAccessGrant_projectId_idx" ON "TrackAccessGrant"("projectId");
CREATE INDEX "TrackAccessGrant_trackId_idx" ON "TrackAccessGrant"("trackId");
CREATE INDEX "TrackAccessGrant_userId_idx" ON "TrackAccessGrant"("userId");
CREATE INDEX "TrackAccessGrant_expiresAt_idx" ON "TrackAccessGrant"("expiresAt");
CREATE INDEX "GuestLink_projectId_idx" ON "GuestLink"("projectId");
CREATE INDEX "GuestLink_trackId_idx" ON "GuestLink"("trackId");
CREATE INDEX "GuestLink_expiresAt_idx" ON "GuestLink"("expiresAt");
CREATE INDEX "OwnershipTransferAudit_projectId_idx" ON "OwnershipTransferAudit"("projectId");
CREATE INDEX "OwnershipTransferAudit_fromUserId_idx" ON "OwnershipTransferAudit"("fromUserId");
CREATE INDEX "OwnershipTransferAudit_toUserId_idx" ON "OwnershipTransferAudit"("toUserId");
CREATE INDEX "BreakGlassAccessAudit_projectId_idx" ON "BreakGlassAccessAudit"("projectId");
CREATE INDEX "BreakGlassAccessAudit_adminUserId_idx" ON "BreakGlassAccessAudit"("adminUserId");
CREATE INDEX "BreakGlassAccessAudit_status_idx" ON "BreakGlassAccessAudit"("status");
CREATE INDEX "BreakGlassAccessAudit_expiresAt_idx" ON "BreakGlassAccessAudit"("expiresAt");
CREATE INDEX "ActivityEvent_projectId_idx" ON "ActivityEvent"("projectId");
CREATE INDEX "ActivityEvent_actorId_idx" ON "ActivityEvent"("actorId");
CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvite"
  ADD CONSTRAINT "ProjectInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectInvite_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackAccessGrant"
  ADD CONSTRAINT "TrackAccessGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrackAccessGrant_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrackAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestLink"
  ADD CONSTRAINT "GuestLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestLink_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OwnershipTransferAudit"
  ADD CONSTRAINT "OwnershipTransferAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OwnershipTransferAudit_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OwnershipTransferAudit_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BreakGlassAccessAudit"
  ADD CONSTRAINT "BreakGlassAccessAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BreakGlassAccessAudit_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent"
  ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
