ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_trackAssetId_fkey";

ALTER TABLE "Annotation"
  ADD CONSTRAINT "Annotation_trackAssetId_fkey"
  FOREIGN KEY ("trackAssetId")
  REFERENCES "TrackAsset"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
