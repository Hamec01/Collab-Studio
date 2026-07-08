# CollabStudio — implementation status

Последнее обновление: 7 июля 2026 года (Stage 6 slice 9 local PASS)
Каноническое ТЗ: `docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md`

## Правила

- Статусы: `pending`, `in_progress`, `blocked`, `completed`.
- Одновременно только один Stage может быть `in_progress`.
- Stage становится `completed` только после полного Gate из мастер-карты.
- Частичная работа записывается в журнал slices, но не закрывает Stage.

## Текущая точка

- Branch: `main`
- Stage 4A baseline commit: `f2875d0`
- Stage 4B foundation commit: `97aca32`
- Active Stage: `Stage 9`
- Active slice: Stage 9 slice 2 completed locally; production at Stage 7 (migrations not applied for Stage 9)
- Production: `https://collabstudio.run/`
- Deployment: один VPS, один production instance

## Проверенный baseline

- Clean pipeline `npm ci → npm run prisma:generate → npm run lint → npm test → npm run build → npm run e2e` — проходит.
- `npm test` объединяет unit + component tests.
- Component test foundation добавлен (Vitest + RTL + jsdom + jest-dom).
- Default `npm run e2e` изолирован локально (`127.0.0.1`) и не ходит в production.
- Добавлен явный `npm run e2e:production-smoke` для отдельного ручного запуска.
- CI workflow добавлен: `.github/workflows/ci.yml`.
- Feature flag infrastructure добавлена: `src/app/featureFlags.ts` + tests.
- Реальный isolated restore drill выполнен и задокументирован: `docs/RESTORE_DRILL_2026-07-02.md`.

## Stage status

| Stage | Статус | Gate |
|---|---|---|
| Stage 0 — Baseline, pipeline и recovery | completed | Пройден |
| Stage 1 — Router и state boundaries | completed | Пройден |
| Stage 2 — i18n, design tokens и shell | completed | Пройден |
| Stage 3 — Projects, scopes и invitations | completed | Пройден |
| Stage 4A — Plain-text Lyrics Workspace | completed | Пройден, committed at `f2875d0` |
| Stage 4B — WYSIWYG и stable anchors | completed | Production completed at app commit `ca6b93e`; migrations applied, API smoke PASS, owner-confirmed authenticated mobile smoke PASS |
| Stage 5A — TrackAsset migration | completed | Production foundation, delivery routes and asset-first frontend cutover are live; legacy fallback preserved; backfill execute NOT run |
| Stage 5B — Player и audio annotations | completed | Slice 1.1 completed locally: TrackAsset-bound annotations hardened; production deploy not performed |
| Stage 6 — Discussions, chats, tasks, activity, Inbox | completed | Локально завершён |
| Stage 7 — Ready review, retention и export | completed | Локально завершён |
| Stage 8 — PWA и offline lyrics | completed | Завершён локально: SW + App Shell + Offline drafts + Logout SW cache clear |
| Stage 9 — Public profiles и publications | in-progress | Slice 1-2 завершены локально (public profiles + work publications); production deploy pending |
| Stage 10 — Discover, follows, comments, DM | pending | Не начат |
| Stage 11 — SEO, admin, observability, hardening | pending | Не начат |
| Stage 12 — Pricing/payment | pending | Заблокирован до beta-метрик и отдельного решения |

## Следующий разрешённый slice

Stage 5A:

1. Stage 4B завершён в production на app commit `ca6b93e`.
2. Applied migrations:
   - `20260703010000_stage4a_lyrics_workspace`
   - `20260703020000_stage4b_structured_lyrics_persistence`
   - `20260704120000_stage4b_lyrics_discussions_and_anchors`
3. Production backup перед migration:
   - `/home/deploy/backups/collabstudio/stage4b/prod-pre-migrate-20260704T234113Z.dump`
4. Production verification:
   - API smoke PASS
   - owner-confirmed authenticated mobile smoke PASS
5. Follow-up warning:
   - `ERR_ERL_KEY_GEN_IPV6` остаётся отдельным hardening bug и не блокирует Stage 4B completion.
6. Slice 1 завершён локально: TrackAsset audit, additive schema/migration, compatibility helpers, additive `Track.assets`, isolated rehearsal and rollback plan.
7. Production migration `20260705150000_stage5a_track_asset_foundation` уже применена.
8. Slice 2 завершён локально: stable additive `Track.assets`, partial-backfill-safe merge, public DTO hardening и isolated PostgreSQL API integration coverage.
9. Slice 3 завершён локально: все новые local/external audio uploads теперь dual-write в `AudioVersion` + linked `TrackAsset`; legacy delete compatibility soft-deletes linked asset metadata.
10. Slice 4 завершён локально: добавлен resumable/idempotent CLI backfill `AudioVersion -> TrackAsset`, isolated execute rehearsal PASS, restored-backup dry-run PASS.
11. Production rollout slice 5 завершён:
    - deployed app commit: `b353b20`
    - migration already applied: `20260705150000_stage5a_track_asset_foundation`
    - backup: `/home/deploy/backups/collabstudio/stage5a/prod-pre-stage5a-20260705T230032Z.dump`
    - backup sha256: `d5e9878d121efe79d6b5ed329d3d53d679a0221ff9d180a6a674803fbd4fe619`
    - production dry-run #1: `/home/deploy/backups/collabstudio/stage5a/prod-stage5a-backfill-dry-run-20260706T075928Z.json`
    - production dry-run #2: `/home/deploy/backups/collabstudio/stage5a/prod-stage5a-backfill-dry-run-20260706T075936Z.json`
    - dry-run counters: `scanned=0 eligible=0 created=0 wouldCreate=0 skipped=0 raced=0 missing=0 conflicts=0 failed=0`
    - production backfill execute NOT run
12. Owner-authenticated smoke from this shell was not attempted without a verified reusable session; owner manual smoke remains required and is not treated as a packaging failure.
13. Slice 6 production delivery завершён:
    - добавлены native routes:
      - `GET|HEAD /api/projects/:projectId/tracks/:trackId/assets/:assetId/stream`
      - `GET /api/projects/:projectId/tracks/:trackId/assets/:assetId/download`
    - shared local delivery service теперь используется и legacy `AudioVersion`, и native `TrackAsset` routes
    - legacy session-auth stream/download hardening added without changing guest-token stream support
    - frontend/player still reads `audioVersions`
    - production deployed app commit: `0a4ae6b`
    - deployed image id: `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
    - app/postgres healthy; health and frontend `200`
    - anonymous native stream/download routes return `401 UNAUTHENTICATED`
    - malformed UUID while anonymous also returns `401` by intentional auth-first ordering
    - no Prisma/schema/runtime errors beyond existing `ERR_ERL_KEY_GEN_IPV6` warning
    - DB counts unchanged after deploy: `User=2`, `Project=1`, `Track=1`, `AudioVersion=0`, `TrackAsset=0`
    - uploads file count unchanged: `0`
    - production backfill execute NOT run
    - owner-authenticated validation + functional smoke manual pending because no reusable verified session was available in this shell
14. Slice 7 завершён локально:
    - frontend player now uses normalized playable sources built from additive `assets` plus legacy fallback
    - mapped assets suppress duplicate legacy `audioVersions`
    - legacy-only, partial-backfill, native-only and external-only states covered locally
    - upload flow remains refetch-based; backend response contract unchanged
    - frontend production deploy intentionally not performed
    - owner production smoke remains manual-pending for the future rollout turn
15. Slice 7 production cutover завершён:
    - deployed app commit: `85be76c`
    - deployed image id: `sha256:5f9fc4e65d3b18df3aa9ba2680e4ece7320a3e1282debd2d26dab0e22dfa2974`
    - previous production image (slice 6): `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
    - frontend asset-first cutover live in production
    - legacy audioVersions fallback preserved and validated
    - authenticated owner smoke PASS (A: empty state, B: first upload+asset-native URL+stream HEAD 200, C: second upload+asset-first ordering+legacy retained, D: external no-streamUrl, G: cleanup)
    - mobile smoke: manual-pending (F)
    - legacy-only fallback: no natural legacy-only row in production, locally covered; manual-not-reproducible in production without fixture
    - DB counts at baseline after smoke: `User=2`, `Project=1`, `Track=1`, `AudioVersion=0`, `TrackAsset=0`
    - uploads file count at baseline: `0`
    - migration unchanged: 7 migrations all finished
    - production backfill execute NOT run
    - health/frontend `200` post-deploy
    - Stage 5B не начинать без отдельного подтверждения
16. Slice 8 завершён локально:
    - shared playback engine (PlayerProvider) created with single HTMLAudioElement and React Context
    - AudioPlayer refactored to consume shared player (removed local audio ref/state)
    - StickyAudioPlayer (mini-player) implemented with full controls: play/pause, time display, progress bar, track navigation
    - App.tsx integration: useEffect loads sources into shared player, conditional sticky player rendering
    - mobile navigation verified: bottom nav "Projects" button already provides project list access
    - unit tests added: PlayerProvider.test.tsx (MockAudioElement pattern), StickyAudioPlayer.test.tsx
    - integration tests updated: AudioPlayer.spec.tsx, trackAudioCutover.integration.spec.tsx wrapped in PlayerProvider
    - e2e smoke tests added: desktop player structure, mobile viewport navigation
    - full local gate PASS: format/validate/generate/lint/test (169 tests)/build/e2e (3 tests)/diff check/Docker build
    - App.tsx: 1236 lines
    - production untouched
17. Stage 5A считается завершённым по локальным и production gates; legacy `audioVersions` compatibility сохранена, backfill execute intentionally not run because production has `AudioVersion=0`.
18. Stage 5B slice 1 завершён локально:
    - `Annotation.trackAssetId` added as nullable additive field with FK to `TrackAsset`
    - create-annotation API accepts `trackAssetId` and rejects cross-track/cross-project assets
    - frontend annotation creation now sends active `TrackAsset.id`
    - annotation list now shows only current asset annotations plus legacy `trackAssetId=null` fallback
    - clicking an annotation still seeks through shared playback engine
    - legacy-only and native-only audio states are covered locally
    - production deploy intentionally not performed
19. Stage 5B slice 1.1 завершён локально:
    - `Annotation.trackAssetId` FK hardened from `ON DELETE SET NULL` to `ON DELETE CASCADE` via new additive migration
    - deleting a `TrackAsset` now removes its bound annotations instead of reclassifying them as legacy fallback
    - timestamp annotation creation now depends on real in-app playback capability, not just local/external labeling
    - external asset with reliable shared-player playback can annotate; external link without timeline support stays disabled
    - outsider annotation create request is rejected under existing access policy and does not write DB rows
    - production deploy intentionally not performed
20. Stage 6 slice 1 завершён локально:
    - mobile line comments sheet now opens from lyric line selection
    - sheet filters comments by `lineIndex` and preserves selected line context
    - create/resolve use existing `Comment` API and permissions without schema changes
    - read-only, loading, empty and error states are covered in the sheet
    - browser Back closes the sheet without leaving the track route
    - shared audio player remains mounted while the sheet is open
    - production deploy intentionally not performed
21. Stage 6 slice 2 завершён локально:
    - track chat send gating now matches backend `canChat` policy: only owner/editor can send
    - viewer/read-only users now see disabled input plus explicit permission message instead of a misleading active form
    - chat submit now awaits async send, blocks double-submit while pending and surfaces API errors inline
    - focused component coverage added for send success, send failure and viewer-disabled chat state
    - production deploy intentionally not performed
22. Stage 6 slice 3 завершён локально:
    - track task create/status UX now awaits server writes instead of assuming synchronous success
    - failed create and failed status updates surface inline error state without silently resetting the form
    - viewer/read-only users now see disabled task controls plus explicit permission guidance
    - focused component coverage added for create success, create failure, status failure and viewer-disabled task state
    - production deploy intentionally not performed
23. Stage 6 slice 4 завершён локально:
    - added additive `ProjectChatMessage` foundation without changing existing track chat storage or contracts
    - full `Project` responses now include additive project-scoped `chat`
    - new `POST /api/projects/:projectId/chat` uses existing project membership and chat capability checks
    - right panel now shows project chat when a project is selected without an active track
    - project chat reuses hardened async/read-only `ChatRoom` UX with project-specific copy
    - production migration and deploy intentionally not performed
24. Stage 6 slice 5 завершён локально:
    - added additive `ProjectTask` foundation without changing existing track task storage or contracts
    - full `Project` responses now include additive project-scoped `tasks`
    - new `POST/PUT /api/projects/:projectId/tasks` routes use existing membership and `canCreateTask` checks
    - right panel for project-without-track now has chat/tasks tabs instead of chat-only
    - project tasks reuse hardened async/read-only `TaskBoard` UX with project-specific copy
    - production migration and deploy intentionally not performed
25. Stage 6 slice 6 завершён локально:
    - notifications now resolve into exact track/project workspace context via deterministic deep-link helper
    - track notifications open the correct audio/team sidebar context
    - project notifications open the correct project chat/tasks sidebar context
    - read action remains separate from open-navigation behavior
    - production deploy intentionally not performed
26. Stage 6 slice 7 завершён локально:
    - notifications now revalidate on controlled background interval, focus, visibility restore and online recovery
    - polling runs only for visible authenticated workspace and avoids overlapping requests
    - unread actions now use pending guards and post-mutation revalidation for consistency
    - production deploy intentionally not performed
27. Stage 6 slice 8 завершён локально:
    - additive `Project.activity` now serializes latest `ActivityEvent` rows in full project responses
    - project workspace adds compact `Активность` tab without separate fetch layer
    - current comments/chat/tasks/audio upload flows now append safe activity events for the project feed
    - production deploy intentionally not performed
28. Stage 6 slice 9 завершён локально:
    - workspace inbox now splits into `Активность` and `Сообщения / запросы`
    - global activity list is aggregated from already loaded `projects[].activity` without a new fetch layer
    - activity entries now deep-link into exact track/project context where deterministically available
    - existing notifications remain the source for messages/requests and unread controls
    - production deploy intentionally not performed

## 29. Следующий шаг — только следующий Stage 7 slice после отдельного подтверждения.

## Журнал slices

| Дата | Stage/slice | Результат | Commit/branch | Gate/tests | Следующий шаг |
|---|---|---|---|---|---|
| 2026-07-02 | Baseline audit | Зафиксирован текущий baseline | `main@010efea` | generate/lint/unit/build проходят в правильной ручной последовательности | Stage 0 slice 1 |
| 2026-07-02 | Stage 0 blocker-fix slice | Закрыты блокеры: local e2e default, component tests, CI, feature flags, isolated restore drill, artifact ignore | `main` (working tree changes, без commit) | clean pipeline + e2e проходят; restore drill PASS в isolated env | Ожидание подтверждения перед Stage 1 |
| 2026-07-02 | Stage 1 final slices | Введены boundary: AuthProvider, route selection URL source-of-truth, query/server-state hook c abort, PlayerProvider, draft interface; добавлены тесты route/auth/player/stale-abort | `main` | lint/test/build/e2e PASS; component tests 25 PASS | Stage 2 только после отдельного подтверждения |
| 2026-07-02 | Stage 2 final slices | Введены foundation: ru/en i18n provider, design tokens, UI primitives, responsive AppShell, safe-area layout, cover/avatar fallbacks, viewport+a11y tests | `main` | lint/test/build/e2e PASS; component tests 35 PASS | Stage 3 только после отдельного подтверждения |
| 2026-07-03 | Stage 3 final slices | Добавлены access foundations: capability presets/custom, invite lifecycle (create/accept/revoke/expiry), track grants, guest links (listen/no-download), ownership transfer audit, break-glass audit validation, verification+18+ write gates, additive migration + ADR | `main` | lint/test/build/e2e PASS; component tests 45 PASS; migrate deploy validated on empty+existing DB | Stage 4A только после отдельного подтверждения |
| 2026-07-03 | Stage 4A final slices | Добавлены read-first plain-text workspace, explicit edit lease, monotonic lyricsRevision/OCC, safe recovery/compare UX, persistent player placeholder и mobile context comments; App.tsx не увеличен | `main@f2875d0` | schema valid; lint/test/build/e2e PASS; component tests 59 PASS; migration PASS на empty+existing DB | Stage 4B foundation только после отдельного подтверждения |
| 2026-07-03 | Stage 4B slices 1–2 | Зафиксированы Lexical ADR, app-owned document contract, pure codec, deterministic serialization и migration rehearsal plan | `main@97aca32` | lint/test/build/diff PASS; 68 Vitest tests | Stage 4B persistence только после отдельного подтверждения |
| 2026-07-03 | Stage 4B slices 3–4 | Добавлены nullable structured fields, legacy/structured dual-read/write, atomic lease+OCC save и bounded resumable backfill | `main`, local commit | prisma validate; empty/existing/repeat/Stage 4A rollback rehearsal; lint/test/build/e2e/diff PASS; 77 Vitest tests; zero mismatches | Следующий Stage 4B slice только после отдельного подтверждения |
| 2026-07-04 | Stage 4B slice 5 | Добавлен limited Lexical editor adapter: paragraph/heading, bold/italic, undo/redo, canonical paste, structured load/save и additive local draft envelope; flag default false | `main`, local commit | lint/test/build/e2e/diff PASS; 89 tests; App.tsx 1182 lines; EDITOR UI PASSED | Следующий Stage 4B slice только после отдельного подтверждения |
| 2026-07-04 | Stage 4B slice 6 | Добавлены structured/manual lyric snapshots, restore через обычный reviewed save с existing lease+OCC semantics, legacy snapshot compatibility и TXT export from derived plain text | `main`, local commit | prisma validate; lint/test/build/e2e/diff PASS; 99 tests; App.tsx 1159 lines; SNAPSHOTS PASSED | Следующий Stage 4B slice только после отдельного подтверждения |
| 2026-07-04 | Bugfix — project/track creation regression | Исправлены atomic single project+track creation, unified verified-writer rule for project/track writes и awaited ProjectList submit UX с error/loading states | `main`, local commit | lint/test/build/e2e/diff PASS; 108 tests; manual local HTTP reproduction PASS; App.tsx 1159 lines; TRACK CREATION REGRESSION FIXED | Возврат к roadmap только после отдельного подтверждения |
| 2026-07-04 | Stage 4B slice 7 | Добавлены lyrics-only discussions, stable block-ID anchors, exact/relocated/ambiguous/orphaned resolution, legacy `Comment.lineIndex` compatibility adapter, manual re-anchor, mobile discussion sheet и extracted discussion hook; flag default false сохранён | `main`, local commit | prisma validate; lint/test/build/e2e/diff PASS; 121 tests; App.tsx 1211 lines; DISCUSSIONS AND ANCHORS PASSED | Следующий шаг — финальный Stage 4B deploy window без автоматического legacy Comment backfill |
| 2026-07-05 | Stage 4B production completion | Production app выровнен с уже применёнными Stage 4B migrations; mobile lyrics interaction fix deployed; API smoke PASS; owner-confirmed authenticated mobile smoke PASS; backup path сохранён; `ERR_ERL_KEY_GEN_IPV6` вынесен в follow-up warning | `main@ca6b93e` | Production health PASS; app/postgres healthy; no Prisma/missing-column errors | Следующий шаг — Stage 5A только после отдельного подтверждения |
| 2026-07-05 | Stage 5A slice 1 | Выполнены TrackAsset audit, additive Prisma schema/migration, compatibility helpers, additive `Track.assets` serialization, storage/path safety tests и isolated rehearsal на empty + restored-backup DB; partial-backfill dual-read merge сохранён | `main`, local diff | prisma format/validate/generate PASS; empty + restored-backup migrate rehearse PASS; production untouched | Следующий шаг — Stage 5A slice 2 только после отдельного подтверждения |
| 2026-07-05 | Stage 5A slice 2 | Доведён dual-read API contract: deterministic `Track.assets`, partial-backfill-safe merge, DTO hardening без raw storage paths, status/deleted filtering и isolated PostgreSQL integration coverage для full track responses и access rules | `main`, local diff | focused isolated integration PASS; production untouched | Следующий шаг — Stage 5A slice 3 только после отдельного подтверждения |
| 2026-07-05 | Stage 5A slice 3 | Введён central dual-write service для новых local/external audio uploads: атомарный `AudioVersion` + linked `TrackAsset`, cleanup after DB failure, legacy delete compatibility с soft-delete linked asset metadata и isolated PostgreSQL+uploads integration coverage | `main`, local diff | focused isolated upload/delete integration PASS; production untouched | Следующий шаг — Stage 5A slice 4 только после отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 4 | Добавлен resumable backfill CLI для `AudioVersion -> TrackAsset`: dry-run/execute, stable compound cursor, missing/conflict reporting, primary preservation, production execute guard; isolated seeded execute rehearsal PASS и restored-backup dry-run PASS | `main`, local diff | focused CLI integration PASS; restored-backup dry-run PASS; production untouched | Следующий шаг — следующий Stage 5A slice только после отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 5 | Исправлен runtime packaging для backfill CLI, production app обновлён до `b353b20`, exact production dry-run выполнен дважды и вернул clean JSON без DB writes; additive migration уже была applied, execute intentionally not run | `main@b353b20` | production app/postgres healthy; dry-run #1 PASS; dry-run #2/idempotency PASS; counts unchanged (`AudioVersion=0`, `TrackAsset=0`) | Следующий шаг — только следующий Stage 5A slice после отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 6 | TrackAsset-native delivery routes deployed to production at `0a4ae6b`; anonymous native route smoke PASS under auth-first contract, shared delivery service live, DB counts unchanged, frontend still on `audioVersions`, owner authenticated smoke manual-pending | `main@0a4ae6b` | production health PASS; app/postgres healthy; no new Prisma/schema/runtime errors; image `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2` | Следующий шаг — только следующий Stage 5A slice после отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 7 | Локально выполнен frontend asset-first cutover: введён normalized playable source model, player/selection switched to additive `Track.assets` with legacy fallback, external-only sources rendered as safe links, upload contract unchanged, production untouched | `main`, local diff | focused selector/component PASS; production untouched | Следующий шаг — production rollout этого slice только после отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 7 production cutover | Frontend asset-first deployed to production: app `85be76c` image `5f9fc4e65d3b`; owner smoke A/B/C/D/G PASS; legacy fallback preserved; DB baseline confirmed; no new migrations; backfill execute NOT run; mobile smoke manual-pending | `main@85be76c` | health 200; app/postgres healthy; non-auth HTML/JS/CSS 200; asset routes 401 anon; no storageKey leak | Stage 5B не начинать без отдельного подтверждения |
| 2026-07-06 | Stage 5A slice 8 | Локально выполнена player consolidation: shared playback engine eliminates duplicate audio elements and state desync; sticky mini-player with full controls; mobile bottom nav already functional; new files: PlayerProvider.tsx/test, StickyAudioPlayer.tsx/test; refactored: AudioPlayer, App.tsx; e2e smoke tests added; production untouched | `main`, local diff | lint/test (169)/build/e2e (3)/diff/Docker build PASS; App.tsx 1236 lines; production untouched | Следующий шаг — только следующий Stage 5A slice после отдельного подтверждения |
| 2026-07-07 | Stage 6 slice 6 | Локально добавлены notification deep-links: notifications now open exact track/project workspace context, project sidebar became controlled for route-driven context restore, and read/open actions are separated in the panel | `main`, local diff | focused lint + Vitest PASS; production untouched | Следующий шаг — только следующий Stage 6 slice после отдельного подтверждения |
| 2026-07-07 | Stage 6 slice 7 | Локально добавлены controlled notification polling и unread consistency: notifications revalidate on interval/focus/visibility/online, duplicate read actions are blocked while pending, and unread state is reconciled after mutations | `main`, local diff | focused lint + Vitest PASS; production untouched | Следующий шаг — только следующий Stage 6 slice после отдельного подтверждения |
| 2026-07-07 | Stage 6 slice 8 | Локально добавлен project activity foundation: additive `Project.activity`, compact activity tab in project workspace, and append-only activity writes for comments/chat/tasks/audio uploads on top of existing `ActivityEvent`; production untouched | `main`, local diff | focused Vitest + isolated API integration PASS; production untouched | Следующий шаг — только следующий Stage 6 slice после отдельного подтверждения |
| 2026-07-07 | Stage 6 slice 9 | Локально добавлен inbox split foundation: global activity aggregated from `projects[].activity`, deterministic activity deep-links, and existing notifications retained as messages/requests within a two-tab inbox panel; production untouched | `main`, local diff | focused lint + Vitest PASS; production untouched | Следующий шаг — только следующий Stage 6 slice после отдельного подтверждения |

| 2026-07-07 | Stage 6 slice 10 | Локально добавлен mentions foundation: '@' mentions parser, notification target resolution logic, testing suite. | `main`, local diff | tests PASS |
| 2026-07-07 | Stage 6 slice 11 | Локально реализована политика email/push: NotificationDelivery model, DeliveryChannel enums, central email router eval, mock email sender. Stage 6 завершён. | `main`, local diff | tests PASS |
| 2026-07-07 | Stage 7 slice 1 | Локально заложен фундамент для Ready review: TrackSnapshot, TrackReview, TrackReviewApprover models & enums, core creation services. | `main`, local diff | tests PASS |
| 2026-07-07 | Stage 7 slice 2 | Локально добавлены Track Review transitions: approve/request changes, invalidation, removing approvers. | `main`, local diff | tests PASS |
| 2026-07-07 | Stage 7 slice 3 | Локально добавлен export: `isProjectReady`, `generateProjectExportStream`, `GET /api/projects/:projectId/export` (ZIP archiver). | `main`, local diff | tests PASS |
| 2026-07-07 | Stage 7 slice 4 | Локально добавлен retention & trash: soft-delete `Project` with `deletedAt`, project recovery API, protection against silent final asset purge, `purgeTrash` script, и сгенерирована Prisma migration `stage7_retention`. Stage 7 завершён. | `main`, local diff | tests PASS |

| 2026-07-08 | Stage 9 slice 1 | Public profile opt-in: `isPublicProfile`, `bio`, `location`, `website` fields; profile settings page `/app/profile`; public profile page `/u/:handle`; migration `stage9_public_profile_foundation`. | `main` | code ready, production pending |
| 2026-07-08 | Stage 9 slice 2 | Work publications: `Publication` model + enums; private manager `/app/publications`; public work page `/works/:slug`; streaming/download; migration `stage9_work_publications_core`. | `main` | code ready, production pending |

## 29. Следующий шаг — применить Stage 9 миграции в production и задеплоить, затем Stage 9 slice 3 или Stage 8.

## Blockers

- Нет отдельного staging VPS; все изменения проверяются локально до controlled production deploy.
- Payment intentionally deferred.
- Stage 9 миграции (`stage9_public_profile_foundation`, `stage9_work_publications_core`) ещё не применены в production DB.
