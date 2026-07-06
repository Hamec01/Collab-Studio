# Stage 6 — Track tasks hardening

## Scope

- keep existing track task API and schema;
- harden task create/status UX around real async server writes;
- make viewer/read-only task state explicit;
- prevent silent task create/status failures in the track workspace.

## Implemented locally

- task creation now awaits the server response before clearing and closing the form;
- task status updates now await the server response and lock the edited control while pending;
- failed create/status requests show inline errors inside the task panel;
- viewer/read-only users now see disabled task controls and a clear permission message.

## Non-goals

- no schema changes;
- no project-level tasks;
- no due dates, priority or task source fields;
- no production deploy in this slice.

## Test coverage

- create success closes the form exactly once;
- create failure keeps the form open and shows an inline error;
- status update failure shows an inline error;
- viewer task state is disabled/read-only.

## Rollout note

This slice is local-only. Production rollout should be batched with a later Stage 6 deployment window.
