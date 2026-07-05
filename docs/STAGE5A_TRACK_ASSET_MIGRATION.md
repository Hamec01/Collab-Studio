# Stage 5A — TrackAsset migration plan

## Goal

Add a universal `TrackAsset` foundation without breaking legacy `AudioVersion` flows, uploads layout, or existing production APIs.

Slice 1 scope is limited to:

- legacy inventory;
- additive schema and migration;
- compatibility helpers;
- additive serialization contract;
- backfill and rollback planning.

This slice does not:

- backfill production data;
- switch frontend off `audioVersions`;
- remove `AudioVersion`;
- change uploads mount or filesystem layout;
- deploy to production.

Slice 2 extends the foundation with server-side dual-read integration only:

- stable `Track.assets` contract on full track responses;
- deterministic merge of native `TrackAsset` and legacy `AudioVersion`;
- partial-backfill-safe deduplication;
- public DTO hardening;
- isolated PostgreSQL integration coverage.

Slice 2 still does not:

- introduce upload dual-write;
- add asset stream/download routes;
- backfill production data;
- switch frontend playback to `assets`;
- deploy or migrate production.

Slice 3 adds dual-write for new uploads only:

- every new local audio upload creates both `AudioVersion` and linked `TrackAsset`;
- every new external audio link creates both `AudioVersion` and linked `TrackAsset`;
- `TrackAsset.legacyAudioVersionId` is written immediately for new rows;
- legacy API responses stay unchanged;
- backfill remains deferred.

## Legacy inventory

Current production-relevant audio/file metadata lives in `AudioVersion`:

- identity: `id`, `trackId`, `versionNumber`
- ownership: `uploadedById`
- storage: `storedFilename`, `storageKey`
- file metadata: `originalFilename`, `mimeType`, `sizeBytes`, `durationSeconds`
- external link mode: `externalUrl`, `isExternal`, `externalProvider`
- timestamps: `createdAt`

Current `Track` model does not store a dedicated primary audio pointer. The UI currently treats the selected version or the first serialized `audioVersions[0]` entry as the active audio.

Project-level cover storage stays on `Project.coverUrl` and is out of scope for this slice.

Current routes depending on legacy audio metadata:

- `POST /api/projects/:projectId/tracks/:trackId/audio`
- `GET|HEAD /api/projects/:projectId/tracks/:trackId/audio/:audioId/stream`
- `GET /api/projects/:projectId/tracks/:trackId/audio/:audioId/download`

Current frontend dependencies:

- `src/components/AudioPlayer.tsx`
- `src/features/track-workspace/lyrics/TrackLyricsWorkspace.tsx`
- `src/features/track-workspace/lyrics/LyricsPlayerPlaceholder.tsx`
- upload modal inside `src/App.tsx`
- `src/api/projects.ts`
- `src/types.ts`

Current full-track API responses that now expose additive `assets`:

- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/tracks`
- `GET /api/projects/:projectId/tracks/:trackId`
- `POST /api/projects`
- `POST /api/projects/:projectId/tracks`
- `PATCH /api/projects/:projectId/tracks/:trackId`

Legacy-only endpoints for now:

- audio upload routes
- legacy audio stream/download routes
- delete/cleanup paths
- frontend player/upload flows

## Target schema

`TrackAsset` is introduced as an additive universal asset record.

Key decisions for slice 1:

- `projectId` is stored directly for cheap authorization checks, backfill batching, and cross-project consistency assertions.
- `sizeBytes` remains `Int` for now because existing upload policy is 25 MB and current API contracts use JSON `number`. A future widening migration can promote this later if non-audio asset limits require it.
- `externalUrl` and `externalProvider` are preserved on `TrackAsset` because legacy `AudioVersion` already supports external references and future dual-write needs a native place to store them.
- `legacyAudioVersionId` is nullable + unique, and acts as the idempotency key for resumable backfill.

### Enums

- `TrackAssetKind`
  - `MASTER`
  - `AUDIO_VERSION`
  - `INSTRUMENTAL`
  - `ACAPELLA`
  - `STEM`
  - `DEMO`
  - `REFERENCE`
  - `OTHER`
- `TrackAssetStatus`
  - `UPLOADING`
  - `READY`
  - `FAILED`
  - `DELETED`

### Model summary

`TrackAsset` contains:

- relations: `trackId`, `projectId`, `uploadedByUserId`, `sourceAssetId`, `legacyAudioVersionId`
- classification: `kind`, `status`
- naming/storage: `title`, `originalFilename`, `storageKey`, `storageProvider`
- external mode: `externalUrl`, `externalProvider`
- file metadata: `mimeType`, `sizeBytes`, `durationMs`, `checksum`
- future data: `waveformData`, `metadata`
- compatibility/versioning: `versionNumber`, `isPrimary`
- lifecycle: `createdAt`, `updatedAt`, `deletedAt`

## Mapping from legacy `AudioVersion`

| AudioVersion | TrackAsset |
|---|---|
| `trackId` | `trackId` |
| `track.projectId` | `projectId` |
| `uploadedById` | `uploadedByUserId` |
| `originalFilename` | `originalFilename` |
| `storageKey` | `storageKey` |
| `mimeType` | `mimeType` |
| `sizeBytes` | `sizeBytes` |
| `durationSeconds` | `durationMs` (`round(seconds * 1000)`) |
| `externalUrl` | `externalUrl` |
| `externalProvider` | `externalProvider` |
| `versionNumber` | `versionNumber` |
| `id` | `legacyAudioVersionId` |
| `createdAt` | `createdAt` |

Default mapping choices:

- `kind = AUDIO_VERSION`
- `status = READY`
- `storageProvider = local`
- `metadata.source = "AudioVersion"`

Slice 3 runtime write choice for new rows:

- local upload => `storageProvider = "local"`
- external link => `storageProvider = "external"`

## Dual-read / dual-write compatibility

### Dual-read

Slice 2 finalizes the read-path contract:

- `audioVersions` remains unchanged for all existing clients;
- `assets` is always present on full track responses as an array;
- native `TrackAsset` rows are read first;
- legacy `AudioVersion` rows are converted into compatibility assets only when their `id` is not already referenced by `TrackAsset.legacyAudioVersionId`;
- partial backfill is therefore safe: migrated rows appear once, unmigrated rows still appear through legacy fallback;
- `TrackAsset` rows with `deletedAt != null` or `status = DELETED` are excluded from normal client responses;
- rows whose `projectId` / `trackId` do not match the owning track are excluded in the read path;
- if native rows are absent, all `assets` are derived from legacy `audioVersions`.

### Ordering and primary normalization

Serialized `assets` use deterministic ordering:

1. `isPrimary = true`
2. kind priority: `MASTER`, `AUDIO_VERSION`, `DEMO`, `REFERENCE`, `INSTRUMENTAL`, `ACAPELLA`, `STEM`, `OTHER`
3. `versionNumber` descending
4. `createdAt` descending
5. `id` ascending as final tie-breaker

Primary normalization rules:

- at most one serialized asset is returned with `isPrimary = true`;
- if one or more rows are explicitly primary, the first row in deterministic order keeps primary and the rest are normalized to `false` in the DTO only;
- if no row is explicitly primary, the first serialized asset becomes primary in the DTO only;
- read normalization never mutates database rows.

### Status and playability rules

- `READY` + mapped legacy audio + non-external asset => legacy stream/download URLs are returned;
- `UPLOADING`, `FAILED`, `DELETED`, or `deletedAt != null` => no playable URLs;
- native assets without legacy mapping currently return `streamUrl = null` and `downloadUrl = null` until asset routes exist;
- external legacy/native assets preserve `externalUrl` and `externalProvider`, and do not expose local legacy URLs.

### Public vs internal DTO

Public `TrackAssetDto` intentionally does not expose:

- raw `storageKey`
- filesystem paths
- `checksum`

Those fields remain server-internal. This keeps the additive contract no broader than required for the current client.

This preserves old clients while exposing the future contract.

### Dual-write

Slice 3 introduces a centralized write service:

- `createAudioVersionWithTrackAsset()`
- trusted input only
- `projectId` is verified against the target `Track` inside the transaction
- serializable transaction
- one `versionNumber` allocation per successful upload
- legacy `AudioVersion` create
- linked `TrackAsset` create
- `TrackAsset.legacyAudioVersionId = AudioVersion.id`
- `TrackAsset.versionNumber = AudioVersion.versionNumber`
- `TrackAsset.uploadedByUserId = AudioVersion.uploadedById`
- `TrackAsset.metadata.source = "AudioVersion"`
- `TrackAsset.createdAt = AudioVersion.createdAt`

Legacy compatibility remains unchanged:

- upload route response still returns legacy `AudioVersion`
- existing frontend still uses `audioVersions`
- additive `assets` appears after normal GET/refetch through the slice 2 read contract

### Local upload flow

Current endpoint remains:

- `POST /api/projects/:projectId/tracks/:trackId/audio`

Local upload order:

1. parse multipart into temp file
2. validate filename, MIME and signature
3. generate normalized `storageKey`
4. move temp file into final uploads location
5. run `createAudioVersionWithTrackAsset()` transaction
6. on transaction failure, remove the just-written final file
7. on success, return legacy `AudioVersion` JSON

Failure rules:

- invalid MIME/signature => no DB rows, temp file cleaned
- `AudioVersion` insert failure after file move => rollback + final file cleanup
- `TrackAsset` insert failure after file move => rollback + final file cleanup

### External link flow

External links reuse the same endpoint and the same dual-write service:

- no physical file is created
- `AudioVersion.isExternal = true`
- `TrackAsset.storageKey = null`
- `TrackAsset.externalUrl` and `externalProvider` mirror legacy fields
- `TrackAsset.status = READY`
- local stream/download URLs stay `null`

### Delete compatibility

Slice 3 does not add a public `DELETE /assets` route.

Existing legacy audio deletion is extended internally:

- deleting an `AudioVersion` now soft-deletes the linked `TrackAsset`
- soft delete sets:
  - `status = DELETED`
  - `deletedAt = now()`
  - `isPrimary = false`
- legacy `AudioVersion` row is still deleted
- local file deletion still uses the existing single-reference safety check
- deleted assets are excluded from normal `Track.assets`

### Version and primary decision

`AudioVersion` already enforces:

- `@@unique([trackId, versionNumber])`

Slice 3 keeps application-side version allocation:

- `max(versionNumber) + 1` inside a serializable transaction
- retry on `P2002` and `P2034`

This remains sufficient for current upload scope and passed isolated concurrent-upload coverage.

Primary rule for new dual-written assets:

- if the track had zero existing `AudioVersion` rows before insert, new `TrackAsset.isPrimary = true`
- otherwise `false`
- existing rows are not rewritten in slice 3
- slice 2 read normalization remains the safety net for historical corruption

## Backfill plan

Backfill is intentionally deferred from slice 1, but the resumable design is fixed:

- command supports `--dry-run`
- command supports `--batch-size`
- command supports `--cursor`
- idempotency key: `legacyAudioVersionId`
- no physical file moves
- verify file existence for local assets
- preserve original timestamps when inserting metadata
- output counters:
  - `scanned`
  - `created`
  - `skipped`
  - `missing`
  - `conflicts`
  - `failed`

Suggested order:

1. scan legacy `AudioVersion` in stable order;
2. skip rows already mapped by `legacyAudioVersionId`;
3. check referenced file existence for non-external rows;
4. create `TrackAsset` metadata only;
5. emit resumable cursor at batch boundary.

Partial-backfill read rule during transition:

- if `TrackAsset(legacyAudioVersionId = X)` exists, legacy `AudioVersion(X)` is suppressed from fallback;
- if `AudioVersion(Y)` has no mapped `TrackAsset`, it still appears in `assets`;
- no all-or-nothing switch is allowed before backfill completion.

## Rollback strategy

Slice 1 rollback is intentionally simple:

1. keep using legacy app code that reads `AudioVersion`;
2. additive migration can remain in place because no legacy table/column is removed;
3. if rollback is required after later slices, restore DB backup and redeploy the last schema-compatible app commit.

No destructive down migration is required for slice 1.

Slice 2 rollback remains application-only:

1. redeploy the last commit that serialized only `audioVersions`;
2. leave additive `TrackAsset` schema in place;
3. no data rewrite is required because slice 2 is read-only with respect to assets.

Slice 3 rollback remains non-destructive:

1. redeploy the last app commit before dual-write
2. leave additive schema in place
3. leave newly written `TrackAsset` rows in place
4. use DB backup restore only if a full historical rollback is required later

## Deployment order for later slices

1. deploy additive `TrackAsset` schema
2. deploy compatibility serializers/helpers
3. enable dual-write for new uploads
4. rehearse and run backfill
5. verify stream/download/read parity
6. switch read path to prefer `TrackAsset`
7. retire legacy writes only after parity + cleanup criteria pass

## DB consistency decision

`TrackAsset` currently stores both `trackId` and `projectId` for efficient authorization and batching, but slice 2 does not add a composite foreign key yet.

Reason:

- current slice is read-only for assets;
- the safe immediate guard is serializer/service filtering of cross-project mismatches;
- DB-level composite consistency and partial unique-primary constraints are better introduced alongside write-path work in the dual-write slice, after isolated rehearsal of the exact constraint shape.

Slice 3 keeps that decision unchanged:

- no new schema constraint or migration was added
- application-level protection is currently: verified access checks, serializable transaction, existing `AudioVersion(trackId, versionNumber)` uniqueness, and read-path mismatch filtering
- composite consistency and stronger primary constraints remain a future write-path hardening slice

## Integration test matrix

Isolated PostgreSQL integration coverage added for:

- empty track
- legacy-only track
- fully mapped track
- partial backfill merge
- native non-legacy asset
- status filtering and playability
- multiple explicit primary flags
- cross-project mismatch filtering
- external legacy audio
- owner/editor/viewer read access
- outsider `404`
- anonymous `401`
- project creation and add-track responses carrying additive `assets`

Slice 3 isolated PostgreSQL + temporary uploads coverage adds:

- local upload success: one file, one `AudioVersion`, one linked `TrackAsset`
- external link success: dual-write without filesystem write
- forced `AudioVersion` insert failure after file move: rollback + cleanup
- forced `TrackAsset` insert failure after file move: rollback + cleanup
- first upload primary assignment
- second upload non-primary assignment
- partial legacy + new dual-written upload merge
- viewer/outsider/cross-project denial
- concurrent uploads allocate distinct version numbers and one primary
- legacy delete soft-deletes linked `TrackAsset` and removes the local file

## Validation SQL

After migration:

```sql
\d "TrackAsset"
\dT+ "TrackAssetKind"
\dT+ "TrackAssetStatus"
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'TrackAsset' ORDER BY indexname;
SELECT count(*) FROM "AudioVersion";
SELECT count(*) FROM "TrackAsset";
```

Production-like rehearsal should also validate:

```sql
SELECT count(*) FROM "AudioVersion" WHERE "storageKey" IS NOT NULL;
SELECT count(*) FROM "TrackAsset" WHERE "legacyAudioVersionId" IS NOT NULL;
```

## Filesystem safety

TrackAsset helpers must continue current path safety rules:

- no absolute paths
- no `..`
- no empty path segments
- no backslashes
- reject encoded traversal such as `%2e%2e`
- resolved path must stay under uploads root

Physical delete remains deferred. Slice 1 only introduces soft-delete-ready metadata fields (`status`, `deletedAt`).

## Cleanup strategy

Slice 1 does not delete legacy rows or files.

Later slices should:

- mark asset metadata deleted first;
- delete underlying file only when reference analysis proves no other metadata points at the same `storageKey`;
- keep orphan-audit tooling aligned with both `AudioVersion` and `TrackAsset` during the transition.

## Retirement criteria for legacy fields

Legacy `AudioVersion` and related file assumptions can retire only when all are true:

- new uploads are dual-written or TrackAsset-only with compatibility proven;
- backfill is complete and idempotent rerun returns zero creates;
- stream/download routes work for migrated assets;
- serializers expose stable `assets` and old clients are no longer dependent on `audioVersions`;
- orphan audit covers TrackAsset references;
- production rollback path is rehearsed on a production-like copy.
