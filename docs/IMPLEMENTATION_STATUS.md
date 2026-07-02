# CollabStudio — implementation status

Последнее обновление: 2 июля 2026 года  
Каноническое ТЗ: `docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md`

## Правила

- Статусы: `pending`, `in_progress`, `blocked`, `completed`.
- Одновременно только один Stage может быть `in_progress`.
- Stage становится `completed` только после полного Gate из мастер-карты.
- Частичная работа записывается в журнал slices, но не закрывает Stage.

## Текущая точка

- Branch: `main`
- Baseline commit: `010efea`
- Active Stage: `Stage 0`
- Active slice: Stage 0 blocker-fix slice (pipeline/tests/ci/flags/restore drill)
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
| Stage 1 — Router и state boundaries | pending | Не начат |
| Stage 2 — i18n, design tokens и shell | pending | Не начат |
| Stage 3 — Projects, scopes и invitations | pending | Не начат |
| Stage 4A — Plain-text Lyrics Workspace | pending | Не начат |
| Stage 4B — WYSIWYG и stable anchors | pending | Не начат |
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

Stage 1 (не начинать без отдельного подтверждения):

1. Router и state boundaries по канонической карте.
2. Без visual/schema redesign вне scope Stage 1.

## Журнал slices

| Дата | Stage/slice | Результат | Commit/branch | Gate/tests | Следующий шаг |
|---|---|---|---|---|---|
| 2026-07-02 | Baseline audit | Зафиксирован текущий baseline | `main@010efea` | generate/lint/unit/build проходят в правильной ручной последовательности | Stage 0 slice 1 |
| 2026-07-02 | Stage 0 blocker-fix slice | Закрыты блокеры: local e2e default, component tests, CI, feature flags, isolated restore drill, artifact ignore | `main` (working tree changes, без commit) | clean pipeline + e2e проходят; restore drill PASS в isolated env | Ожидание подтверждения перед Stage 1 |

## Blockers

- Нет отдельного staging VPS; все изменения проверяются локально до controlled production deploy.
- Payment intentionally deferred.

