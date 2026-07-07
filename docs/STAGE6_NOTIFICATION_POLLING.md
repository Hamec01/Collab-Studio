# Stage 6 — notification polling and unread consistency

## Scope

- добавить controlled background polling для notifications;
- revalidate notifications on focus / visibility / online recovery;
- удержать unread state консистентным после open / read / read-all;
- исключить duplicate notification actions во время pending state;
- production deploy в этом slice не выполняется.

## Non-goals

- не добавлять `Inbox`, `ActivityEvent` consumption или email/push delivery;
- не менять notification schema;
- не добавлять realtime transport;
- не менять route/deep-link contract из предыдущего slice.

## Implemented

### Controlled polling

`useWorkspaceQuery` теперь:

- polls notifications every `60s`;
- polls only when:
  - user authenticated;
  - workspace already loaded;
  - `document.visibilityState === "visible"`;
  - browser is online;
- revalidates notifications on:
  - `window.focus`
  - `document.visibilitychange`
  - `window.online`
- suppresses polling errors to avoid noisy global failures;
- prevents overlapping notification sync requests.

### Unread consistency

Notification actions in `App.tsx` now:

- block duplicate read/open/read-all actions while pending;
- perform optimistic local unread update;
- re-fetch notifications after successful mutation for server reconciliation;
- keep navigation separate from read action;
- surface mutation failures through existing global error channel.

### Panel behavior

`NotificationsPanel` now supports:

- per-notification pending disabled state;
- batch read-all disabled state;
- lightweight syncing indicator.

## Tests

Focused local coverage:

- `useWorkspaceQuery.spec.tsx`
  - interval polling when workspace is ready
  - focus-triggered revalidation
  - hidden/offline polling suppression
- `NotificationsPanel.spec.tsx`
  - open notification action
  - read action isolation
  - pending disable state
  - syncing/read-all pending state

## Rollout notes

This slice is local-only.

Production rollout for Stage 6 notifications should verify:

- unread badge updates after background polling;
- hidden tab does not keep polling aggressively;
- refocus pulls new notifications;
- read/open actions cannot be double-submitted;
- deep-links from the previous slice still open the exact context.
