# Stage 6 Slice 1 — Mobile line comments sheet

Дата: 6 июля 2026 года
Статус: local PASS, production untouched

## Scope

- mobile bottom sheet for line comments in lyrics workspace
- open from selected lyric line on mobile
- show selected line context and its comments
- create comment through existing `Comment` API
- resolve comment through existing permissions
- close from backdrop, close button, and browser Back without leaving the track
- keep shared audio player mounted

## Non-goals

- stable anchors
- threads/replies
- realtime
- inbox/activity
- editor redesign
- schema changes
- production deploy

## Existing contracts reused

- `Comment` model unchanged
- `lineIndex` unchanged
- existing routes:
  - `POST /api/projects/:projectId/tracks/:trackId/comments`
  - `PUT /api/projects/:projectId/tracks/:trackId/comments/:commentId/resolve`
- existing project comment permissions unchanged

## UX rules

- tapping a lyric line on mobile opens the comments sheet for that line
- sheet filters comments to `selectedLineIndex`
- empty state is line-aware
- read-only users see disabled input with explicit message
- async create/resolve errors stay inside the sheet
- browser Back closes the sheet instead of leaving the track route

## Local test matrix

- selected line opens line-scoped mobile sheet callback
- comments filtered by `lineIndex`
- create comment preserves selected line
- resolve action works under existing rights
- read-only state disables input
- Back closes sheet
- sibling player stays mounted

## Rollback

- frontend-only rollback via previous app commit
- no schema rollback in this slice
