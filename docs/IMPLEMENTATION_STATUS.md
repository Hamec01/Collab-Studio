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
- Active slice: не начат
- Production: `https://collabstudio.run/`
- Deployment: один VPS, один production instance

## Проверенный baseline

- `npm run prisma:generate` — проходит.
- `npm run lint` после Prisma generate — проходит.
- `npx tsx --test src/utils/lyricsDraftRecovery.test.ts` — 4/4 проходят.
- `npm run build` — проходит.
- Clean `npm ci → npm run lint` — падает без предварительного Prisma generate; исправляется в Stage 0.
- Единого `npm test` script пока нет.
- Playwright/E2E foundation пока нет.

## Stage status

| Stage | Статус | Gate |
|---|---|---|
| Stage 0 — Baseline, pipeline и recovery | pending | Не пройден |
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

Stage 0:

1. Исправить clean-install pipeline: Prisma Client генерируется до typecheck.
2. Добавить единый `npm test` script, включающий существующие tests.
3. Не начинать router/UI/schema changes.

## Журнал slices

| Дата | Stage/slice | Результат | Commit/branch | Gate/tests | Следующий шаг |
|---|---|---|---|---|---|
| 2026-07-02 | Baseline audit | Зафиксирован текущий baseline | `main@010efea` | generate/lint/unit/build проходят в правильной ручной последовательности | Stage 0 slice 1 |

## Blockers

- Нет отдельного staging VPS; все изменения проверяются локально до controlled production deploy.
- Payment intentionally deferred.

