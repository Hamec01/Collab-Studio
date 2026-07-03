# Stage 4B lyrics migration rehearsal plan

Status: plan only — no Prisma migration and no production deploy in foundation slices 1–2.

## Proposed additive shape

In a later approved slice:

- `Track.lyricsDocument Json?`
- `Track.lyricsPlainText String?`
- existing `Track.lyricsRevision` unchanged
- `LyricVersion.document Json?`
- `LyricVersion.plainText String?`
- `LyricVersion.schemaVersion Int?`

All new fields start nullable. Legacy `Track.lyrics` and `LyricVersion.lyrics` remain populated for at least one observed release.

## Rehearsal sequence

1. Take an isolated database copy or fixture representing empty, short, long, Unicode, emoji, empty-line, CRLF and existing-version data.
2. Run the future additive migration on both an empty database and the existing-data copy.
3. Deploy/run a compatibility backend that reads structured data with validated legacy fallback and writes structured, derived and legacy fields atomically.
4. Run an idempotent, resumable backfill in bounded batches. Convert only rows whose structured field is null; never replace an existing valid block ID.
5. Re-run the backfill and confirm that no document or block ID changes.
6. Verify every derived plain text value equals the legacy source before marking a row complete.
7. Exercise Stage 4A rollback against the migrated copy and confirm current reads, edits, lease, OCC, recovery and version history still work.
8. Record row counts, invalid rows, duration and verification output. Stop on any mismatch; do not repair content automatically.

## Required verification

- zero tracks or lyric versions where derived text differs from legacy text;
- zero malformed or unsupported documents;
- zero duplicate block IDs within a document;
- all pre-existing `lyricsRevision` values unchanged by backfill;
- two rehearsal runs produce byte-identical deterministic document serialization;
- old Stage 4A application reads the latest dual-written text;
- stale revision still returns `409 LYRICS_CONFLICT`;
- no autosave creates a `LyricVersion`.

## Rollback rehearsal

Rollback is application-only:

1. Disable `lyricsStructuredEditor`.
2. Redeploy the Stage 4A application.
3. Keep additive fields/tables in place.
4. Read and edit through legacy fields, which the compatibility backend kept current.
5. Do not run a destructive down migration.

Production backup, deploy, observation and cleanup are explicitly outside this foundation.
