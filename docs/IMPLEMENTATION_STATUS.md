# CollabStudio — implementation status

Последнее обновление: 6 июля 2026 года
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
- Active slice: Stage 5A slice 7 completed locally — frontend asset-first cutover implemented with legacy fallback preserved, production deploy intentionally not performed, owner authenticated smoke still manual-pending for later rollout
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
| Stage 5A — TrackAsset migration | in_progress | Slice 7 completed locally: frontend now prefers additive `Track.assets` with legacy fallback; production still on slice 6 app commit `0a4ae6b`, owner authenticated smoke manual-pending |
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
15. Следующий шаг — только следующий Stage 5A slice после отдельного подтверждения; Stage 4C+/5B не начинать.

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

## Blockers

- Нет отдельного staging VPS; все изменения проверяются локально до controlled production deploy.
- Payment intentionally deferred.
