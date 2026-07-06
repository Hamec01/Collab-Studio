# Stage 6 — Project chat foundation

## Scope

- add project-scoped chat as a separate additive capability;
- keep existing track chat model and routes unchanged;
- expose additive `Project.chat` in full project responses;
- render project chat in the right panel when a project is selected without an active track.

## Implemented locally

- new additive Prisma model: `ProjectChatMessage`;
- new route: `POST /api/projects/:projectId/chat`;
- project serializer now returns `chat` messages alongside existing tracks;
- workspace query can now refresh a full project after project-chat writes;
- right panel reuses `ChatRoom` with project-specific copy and existing editor/owner send policy.

## Non-goals

- no mentions;
- no inbox/notifications redesign;
- no project tasks;
- no production deploy in this slice.

## Test coverage

- project refresh abort behavior;
- project chat panel copy and viewer read-only state;
- existing `ChatRoom` async send coverage preserved.

## Rollout note

This slice is local-only. Production rollout should be done in a later Stage 6 deploy window together with the additive migration.
