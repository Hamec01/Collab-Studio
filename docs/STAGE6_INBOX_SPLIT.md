# Stage 6 slice 9 — Inbox split foundation

## Scope

- split workspace inbox UI into:
  - `Активность`
  - `Сообщения / запросы`
- aggregate global activity from additive `projects[].activity`;
- keep notifications as the current messages/requests source;
- add deterministic activity deep-links to exact project/track context where possible;
- production untouched.

## Current contract

- no new schema;
- no `NotificationDelivery` model yet;
- no email/push policy yet;
- no background job changes;
- no new fetch layer: inbox uses already loaded workspace data.

## Activity aggregation

Frontend builds a flattened activity list from all visible projects:

- input: `projects[].activity`;
- enrichment:
  - `projectName`
  - `trackId` from safe payload
  - `trackName` from safe payload
- ordering:
  - `createdAt DESC`
  - `id DESC`

## Navigation rules

- `audio_uploaded` -> track audio tab;
- `comment_created` / `comment_resolved` -> track team comments;
- `track_chat_message_created` -> track team chat;
- `track_task_*` -> track team tasks;
- `project_chat_message_created` -> project chat;
- `project_task_*` -> project tasks;
- project-level events without narrower context -> project activity tab.

## Non-goals

- server-side Inbox aggregation;
- pagination;
- message requests model;
- per-recipient activity filtering beyond project membership;
- Stage 6 production deploy in this slice.

## Rollback

- remove inbox tabs and activity aggregation helper;
- revert to notifications-only panel;
- keep additive `Project.activity` intact.
