BEGIN;

ALTER TABLE "Track"
ADD COLUMN "lyricsDocument" JSONB,
ADD COLUMN "lyricsPlainText" TEXT;

ALTER TABLE "LyricVersion"
ADD COLUMN "document" JSONB,
ADD COLUMN "plainText" TEXT,
ADD COLUMN "schemaVersion" INTEGER;

COMMIT;
