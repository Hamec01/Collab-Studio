# Stage 4B legacy Comment retirement note

Дата: 4 июля 2026 года
Статус: planning only, no production backfill in slice 7

## Что сделано в slice 7

- Добавлены additive `DiscussionThread` и `DiscussionMessage` для lyrics-only discussions.
- Existing `Comment` rows не удаляются и не переписываются.
- Read path использует deterministic compatibility adapter: legacy `Comment.lineIndex` отображается рядом с новым discussions UI.
- При `lyricsStructuredEditor=false` Stage 4A legacy comments fallback сохраняется без изменений.

## Почему automatic backfill не делался

- Production сейчас допускает временный app/db skew до финального Stage 4B deploy.
- Backfill legacy comments в новые threads создаст irreversible dual-history риск без отдельного rollout окна.
- Для line-based comments нужны явные правила: separator lines, deleted blocks, duplicate quote matches и resolved state parity.

## План будущего controlled backfill

1. Freeze writes в legacy `Comment` на новом app path после финального Stage 4B deploy window.
2. Snapshot existing `Comment` rows и подготовить dry-run report:
   - count by project/track;
   - count with `lineIndex IS NULL`;
   - count on separator/blank lines;
   - count with deleted authors.
3. Deterministically map each comment to:
   - general lyrics thread, если `lineIndex IS NULL`;
   - anchored lyrics thread, если `lineIndex` однозначно сопоставляется current block anchor policy;
   - orphaned compatibility thread, если однозначного block mapping нет.
4. Create one `DiscussionThread` + initial `DiscussionMessage` per legacy comment in bounded batches.
5. Preserve legacy provenance in payload/metadata for audit and rollback comparison.
6. Run read parity checks between:
   - legacy adapter output;
   - backfilled discussion output.
7. Только после observation period перевести `flag=true` path на read-prefer-new-with-legacy-fallback.
8. Лишь в отдельном later release обсуждать write-disable/read-disable/drop для `Comment`.

## Retirement prerequisites

- final Stage 4B production deploy complete;
- no unresolved parity mismatches;
- no orphan/ambiguous spike after backfill rehearsal;
- rollback note for read path documented;
- product sign-off on legacy thread UX and deleted-author presentation.
