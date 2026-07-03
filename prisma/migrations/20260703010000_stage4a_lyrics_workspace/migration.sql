ALTER TABLE "Track"
ADD COLUMN "lyricsRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LyricsEditLease" (
    "id" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LyricsEditLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LyricsEditLease_trackId_key" ON "LyricsEditLease"("trackId");
CREATE UNIQUE INDEX "LyricsEditLease_tokenHash_key" ON "LyricsEditLease"("tokenHash");
CREATE INDEX "LyricsEditLease_userId_idx" ON "LyricsEditLease"("userId");
CREATE INDEX "LyricsEditLease_expiresAt_idx" ON "LyricsEditLease"("expiresAt");

ALTER TABLE "LyricsEditLease"
ADD CONSTRAINT "LyricsEditLease_trackId_fkey"
FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LyricsEditLease"
ADD CONSTRAINT "LyricsEditLease_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
