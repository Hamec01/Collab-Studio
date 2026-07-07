# Stage 6 — Project tasks foundation

## Scope

- add project-scoped tasks as a separate additive capability;
- keep existing track task model and routes unchanged;
- expose additive `Project.tasks` in full project responses;
- render project tasks in the right panel when a project is selected without an active track.

## Implemented locally

- new additive Prisma model: `ProjectTask`;
- new routes:
  - `POST /api/projects/:projectId/tasks`
  - `PUT /api/projects/:projectId/tasks/:taskId`
- project serializer now returns `tasks` alongside existing project chat and tracks;
- right panel now shows project-level chat/tasks tabs when no track is selected;
- `TaskBoard` was generalized with copy overrides and reused for project tasks.

## Non-goals

- no due dates;
- no priority/source fields;
- no mentions, inbox or activity feed;
- no production deploy in this slice.

## Test coverage

- project context panel chat/tasks switching;
- viewer read-only project task state;
- existing `TaskBoard` async create/update coverage preserved.

## Rollout note

This slice is local-only. Production rollout should be done in a later Stage 6 deploy window together with the additive migration.
