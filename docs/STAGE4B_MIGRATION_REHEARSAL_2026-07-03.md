# Stage 4B structured lyrics migration rehearsal

Date: 2026-07-03
Environment: disposable local `postgres:16-alpine`, no production access
Result: PASS

## Empty database

- `prisma validate`: PASS
- all five migrations through `20260703020000_stage4b_structured_lyrics_persistence`: PASS
- empty bounded backfill: `0 tracks`, `0 versions`, `0 mismatches`
- persistence rehearsal: PASS

## Existing Stage 4A database

The first four migrations were applied, then legacy fixtures were inserted with:

- Unicode and emoji;
- soft breaks;
- consecutive and trailing empty lines;
- `lyricsRevision = 11`;
- one legacy `LyricVersion`.

The Stage 4B migration then applied successfully.

Bounded/resumable backfill with batch size 1:

1. first run: `tracksUpdated=1`, `versionsUpdated=0`, `remainingVersions=1`;
2. resumed run: `tracksUpdated=0`, `versionsUpdated=1`, no remaining rows;
3. repeated run: `tracksUpdated=0`, `versionsUpdated=0`;
4. derived-text mismatches: `0`;
5. block IDs and deterministic serialization unchanged;
6. the pre-existing lyrics revision remained unchanged by backfill.

## Persistence and concurrency

The local rehearsal verified:

- unchanged Stage 4A string payload: PASS;
- structured payload validated by the shared codec: PASS;
- document + derived plain text + legacy text written atomically: PASS;
- exactly one revision increment per successful save: PASS;
- stale revision: `409 LYRICS_CONFLICT`;
- wrong lease: `409 LYRICS_LEASE_LOST`;
- malformed structured document: rejected;
- autosave-created lyric versions: `0`;
- mismatch detection stops without repair: PASS.

The current HTTP route was exercised with both legacy and structured payloads. It returned compatibility `content` plus structured fields. HTTP stale revision, lease loss and malformed-document responses matched the expected `409`, `409` and `400`.

## Stage 4A rollback

Exact commit `f2875d0` was built and run against the migrated existing-data database. Its real API completed:

1. registration and email verification;
2. project and track creation;
3. lease acquisition;
4. legacy lyrics draft save;
5. revision `0 → 1`.

Rows created by the Stage 4A application were subsequently backfilled by the new code with zero mismatches. A legacy-only edit of an already structured row was also rehearsed: the roll-forward reader served legacy fallback without mutation, integrity verification stopped, and a reviewed save through the new backend restored dual-write consistency with one OCC increment.

Rollback requires no down migration and no `prisma db push`.
