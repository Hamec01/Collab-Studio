# Stage 5A TrackAsset backfill runbook

Статус: локально отрепетировано, production execution не выполнялся.

## Prerequisites

- additive Stage 5A schema already migrated on target DB
- app code with slice 4 backfill CLI deployed only when explicitly approved
- valid DB backup created before any production execute
- known `UPLOADS_DIR` for the target environment

## CLI

Dry-run:

```bash
npm run backfill:track-assets -- --dry-run --batch-size=100 --json
```

Execute:

```bash
TRACK_ASSET_BACKFILL_CONFIRM=YES \
npm run backfill:track-assets -- --execute --batch-size=100 --json
```

Resume:

```bash
TRACK_ASSET_BACKFILL_CONFIRM=YES \
npm run backfill:track-assets -- \
  --execute \
  --batch-size=100 \
  --cursor='<base64url-json>' \
  --json
```

## Cursor format

Base64url JSON:

```json
{
  "createdAt": "2026-07-06T10:00:00.000Z",
  "id": "uuid"
}
```

Ordering is fixed:

1. `createdAt ASC`
2. `id ASC`

## Safety rules

- dry-run never writes
- execute requires `TRACK_ASSET_BACKFILL_CONFIRM=YES`
- backfill writes only `TrackAsset`
- no physical files are moved or deleted
- `AudioVersion` rows are never updated or deleted

## Report analysis

Key counters:

- `scanned`
- `eligible`
- `created`
- `wouldCreate`
- `skipped`
- `raced`
- `missing`
- `conflicts`
- `failed`
- `nextCursor`

Stop conditions:

- `failed > 0`
- `conflicts > 0` with unexpected mismatch
- `missing > 0` if rollout policy requires clean local storage first

## Validation SQL

```sql
SELECT count(*) FROM "AudioVersion";
SELECT count(*) FROM "TrackAsset";
SELECT count(*) FROM "TrackAsset" WHERE "legacyAudioVersionId" IS NOT NULL;
SELECT count(*) FROM "TrackAsset" WHERE ("metadata"->>'backfilled') = 'true';
SELECT count(*) FROM "TrackAsset" WHERE "deletedAt" IS NOT NULL;
```

Primary sanity:

```sql
SELECT "trackId", count(*)
FROM "TrackAsset"
WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "status" <> 'DELETED'
GROUP BY "trackId"
HAVING count(*) > 1;
```

Unmapped legacy rows remaining:

```sql
SELECT count(*)
FROM "AudioVersion" av
LEFT JOIN "TrackAsset" ta
  ON ta."legacyAudioVersionId" = av."id"
WHERE ta."id" IS NULL;
```

## Dry-run process

1. Run dry-run with bounded batch size.
2. Save JSON output.
3. Review:
   - `missingItems`
   - `conflictItems`
   - `nextCursor`
4. If dry-run is clean enough, approve execute separately.

## Execute process

1. Create a fresh DB backup.
2. Run execute in bounded batches.
3. Save each JSON output with its `nextCursor`.
4. Resume using the returned cursor until `nextCursor=null`.
5. Re-run execute once more to confirm idempotency.

## Rollback

Backfill itself is additive. Preferred rollback:

1. stop app writes if needed
2. restore DB backup taken before execute
3. redeploy the last known-good app commit if code rollback is also required

No destructive down-migration is part of this runbook.

## Cleanup

- remove temporary rehearsal containers/databases
- remove temporary uploads directories used for rehearsal
- keep saved JSON reports for audit/review
