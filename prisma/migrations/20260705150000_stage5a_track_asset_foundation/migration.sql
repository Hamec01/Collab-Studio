-- Stage 5A slice 1: additive TrackAsset foundation

CREATE TYPE "TrackAssetKind" AS ENUM (
  'MASTER',
  'AUDIO_VERSION',
  'INSTRUMENTAL',
  'ACAPELLA',
  'STEM',
  'DEMO',
  'REFERENCE',
  'OTHER'
);

CREATE TYPE "TrackAssetStatus" AS ENUM (
  'UPLOADING',
  'READY',
  'FAILED',
  'DELETED'
);

CREATE TABLE "TrackAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trackId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "uploadedByUserId" UUID,
  "kind" "TrackAssetKind" NOT NULL,
  "status" "TrackAssetStatus" NOT NULL DEFAULT 'READY',
  "title" TEXT,
  "originalFilename" TEXT NOT NULL,
  "storageKey" TEXT,
  "storageProvider" TEXT NOT NULL DEFAULT 'local',
  "externalUrl" TEXT,
  "externalProvider" "ExternalProvider",
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "durationMs" INTEGER,
  "checksum" TEXT,
  "waveformData" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "sourceAssetId" UUID,
  "legacyAudioVersionId" UUID,
  "versionNumber" INTEGER,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "TrackAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackAsset_legacyAudioVersionId_key" ON "TrackAsset"("legacyAudioVersionId");
CREATE INDEX "TrackAsset_trackId_kind_createdAt_idx" ON "TrackAsset"("trackId", "kind", "createdAt");
CREATE INDEX "TrackAsset_trackId_isPrimary_idx" ON "TrackAsset"("trackId", "isPrimary");
CREATE INDEX "TrackAsset_trackId_kind_versionNumber_idx" ON "TrackAsset"("trackId", "kind", "versionNumber");
CREATE INDEX "TrackAsset_projectId_idx" ON "TrackAsset"("projectId");
CREATE INDEX "TrackAsset_uploadedByUserId_idx" ON "TrackAsset"("uploadedByUserId");
CREATE INDEX "TrackAsset_sourceAssetId_idx" ON "TrackAsset"("sourceAssetId");
CREATE INDEX "TrackAsset_status_idx" ON "TrackAsset"("status");

ALTER TABLE "TrackAsset"
  ADD CONSTRAINT "TrackAsset_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackAsset"
  ADD CONSTRAINT "TrackAsset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackAsset"
  ADD CONSTRAINT "TrackAsset_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrackAsset"
  ADD CONSTRAINT "TrackAsset_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "TrackAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrackAsset"
  ADD CONSTRAINT "TrackAsset_legacyAudioVersionId_fkey"
  FOREIGN KEY ("legacyAudioVersionId") REFERENCES "AudioVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
