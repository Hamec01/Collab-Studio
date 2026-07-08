# Stage 9 — public profiles foundation

## Slice 1 scope

- additive public-profile fields on `User`;
- private authenticated profile settings API;
- unauthenticated public profile read route;
- public/private serializer split;
- minimal frontend settings page at `/app/profile`;
- minimal public page at `/u/:handle`.

## Non-goals

- publications;
- discover/search;
- follows;
- public comments;
- DM;
- avatar upload pipeline;
- production deploy.

## Data model

Additive `User` fields:

- `isPublicProfile Boolean @default(false)`
- `bio String?`
- `location String?`
- `website String?`

Migration:

- `20260708090000_stage9_public_profile_foundation`

## API contract

Private authenticated:

- `GET /api/profile/me`
- `PUT /api/profile/me`

Public unauthenticated:

- `GET /api/public/users/:handle`

## Public boundary

Public serializer exposes only:

- `id`
- `username`
- `displayName`
- `avatarUrl`
- `bio`
- `location`
- `website`
- `createdAt`
- `updatedAt`

Never exposed publicly:

- `email`
- `role`
- `emailVerifiedAt`
- `ageAcknowledgedAt`
- `passwordHash`
- session data

## Frontend behavior

- `/app/profile` lets the authenticated user edit display name and public-profile opt-in fields.
- `/u/:handle` renders the public profile without requiring auth.
- Public profile lookup is case-insensitive by username.
- If `isPublicProfile=false`, public route returns `404`.

## Validation

- `displayName`: required, max 120
- `bio`: max 500
- `location`: max 120
- `website`: optional, valid `http/https` only

## Rollback

- app rollback: return to previous commit;
- DB rollback: restore from backup rather than dropping fields in-place.
