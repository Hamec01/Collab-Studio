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

## Production cutover result — 2026-07-06

**Status: DEPLOYED**

- deployed app commit: `85be76c`
- deployed image: `sha256:5f9fc4e65d3b18df3aa9ba2680e4ece7320a3e1282debd2d26dab0e22dfa2974`
- previous image (slice 6): `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
- deploy time: 2026-07-06

### Smoke results

| Check | Result |
|---|---|
| pre-deploy git state | HEAD=85be76c, origin/main synced (0 0), clean |
| image build | PASS — TrackAsset code in bundle, no new migrations, server.cjs 172K |
| deploy (--no-deps app) | PASS — started 13.8s, healthy |
| health/ready/root | 200/200/200 |
| startup logs | only known ERR_ERL_KEY_GEN_IPV6 warning; no new errors |
| HTML loads | PASS |
| JS/CSS static 200 | PASS |
| asset/stream anon | 401 PASS |
| asset/download anon | 401 PASS |
| storageKey leak | none PASS |
| A — empty state | PASS (audioVersions=0, assets=0) |
| B — first WAV upload | PASS (201, streamUrl native /assets/, stream HEAD 200, no storageKey leaked) |
| C — second WAV upload | PASS (201, assets≥2, legacy retained) |
| D — external link | PASS (201, streamUrl=null, externalUrl present) |
| E — legacy fallback | No natural legacy-only row in production; locally covered; manual-not-reproducible |
| F — mobile | Manual-pending |
| G — cleanup | PASS (DB direct: 5 AudioVersion + 5 TrackAsset + 4 files removed, baseline restored) |
| post-deploy DB counts | User=2, Project=1, Track=1, AudioVersion=0, TrackAsset=0 |
| uploads file count | 0 |
| migration state | 7 migrations all finished, unchanged |
| backfill execute | NOT run |
| Stage 5B | Not started |

### Rollback plan

1. `docker compose --env-file ... up -d --no-deps app` with previous image `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
2. Keep additive backend and schema support intact — no down migration.

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

1. redeploy previous frontend/app commit (`sha256:760eb36551e0...`)
2. keep additive backend and schema support intact
3. do not touch backfill state
