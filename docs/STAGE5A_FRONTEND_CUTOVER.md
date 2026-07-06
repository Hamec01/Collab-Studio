# Stage 5A frontend audio cutover

## Scope

This document covers slice 7 only:

- frontend audio selection and player cutover to normalized `Track.assets`
- legacy `audioVersions` fallback
- no backend contract change
- no production deploy in the implementation turn

Out of scope:

- removing `audioVersions`
- native asset delete
- upload response redesign
- Stage 5B

## Normalized model

Frontend uses one normalized playable source model:

- `sourceType`
- `id`
- `trackAssetId`
- `legacyAudioVersionId`
- `versionNumber`
- `title`
- `originalFilename`
- `streamUrl`
- `downloadUrl`
- `externalUrl`
- `externalProvider`
- `mimeType`
- `durationMs`
- `isPrimary`
- `createdAt`
- `uploadedBy`
- `canDelete`

The normalized model must never contain raw `storageKey` or filesystem paths.

## Selection algorithm

1. Normalize usable native assets first.
2. Suppress mapped legacy rows only when the mapped asset is usable.
3. Append unmapped legacy rows in existing legacy order.
4. Resolve current source by selected id if it still exists, otherwise first normalized source.

Usable asset rules:

- `status = READY`
- `deletedAt = null`
- local asset requires `streamUrl`
- external asset requires safe `https:` `externalUrl`

Asset ordering:

1. primary
2. highest `versionNumber`
3. newest `createdAt`
4. stable `id`

## Migration-state matrix

- legacy-only: unchanged behavior
- dual-written: asset row wins, no duplicate version rows
- partial backfill: mapped assets plus unmapped legacy rows
- native-only local asset: playable through native route
- external-only: safe outbound link, no fake local playback
- empty: stable no-audio state

## Upload and delete behavior

- upload/link flow still uses legacy endpoints
- frontend re-fetches track after success
- normalized list rebuilds from server DTO after refetch
- delete capability is true only for rows with `legacyAudioVersionId`
- native-only assets remain non-deletable in slice 7

## Local verification

- selector normalization unit tests
- component tests for legacy-only, dual-write, native-only, switching, empty, external-only cases
- full lint/test/build/e2e gate
- production image build

## Production rollout prerequisites

Before future production deploy:

1. approved slice 7 commit pushed
2. production remains on slice 6 until explicit approval
3. owner-authenticated smoke checklist available
4. no schema or migration changes required

## Owner smoke checklist

1. log in as verified owner
2. open a track with no audio and confirm empty state
3. upload first WAV and confirm player works after refetch
4. inspect track JSON and confirm asset-native URL is selected
5. upload second WAV and confirm no duplicate versions
6. verify asset-first selection stays deterministic
7. verify legacy fallback still works when `assets=[]`
8. add external link and confirm safe open-link action
9. verify mobile controls remain reachable

## Stop conditions

- duplicate mapped/legacy versions shown
- wrong source chosen after refetch
- stale source remains after track switch
- external-only source attempts local playback
- mobile controls regress

## Rollback

1. redeploy previous frontend/app commit
2. keep additive backend and schema support intact
3. do not touch backfill state
