# Stage 6 — notification deep-links

## Scope

- добавить deterministic client-side resolution для `Notification -> exact workspace context`;
- открывать track notifications в правильный tab/sidebar context;
- открывать project notifications в правильный project sidebar context;
- mark-as-read не должен ломать navigation;
- production deploy в этом slice не выполняется.

## Non-goals

- не добавлять новые notification tables или schema migrations;
- не переводить notifications на `ActivityEvent`;
- не добавлять realtime, inbox batching или email delivery;
- не менять existing notification payload contract на backend.

## Implemented

### Target resolution

Добавлен helper `src/features/notifications/notificationTargets.ts`.

Current mapping:

- `audio_uploaded` + `trackId` → `/app/projects/:projectId/tracks/:trackId/audio`
- track `comment_*` → `/app/projects/:projectId/tracks/:trackId/team#comments`
- track `*task*` → `/app/projects/:projectId/tracks/:trackId/team#tasks`
- track `*chat*` → `/app/projects/:projectId/tracks/:trackId/team#chat`
- fallback track notification → track team comments
- project `*task*` → `/app/projects/:projectId#project-tasks`
- other project notifications → `/app/projects/:projectId#project-chat`

### App routing integration

`App.tsx` now:

- reads `location.hash` for track team sidebars;
- reads `#project-chat` / `#project-tasks` for project-only context;
- opens notifications through a single `handleOpenNotification()` path;
- marks unread notification as read before local state sync and navigation;
- keeps route-driven mobile state intact while restoring the exact sidebar context.

### UI behavior

`NotificationsPanel` notification cards are now actionable buttons:

- click notification → opens exact context;
- click read toggle → marks read only;
- read action does not bubble into navigation.

### Project sidebar control

`ProjectContextPanel` was converted to a controlled sidebar API:

- `activeSidebar`
- `onSelectSidebar`

This lets route/hash navigation and notifications open the exact project chat/tasks context without duplicating local state.

## Tests

Focused local coverage:

- `notificationTargets.spec.ts`
  - comment → comments deep-link
  - audio upload → audio tab
  - project chat → project chat context
  - project task → project tasks context
- `NotificationsPanel.spec.tsx`
  - card click opens notification
  - read button marks read without opening
- `ProjectContextPanel.spec.tsx`
  - controlled sidebar selection callback
  - read-only task state preserved

## Production rollout prerequisites

- full local gate PASS;
- controlled production deploy in a separate turn;
- authenticated smoke should confirm:
  - comment notification opens exact track comments context;
  - task notification opens exact tasks context;
  - project chat/task notifications open project sidebar without losing current project route;
  - mobile navigation stays stable.
