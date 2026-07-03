# Stage 4B structured lyrics persistence migration note

Date: 2026-07-03
Status: approved for local slices 3–4 rehearsal; production deploy forbidden

## Scope

This migration adds nullable compatibility fields only:

- `Track.lyricsDocument Json?`
- `Track.lyricsPlainText String?`
- `LyricVersion.document Json?`
- `LyricVersion.plainText String?`
- `LyricVersion.schemaVersion Int?`

Existing `Track.lyrics`, `Track.lyricsRevision` and `LyricVersion.lyrics` remain unchanged. No table, column, constraint or legacy value is removed or rewritten by migration SQL.

## Deploy order

1. Apply the additive migration.
2. Deploy a backend that:
   - validates structured documents with the shared codec;
   - reads a structured document when present, otherwise derives one from legacy text;
   - accepts both the Stage 4A string payload and the new structured payload;
   - atomically writes document, derived plain text and legacy text under the existing lease/OCC check;
   - increments `lyricsRevision` exactly once.
3. Run the bounded resumable backfill.
4. Verify zero mismatches before any future frontend rollout.

The frontend feature flag stays off throughout slices 3–4.

## Backfill contract

- bounded batches, default 100 rows;
- only rows with a null structured document are converted;
- each batch commits atomically;
- deterministic legacy conversion produces the same block IDs on every run;
- rows already containing a document are validated but never regenerated;
- partial rows, malformed documents, duplicate IDs, schema-version mismatches or derived/legacy text mismatches stop the run;
- no mismatch is repaired automatically;
- interruption is safe: the next run resumes from remaining null documents;
- autosave and backfill never create `LyricVersion` rows.

## Integrity checks

The rehearsal must prove:

- no remaining null target fields after a complete backfill;
- zero document/plain-text/legacy-text mismatches;
- zero malformed documents or duplicate block IDs;
- unchanged pre-existing `lyricsRevision` values;
- byte-identical serialized documents and stable block IDs after a repeated run;
- legacy and structured saves each increment the revision once;
- stale revisions return `409 LYRICS_CONFLICT`;
- missing/expired/wrong leases return `409 LYRICS_LEASE_LOST`.

## Rollback

Rollback is application-only:

1. Keep the additive columns.
2. Disable `lyricsStructuredEditor`.
3. Redeploy the Stage 4A application.
4. Stage 4A reads the latest legacy `lyrics`; while it is deployed, its saves update legacy text and OCC revision only.
5. On roll-forward, the compatibility reader recognizes the narrow case where document + derived text still agree and only legacy text changed. It serves a deterministic legacy fallback without mutating data.
6. The first reviewed save through the new backend dual-writes all representations again. The backfill itself still stops on this mismatch and never repairs it automatically.
7. Do not run a down migration or `prisma db push`.

The local rehearsal must run the Stage 4A application or its exact persistence projection against the migrated database and verify the latest dual-written legacy text. Production backup/deploy remains out of scope.
