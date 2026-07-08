# Stage 9 — work publication core

## Slice 2 scope

- additive `Publication` model for future public works/collabs;
- implemented only `WORK` flow in this slice;
- authenticated private publication management page at `/app/publications`;
- unauthenticated public work page at `/works/:slug`;
- server-side snapshot-at-publish flow using current track lyrics state and one selected local `TrackAsset`;
- unauthenticated public audio delivery for the selected published asset only.

## Non-goals

- collab publications;
- discover pages;
- likes/favorites/plays;
- public comments;
- publication moderation;
- production deploy.

## Migration

- `20260708113000_stage9_work_publications_core`

## Data model

Additive enums:

- `PublicationKind { WORK, COLLAB }`
- `PublicationStatus { PUBLISHED, ARCHIVED }`

Additive model:

- `Publication.id`
- `Publication.kind`
- `Publication.status`
- `Publication.slug`
- `Publication.authorUserId`
- `Publication.projectId`
- `Publication.trackId`
- `Publication.snapshotId`
- `Publication.selectedAssetId`
- `Publication.title`
- `Publication.description`
- `Publication.coverImageUrl`
- `Publication.tags`
- `Publication.language`
- `Publication.metadata`
- `Publication.publishedAt`
- `Publication.archivedAt`
- `Publication.expiresAt`
- `Publication.createdAt`
- `Publication.updatedAt`

## Publication contract

This slice publishes only one public `WORK` per create request:

1. user selects a track;
2. server resolves editor/owner write access plus verified-write gate;
3. server picks one deliverable local `TrackAsset` deterministically:
   - `isPrimary desc`
   - `versionNumber desc`
   - `createdAt desc`
   - `id asc`
4. server snapshots current lyrics state into a new `TrackSnapshot`;
5. server binds exactly that selected asset into the snapshot;
6. server creates a public `Publication` with unique slug.

The publication never exposes the full private workspace.

## Public boundary

Public work response exposes only:

- public slug/title/description/cover/tags/language/publishedAt;
- safe author summary;
- selected lyrics snapshot plain text;
- selected published audio metadata and public stream/download URLs.

Never exposed publicly:

- private project members;
- workspace chats/tasks/comments;
- track/project ids in the public DTO;
- raw `storageKey`;
- filesystem paths;
- break-glass/session/auth data.

## API contract

Private authenticated:

- `GET /api/publications/mine`
- `POST /api/publications/works`
- `POST /api/publications/:publicationId/archive`

Public unauthenticated:

- `GET /api/public/works/:slug`
- `GET|HEAD /api/public/works/:slug/stream`
- `GET /api/public/works/:slug/download`

## Delivery rules

- public work audio is available only when selected asset is:
  - `status=READY`
  - `deletedAt=null`
  - local
  - audio MIME
  - safe deliverable kind
- external/native-public publication delivery is not implemented in this slice;
- archived work returns `404` on the public route.

## Frontend behavior

- `/app/publications` lets authenticated owner/editor users publish a track as a public work.
- Publication creation does not expose snapshot internals in the UI; server captures the publish-time snapshot.
- `/works/:slug` loads without auth and renders:
  - audio player;
  - public metadata;
  - lyrics snapshot;
  - safe author profile link only when the author profile is public.

## Rollback

- app rollback: return to previous commit;
- DB rollback: restore from backup rather than editing/deleting publication rows manually.

