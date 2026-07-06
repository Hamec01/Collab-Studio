# Stage 6 — Track chat hardening

## Scope

- keep existing track chat API and data model;
- align frontend send capability with backend editor/owner-only write policy;
- make read-only chat state explicit for viewers;
- harden async submit path against double-submit and silent API failures.

## Implemented locally

- `canSend` on the track workspace now depends on the resolved project role and matches backend chat write permissions.
- Track chat input/button disable while a send request is in flight.
- Failed send requests stay in the chat form and surface an inline error instead of silently clearing UI state.
- Viewer/read-only state shows a disabled composer and a clear permission message.

## Non-goals

- no project chat;
- no schema or route changes;
- no mentions, inbox or notifications;
- no production deploy in this slice.

## Test coverage

- successful send clears the composer once and does not duplicate submits;
- failed send shows inline error and keeps existing message history stable;
- viewer chat renders as disabled/read-only;
- track context panel keeps the chat composer disabled for viewers.

## Rollout note

This slice is local-only. Production rollout should be batched with a later Stage 6 deployment window.
