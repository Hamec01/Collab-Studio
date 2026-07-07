# Stage 6 slice 8 — project activity feed foundation

## Scope

- additive `Project.activity` read contract on top of existing `ActivityEvent`;
- compact project activity UI tab;
- latest-first project activity feed for current members;
- activity writes for current collaboration/audio flows:
  - line comments create/resolve;
  - project chat;
  - track chat;
  - project tasks create/update;
  - track tasks create/update;
  - audio upload.

## API contract

`GET /api/projects`
`GET /api/projects/:projectId`

Each full project response now includes:

```ts
activity: Array<{
  id: string;
  projectId: string;
  actorId: string | null;
  actor: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  timestamp: string;
}>
```

## Read rules

- membership parity with existing project read rules;
- project members can read activity;
- outsiders do not receive project activity;
- feed is additive and does not replace notifications;
- order is deterministic: `createdAt DESC`, then `id DESC`;
- latest 20 events only.

## UI contract

- project sidebar adds `Активность`;
- desktop/mobile project workspace can switch to the activity tab;
- no separate fetch layer was introduced in this slice;
- existing project refresh paths keep activity current.

## Payload safety

- no storage keys;
- no filesystem paths;
- no raw upload locations;
- only safe event payload fields needed for summaries.

## Non-goals

- Inbox split;
- email/push delivery;
- notification delivery model;
- activity deep links;
- event sourcing;
- pagination/infinite scroll;
- production deploy in this slice.

## Rollback

- remove additive `activity` serialization/include;
- remove activity tab;
- keep existing `ActivityEvent` table and historical rows untouched.
