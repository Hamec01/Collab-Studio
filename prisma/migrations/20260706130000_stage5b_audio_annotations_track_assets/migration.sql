ALTER TABLE "Annotation"
ADD COLUMN "trackAssetId" UUID;

CREATE INDEX "Annotation_trackAssetId_idx" ON "Annotation"("trackAssetId");

CREATE INDEX "Annotation_trackId_trackAssetId_timestampSeconds_idx"
ON "Annotation"("trackId", "trackAssetId", "timestampSeconds");

ALTER TABLE "Annotation"
ADD CONSTRAINT "Annotation_trackAssetId_fkey"
FOREIGN KEY ("trackAssetId") REFERENCES "TrackAsset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
