# ADR: Stage 4A plain-text lyrics concurrency

Date: 2026-07-03

## Decision

Keep `Track.lyrics` as the canonical plain-text field for Stage 4A. Add:

- `Track.lyricsRevision Int @default(0)` as the only OCC revision for lyrics saves;
- one `LyricsEditLease` row per track with a hashed opaque token and a 90-second expiry;
- a 30-second client heartbeat while edit mode is active.

The edit lease is acquired explicitly. A second browser/tab receives `409 LYRICS_LEASE_HELD`. Saves require both the active lease token and the exact `baseRevision`. A stale revision receives `409 LYRICS_CONFLICT`; the server never overwrites it automatically.

## Migration and backfill

The migration is additive. Existing tracks receive `lyricsRevision = 0` through the non-null default. Existing `lyrics` and `LyricVersion` data are unchanged. No content backfill is required.

Integrity checks after migration:

```sql
SELECT COUNT(*) FROM "Track" WHERE "lyricsRevision" < 0;
SELECT COUNT(*) FROM "LyricsEditLease" WHERE "expiresAt" <= "acquiredAt";
SELECT "trackId", COUNT(*) FROM "LyricsEditLease" GROUP BY "trackId" HAVING COUNT(*) > 1;
```

All queries must return zero rows/count.

## Rollback

The previous application ignores the additive column/table and can be redeployed without a down migration. Lease rows may remain until a later cleanup release. Dropping either addition is intentionally not part of the production rollback.

## Non-goals

No WYSIWYG, structured blocks, stable anchors, audio/asset migration, public content, or Stage 4B schema.
