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

## Dual-read / dual-write compatibility

### Dual-read

Slice 1 introduces additive `Track.assets` serialization:

- serialize native `TrackAsset` rows into `assets`;
- merge any still-unmapped legacy `AudioVersion` rows into `assets`;
- exclude legacy rows only when their `AudioVersion.id` is already represented by `TrackAsset.legacyAudioVersionId`;
- if there are no `TrackAsset` rows yet, derive all `assets` from legacy `audioVersions`;
- existing `audioVersions` remains unchanged.

This preserves old clients while exposing the future contract.

### Dual-write

Planned for later Stage 5A slices:

- new upload/link logic creates `TrackAsset`;
- legacy `AudioVersion` remains written until stream/download/frontend cutover is complete;
- no route will stop returning `audioVersions` during Stage 5A.

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

## Rollback strategy

Slice 1 rollback is intentionally simple:

1. keep using legacy app code that reads `AudioVersion`;
2. additive migration can remain in place because no legacy table/column is removed;
3. if rollback is required after later slices, restore DB backup and redeploy the last schema-compatible app commit.

No destructive down migration is required for slice 1.

## Deployment order for later slices

1. deploy additive `TrackAsset` schema
2. deploy compatibility serializers/helpers
3. enable dual-write for new uploads
4. rehearse and run backfill
5. verify stream/download/read parity
6. switch read path to prefer `TrackAsset`
7. retire legacy writes only after parity + cleanup criteria pass

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
