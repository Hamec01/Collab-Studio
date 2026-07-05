# CollabStudio — implementation status

Последнее обновление: 5 июля 2026 года
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
- Active Stage: `Stage 5A`
- Active slice: Stage 4B completed in production; следующий разрешённый шаг — Stage 5A
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
| Stage 5A — TrackAsset migration | pending | Не начат |
| Stage 5B — Player и audio annotations | pending | Не начат |
| Stage 6 — Discussions, chats, tasks, activity, Inbox | pending | Не начат |
| Stage 7 — Ready review, retention и export | pending | Не начат |
| Stage 8 — PWA и offline lyrics | pending | Не начат |
| Stage 9 — Public profiles и publications | pending | Не начат |
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
6. Следующий шаг — только Stage 5A по roadmap; Stage 4C+ отдельно не начинать.

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

## Blockers

- Нет отдельного staging VPS; все изменения проверяются локально до controlled production deploy.
- Payment intentionally deferred.
