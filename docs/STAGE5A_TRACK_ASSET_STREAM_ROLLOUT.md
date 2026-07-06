# Stage 5A TrackAsset stream rollout

## Scope

This runbook covers slice 6 only:

- TrackAsset-native stream route
- TrackAsset-native download route
- shared delivery service reused by legacy audio routes
- local verification and production rollout prerequisites

Out of scope:

- frontend player cutover
- TrackAsset-native uploads
- backfill execute
- Stage 5B

## Local verification

Required local checks:

- `npx prisma format`
- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run e2e`
- `git diff --check`
- `wc -l src/App.tsx`
- production image build
- isolated PostgreSQL + temporary uploads integration suite

Focused slice 6 assertions:

- mapped local asset stream/download returns expected bytes
- native local asset without legacy link is deliverable
- external asset returns stable conflict
- invalid storage key and symlink are rejected
- `UPLOADING` / `FAILED` / `DELETED` / `deletedAt` are denied
- range and HEAD behavior match contract
- DTO delivery URLs appear only for valid local audio assets

## Production deploy prerequisites

Before production deploy:

1. confirm `HEAD` is the approved slice 6 commit
2. confirm `git status` clean and `origin/main...main = 0 0`
3. confirm current production app and postgres are healthy
4. confirm Stage 5A additive migration `20260705150000_stage5a_track_asset_foundation` remains applied
5. confirm no pending production backfill execute
6. build new app image locally first

## API smoke after deploy

Minimum API smoke:

1. authenticated member `GET /api/projects/:projectId/tracks/:trackId`
2. verify `assets` array present
3. upload one small WAV through the existing legacy flow
4. verify `audioVersions[0].streamUrl` still works
5. inspect returned `assets` and capture native stream/download URLs
6. open native asset stream URL
7. open native asset download URL
8. verify HTTP `206` on a small `Range` request
9. verify external asset route returns stable conflict if an external row exists
10. delete smoke audio/project and confirm cleanup

### Production slice 6 result

- deployed app commit: `0a4ae6b`
- deployed image id: `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
- additive Stage 5A migration already remained applied:
  - `20260705150000_stage5a_track_asset_foundation`
- app healthy: yes
- postgres healthy: yes
- `/api/health`: `200`
- frontend `/`: `200`
- anonymous native route checks:
  - valid-shaped stream => `401 UNAUTHENTICATED`
  - valid-shaped download => `401 UNAUTHENTICATED`
  - malformed UUID while anonymous => `401 UNAUTHENTICATED`
  - this is accepted because auth runs before param validation on these routes
- no raw storage path leakage observed in anonymous responses
- no new Prisma/schema/runtime errors observed
- known warning still present:
  - `ERR_ERL_KEY_GEN_IPV6`
- read-only post-deploy counts remained:
  - `User=2`
  - `Project=1`
  - `Track=1`
  - `AudioVersion=0`
  - `TrackAsset=0`
  - uploads file count: `0`
- production backfill execute not run
- authenticated malformed-UUID validation smoke: manual pending
- owner functional smoke: manual pending

## Owner manual smoke checklist

1. log in as verified owner
2. open an existing private project
3. create a temporary project/track if needed
4. upload a small WAV
5. confirm the existing player still works through `audioVersions`
6. inspect the track JSON and verify `assets` contains native URLs
7. open the native stream URL
8. open the native download URL
9. seek in the player using the legacy route
10. upload a second audio version
11. attach an external link
12. confirm external asset does not expose false local URLs
13. delete temporary audio
14. delete temporary project
15. confirm no orphan file remains

Do not store cookies, tokens, or session secrets in shell history or docs.

## Stop conditions

Stop rollout if any of the following occurs:

- production app unhealthy after deploy
- new Prisma/schema/runtime errors in logs
- native route leaks storage path
- mapped local asset route does not return exact bytes
- download route emits unsafe header content
- outsider or anonymous access succeeds
- delete cleanup leaves orphan smoke files

## Rollback

Slice 6 is application-only.

Rollback order:

1. redeploy the last known-good app commit
2. keep the additive Stage 5A schema in place
3. do not run destructive DB rollback
4. preserve uploads as-is

## Cleanup

After manual smoke:

- delete temporary test assets via the existing legacy delete flow
- delete temporary project if created
- verify no orphan smoke uploads remain under the track/project path
