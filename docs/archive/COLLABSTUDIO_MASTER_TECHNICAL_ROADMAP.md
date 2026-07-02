# CollabStudio — каноническая техническая дорожная карта и ТЗ для AI-агента

Версия документа: 1.0  
Дата: 2 июля 2026 года  
Актуальная кодовая база при составлении: `main`, commit `010efea`  
Production: `https://collabstudio.run/`

Правила выполнения: `AGENTS.md`  
Текущий статус этапов: `docs/IMPLEMENTATION_STATUS.md`

---

## 0. Статус документа

Этот файл — единственный канонический источник продуктовых и технических решений CollabStudio.

Он объединяет и заменяет как рабочее ТЗ:

- `mobile-product-audit-and-brief.md`;
- `product-roadmap.md`;
- `architecture-decisions.md`;
- `product-interview-decisions.md`.

Исходные документы сохраняются только как история обсуждения. При любом противоречии агент обязан следовать этому файлу и актуальному коду. Изменить утверждённое решение можно только отдельным ADR с явным подтверждением владельца продукта.

### Порядок источников истины

1. Прямое новое решение владельца продукта.
2. Этот документ.
3. Утверждённые ADR, созданные после этого документа.
4. Актуальные API, Prisma schema и тесты.
5. Существующая реализация.
6. Концепт-макеты — только визуальный ориентир, не спецификация функций.

---

# Часть I. Контракт для любого coding agent

## 1. Как агент обязан работать

Агент работает не как генератор макета, а как инженер существующего production-приложения.

Перед каждым этапом агент обязан:

1. Прочитать этот документ целиком.
2. Проверить актуальный `git status`, branch, commit и diff.
3. Прочитать затрагиваемые компоненты, API routes, schemas, serializers и Prisma models.
4. Записать краткий scope текущего этапа и его non-goals.
5. Проверить, есть ли пользовательские изменения, и не перезаписывать их.
6. Добавить или обновить тест, который сначала фиксирует ожидаемое поведение.
7. Реализовать только текущий вертикальный slice.
8. Выполнить quality gate этапа.
9. Сообщить фактические команды, результаты и известные ограничения.
10. Не начинать следующий этап без прохождения gate.

## 2. Жёсткие запреты

Агенту запрещено:

- переписывать приложение с нуля;
- заменять React/Vite/Express/Prisma без отдельного ADR;
- реализовывать все этапы одним PR;
- увеличивать монолитный `App.tsx`;
- хранить route state только в `useState`;
- создавать вторую независимую mobile-бизнес-логику;
- добавлять кнопки без работающего backend flow;
- подставлять production-моки публичных проектов, пользователей или статистики;
- менять Prisma schema без additive migration, backfill plan и rollback plan;
- удалять legacy fields в том же релизе, где добавлена их замена;
- выполнять destructive migration на production без backup;
- автоматически разрешать конфликт текста правилом last-write-wins;
- создавать новую `LyricVersion` на каждый debounce autosave;
- переносить text/audio annotation на другой контент при неоднозначном совпадении;
- кэшировать private API/audio в service worker без отдельной политики;
- отправлять lyrics, messages, filenames, audio или private URLs в аналитику;
- выдавать admin свободный доступ к private projects;
- включать AI в первую мобильную версию;
- превращать CollabStudio в multitrack DAW;
- строить TikTok-style repost feed;
- реализовывать платежи до утверждения тарифов, storage economics и налогового процесса.

## 3. Что означает «без багов и лагов»

Абсолютно нулевое количество дефектов гарантировать невозможно. В этом ТЗ требование переводится в измеримые gates:

- clean install, generate, lint, tests и build проходят;
- критические flows покрыты E2E;
- migrations протестированы на пустой и существующей БД;
- есть backup и проверенный rollback;
- ошибки наблюдаемы;
- performance budgets измерены;
- следующий этап блокируется при regression;
- нет известных P0/P1 дефектов перед production rollout.

---

# Часть II. Продуктовая основа

## 4. Продуктовая формула

CollabStudio — не DAW и не доска объявлений.

> Это рабочее пространство творческого проекта, где текст, аудиоматериалы, участники, версии, комментарии, задачи и обсуждения связаны одним контекстом трека.

Главная пользовательская ценность:

> Писать текст с телефона и ПК, слушать рабочий бит, собирать материалы, приглашать людей, обсуждать правки и доводить трек до готового состояния без переключения между множеством приложений.

Основные пользователи:

- артист/музыкант;
- автор текста;
- битмейкер/продюсер;
- звукорежиссёр/sound designer;
- сольный пользователь;
- творческая команда.

## 5. Главные сценарии в порядке приоритета

1. Войти и продолжить последний трек.
2. Создать одиночный трек или альбом.
3. Написать и безопасно сохранить текст.
4. Слушать бит во время чтения/редактирования.
5. Пригласить участника на весь проект или отдельный трек.
6. Загрузить либо прикрепить рабочий материал.
7. Обсудить абзац, фразу или аудиотаймкод.
8. Создать и назначить задачу.
9. Увидеть изменения команды.
10. Согласовать готовность трека.
11. Опубликовать выбранный финальный материал.
12. Найти человека или открытое предложение для коллаборации.

Public discovery не имеет права задерживать качественную private studio.

## 6. Не-цели первой private-studio версии

- multitrack playback/mixing;
- запись звука внутри браузера;
- встроенная обработка вокала;
- полноценный DAW timeline;
- AI на телефоне;
- автоматические рекомендации;
- платежи;
- расчёт роялти/долей;
- юридические договоры;
- автоматический перевод user content;
- произвольные executable/archive uploads;
- internal repost feed.

---

# Часть III. Информационная архитектура и UX

## 7. Иерархия

```text
Project
├── project members
├── project chat
└── Track
    ├── scoped members
    ├── lyrics document
    ├── lyric snapshots
    ├── track assets
    ├── audio annotations
    ├── contextual discussions
    ├── track chat
    ├── tasks
    ├── activity
    └── ready reviews
```

- Project может быть альбомом.
- Одиночный трек технически имеет Project-контейнер, но UI не заставляет пользователя понимать это.
- Scope доступа: весь Project либо выбранный Track.

## 8. Маршруты

### Public

```text
/
/discover
/discover/works
/discover/people
/discover/collabs
/works/:slug
/collabs/:slug
/u/:handle
/share/:token
/login
/register
/forgot-password
```

### Private app

```text
/app
/app/projects
/app/projects/:projectId
/app/projects/:projectId/tracks/:trackId
/app/projects/:projectId/tracks/:trackId/:tab
/app/inbox
/app/messages
/app/profile
/app/settings
```

Допустимые `:tab`:

```text
lyrics
audio
team
versions
```

### Admin

```text
/admin
/admin/reports
/admin/accounts
/admin/system
```

Admin private-content access не является обычным route и требует reason + audit.

## 9. Глобальная навигация

Phone bottom navigation:

```text
Главная | Проекты | + | Inbox | Профиль
```

- Это единственная глобальная навигация.
- Верхние быстрые действия не повторяют bottom nav.
- Search/Discover открываются из header/home.
- Track Workspace является вложенным экраном.

## 10. Главная после входа

Порядок:

1. Продолжить работу.
2. Требует внимания.
3. Мои проекты и коллаборации.
4. Активность команды.
5. Компактный public discovery preview.

Главная не становится публичной бесконечной лентой.

## 11. Responsive system

### Phone: 320–767 px

- один основной контекст;
- bottom sheets;
- keyboard-safe editor;
- persistent mini-player;
- touch targets минимум 44×44 CSS px;
- safe-area padding;
- `100dvh` только на shell/scroll boundaries.

### Tablet: 768–1023 px

- master-detail;
- portrait допускает однооконный режим;
- landscape показывает список и workspace;
- team context открывается drawer/panel.

### Desktop: 1024+ px

```text
Left: projects/tracks
Center: active track workspace
Right: contextual comments/chat/tasks
Bottom: persistent player
```

- панели сворачиваются;
- Focus Mode оставляет editor + player;
- не существует отдельной несовместимой desktop-бизнес-логики.

## 12. Визуальная система

- одна качественная dark theme;
- умеренный violet/blue accent;
- covers и контент создают эмоциональность;
- минимум тяжёлого glow/blur/motion;
- ясная типографическая иерархия;
- human microcopy без `Stage 4` и developer labels;
- reduced motion;
- keyboard focus;
- WCAG contrast;
- light theme не входит в первую версию, но tokens допускают её позже.

Референсы по ощущению, не для копирования: Suno, SoundCloud, Instagram, BeatStars, старые ясные версии VK.

---

# Часть IV. Целевая frontend-архитектура

## 13. Модульные границы

```text
src/
  app/
    AppRouter.tsx
    AppProviders.tsx
    routeConfig.ts
    featureFlags.ts
  features/
    auth/
    home/
    projects/
    track-workspace/
      lyrics/
      audio/
      discussions/
      chat/
      tasks/
      versions/
      review/
    inbox/
    messages/
    profile/
    discover/
    moderation/
  shared/
    api/
    auth/
    player/
    drafts/
    i18n/
    analytics/
    ui/
    hooks/
    lib/
    styles/
```

Не создавать пустую файловую иерархию заранее. Модуль выделяется вместе с реальным flow и тестами.

## 14. Владение состоянием

| Состояние | Единственный владелец |
|---|---|
| Текущий route/project/track/tab | URL/router |
| Session/current user | Auth provider |
| Server entities | Query/cache layer поверх существующего API client |
| Player runtime | Track Workspace Player provider |
| Lyrics draft | Editor state + IndexedDB recovery |
| Edit lease | Server |
| UI sheets/dialogs | Локальный component state |
| Feature flags/entitlements | Server response + provider |
| Locale | User setting/browser fallback |

Запрещено держать дублирующие копии server entity в нескольких components.

## 15. Router и server-state layer

- Использовать зрелый route library с deep links и browser history.
- Server state вынести из `App.tsx`.
- Сохранить `src/api/*` как transport boundary.
- Добавить query keys, abort, retry policy и invalidation.
- Не retry мутации автоматически, если возможно дублирование.
- `401` централизованно переводит session в expired state.
- Route error boundary не теряет понятный контекст.

## 16. UI primitives

Минимальный набор:

- `AppShell`;
- `ScreenHeader`;
- `BottomNav`;
- `Tabs`;
- `Button`;
- `IconButton`;
- `Input`;
- `Textarea`;
- `Select`;
- `Dialog`;
- `BottomSheet`;
- `Drawer`;
- `Toast`;
- `Skeleton`;
- `EmptyState`;
- `ErrorState`;
- `ReadOnlyState`;
- `Avatar`;
- `Cover`;
- `Badge`;
- `Menu`;
- `ConfirmAction`.

Каждый primitive имеет accessibility contract и не содержит бизнес-логику.

## 17. Локализация

Первая beta:

- `ru`;
- `en`.

Требования:

- никаких новых hardcoded UI strings;
- system emails и notification templates локализуются;
- user content не переводится;
- locale не является частью business entity;
- architecture допускает `es`, `fr`, `de`;
- даты, время, валюты и числа форматируются через locale-aware API.

## 17.1. API contract

Общие правила для всех новых endpoints:

- REST JSON поверх существующего `/api`;
- validation через Zod;
- ISO 8601 UTC для дат;
- IDs opaque UUID;
- cursor pagination для растущих списков;
- explicit sort/filter parameters;
- abortable GET requests;
- mutation retries только при idempotency;
- authorization выполняется до чтения/изменения entity;
- private serializers используют allowlist, не Prisma object spread.

Error envelope:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe localized/fallback message",
    "requestId": "request-id",
    "details": {}
  }
}
```

Основные statuses:

- `400` validation;
- `401` unauthenticated;
- `403` authenticated but forbidden;
- `404` missing or intentionally concealed resource;
- `409` conflict/OCC/idempotency;
- `413` upload too large;
- `415` unsupported media;
- `422` semantically invalid transition;
- `429` rate limit;
- `500` unexpected server error.

Нельзя передавать stack traces, storage paths, SQL и secrets клиенту.

## 17.2. Migration contract

Каждое изменение данных проходит:

1. ADR/schema note.
2. Additive nullable fields/tables.
3. Новый backend, понимающий legacy и target.
4. Idempotent/resumable backfill.
5. Integrity verification query/script.
6. Новый frontend.
7. Observation period.
8. Separate cleanup release.

Rollback приложения не должен требовать destructive down migration.

---

# Часть V. Доменная модель

## 18. Identity, profile и auth

Существующие session-cookie auth и Google OAuth сохраняются.

Целевые дополнения:

- обязательный verified email для uploads/publication/comments/DM;
- password recovery;
- публичный profile только после explicit opt-in;
- future OAuth: Yandex и VK;
- `AuthProvider` отделён от `AudioExternalProvider`;
- первая public beta: подтверждение `18+`;
- birth date не публикуется.

Public profile:

- unique handle;
- display name;
- avatar;
- bio;
- specializations[];
- genres[];
- external links;
- collaboration availability;
- isPublic;
- followers/following counters.

## 19. Ownership, access и capabilities

### Ownership

- У Project ровно один primary owner.
- Owner отвечает за quota.
- Owner может назначать managers.
- Ownership transfer требует acceptance.
- При недостатке quota: 7 дней grace без новых uploads, затем read-only.

### Scope

- Project-level grant применяется ко всем tracks.
- Track-level grant применяется только к конкретному track.
- Если есть project-level grant, не создавать конфликтующие track grants.

### Capability names

```text
project.view
project.download
project.manage
member.invite
member.manage
lyrics.edit
lyrics.snapshot.create
lyrics.finalize
audio.upload
audio.rename
audio.annotate
audio.trash.own
audio.trash.any
comment.create
comment.resolve
chat.write
task.create
task.assign
task.update
review.manage
publication.manage
```

### Presets

`Coauthor`:

- view/download;
- edit lyrics;
- create lyric snapshots;
- comments/chat/tasks.

`Audio collaborator`:

- view/download;
- upload/rename own assets;
- audio annotations;
- comments/chat/tasks.

`Reviewer`:

- view/download;
- comments;
- annotations;
- chat.

`View only`:

- view/listen/download.

`Custom`:

- owner-defined capabilities.

Presets — UI shortcuts. Backend всегда проверяет конкретные capabilities.

### Global admin

Текущий код предоставляет global admin широкий доступ к проектам. Целевая политика:

- admin не получает обычный private project membership;
- private project не появляется в стандартном admin project list;
- support/moderation access требует reason/ticket;
- доступ ограничен временем и scope;
- каждый access записывается в immutable audit;
- owner уведомляется, кроме явно оформленного legal/security exception;
- break-glass access покрыт тестами и не используется для повседневной работы.

## 20. Invitations и guest links

Invitation хранит server-side:

- token hash, не raw token;
- projectId;
- optional trackId;
- preset/capabilities;
- expiresAt;
- revokedAt;
- createdBy;
- acceptedBy;
- acceptedAt.

Guest link:

- read/listen only;
- 7 дней по умолчанию;
- optional password;
- owner revoke;
- optional no-expiry;
- не даёт download;
- не индексируется.

Незарегистрированный пользователь может просмотреть scope, зарегистрироваться и вернуться ровно в тот же track.

## 21. Lyrics target model

### Текущее состояние

В `010efea` уже есть:

- autosave;
- IndexedDB recovery;
- sessionStorage emergency copy;
- server draft endpoint;
- conflict check по `updatedAt`;
- unit test recovery selection.

Это сохраняется и покрывается regression tests.

### Целевое состояние

Простой limited rich-text document:

```ts
type LyricsDocument = {
  schemaVersion: 1;
  blocks: Array<{
    id: string;
    type: "paragraph" | "heading";
    children: Array<{
      text: string;
      marks?: Array<"bold" | "italic">;
    }>;
  }>;
};
```

Разрешены только:

- paragraph;
- heading;
- bold;
- italic;
- hard/soft line breaks;
- undo/redo.

Запрещены:

- images;
- tables;
- embeds;
- arbitrary HTML;
- colors/fonts;
- executable content.

### Storage

Additive target fields:

- `Track.lyricsDocument Json?`;
- `Track.lyricsPlainText String`;
- `Track.lyricsRevision Int`;
- `LyricVersion.document Json?`;
- `LyricVersion.plainText String`;
- `LyricVersion.schemaVersion Int`.

На переходном этапе legacy `lyrics` сохраняется.

### Migration

1. Добавить nullable structured fields и `lyricsRevision`.
2. Backend читает structured document либо legacy fallback.
3. Backfill plain text в blocks со stable IDs.
4. Новый frontend пишет structured + derived plain text.
5. Проверить export, search, versions и conflicts.
6. Наблюдать минимум один релиз.
7. Legacy поле удалять только отдельным ADR/релизом.

Не писать собственный сложный `contentEditable` с нуля. Выбрать поддерживаемый headless editor отдельным коротким ADR, проверить React compatibility, IME, mobile selection и serialization.

## 22. Lyrics edit lease и OCC

Server lease:

- trackId;
- userId;
- opaque lease token;
- acquiredAt;
- expiresAt.

Базовая политика:

- heartbeat каждые 30 секунд;
- expiry после 90 секунд без heartbeat;
- release при выходе из edit mode;
- owner force release;
- offline draft не удерживает lease.

OCC:

- dedicated monotonic `lyricsRevision`;
- save передаёт `baseLyricsRevision`;
- conditional update;
- zero updated rows → `409 LYRICS_CONFLICT`;
- automatic retry запрещён;
- UI предлагает compare/copy/manual merge.

Autosave draft не создаёт `LyricVersion`.

## 23. Lyrics comments и anchors

Целевой anchor:

- sourceLyricVersionId/revision;
- blockId;
- startOffset;
- endOffset;
- exactQuote;
- prefix;
- suffix;
- state: active/outdated/orphaned.

Поведение:

1. Проверить block ID.
2. Проверить offsets + quote.
3. Попробовать однозначный quote/context match.
4. При неоднозначности пометить orphaned/outdated.
5. Никогда не переносить молча.

UI:

- line numbers отсутствуют;
- comment к абзацу;
- comment к выделенной фразе;
- marker рядом с content;
- thread в bottom sheet/drawer;
- resolved hidden by default.

## 24. Track assets: окончательное решение

После продуктового интервью прежняя гипотеза `AudioAsset → AudioRevision` не является целевой UI-моделью.

Пользователь хочет отдельные видимые карточки. Поэтому целевая сущность — `TrackAsset`.

```text
TrackAsset
  id
  trackId
  category: BEAT | VOCAL | MIX | OTHER
  kind: AUDIO | DOCUMENT | EXTERNAL_LINK
  displayName
  originalFilename?
  storageKey?
  mimeType?
  sizeBytes?
  durationMs?
  externalUrl?
  externalProvider?
  isPlayable
  isCurrent
  startOffsetMs?
  uploadedById
  createdAt
  updatedAt
  trashedAt?
  trashedById?
  purgeAfter?
```

Правила:

- каждый upload/link — отдельная карточка;
- старый файл не перезаписывается;
- display name можно менять;
- original filename неизменяем;
- несколько vocal cards допустимы;
- несколько current cards допустимы;
- final/review snapshot выбирает точные asset IDs;
- TXT разрешён как `DOCUMENT` в `OTHER`;
- executable/script/archive запрещены;
- external link не расходует storage quota;
- если source не playable, UI показывает external open.

Миграция из `AudioVersion` выполняется additive backfill.

## 25. Asset trash и lifecycle

- uploader с capability может trash собственный asset;
- owner/manager с capability может trash любой;
- owner уведомляется;
- retention 30 дней;
- restore до purge;
- permanent purge выполняет owner/system job;
- active/final/annotated asset требует предупреждения;
- metadata audit остаётся после purge;
- orphan storage audit запускается регулярно.

## 26. Player runtime

Один `<audio>` на Track Workspace.

State:

- selectedAssetId;
- currentTime;
- duration;
- isPlaying;
- volume;
- playbackRate;
- loopStart;
- loopEnd;
- expanded;
- error.

Функции:

- play/pause;
- seek;
- ±10 sec;
- volume;
- speed;
- A/B loop;
- asset selection;
- collapsed/expanded;
- Media Session progressive enhancement.

Player:

- не размонтируется при смене tabs текущего track;
- не заставляет весь lyrics tree rerender на time update;
- автоматически сворачивается при mobile keyboard;
- не перекрывает caret;
- сохраняет session preferences;
- использует существующий HTTP Range streaming.

Waveform не является обязательным. Если добавляется:

- не декодировать тяжёлый WAV заново при каждом открытии;
- peaks вычислять один раз и кэшировать как metadata;
- обычный progress bar остаётся fallback.

## 27. Audio annotations

```text
AudioAnnotation
  trackAssetId
  startMs
  endMs?
  threadId
  status
  authorId
```

- target — конкретный playable asset;
- point и optional range;
- click marker seeks;
- thread/replies/mentions;
- resolve/reopen;
- convert to task;
- annotations старого mix не показываются как annotations нового;
- legacy track-level annotations мигрируются как legacy/unscoped и требуют явного отображения.

## 28. Discussion threads

Унифицированная business concept:

```text
DiscussionThread
  targetType
  targetId/anchor
  status
  createdBy

DiscussionMessage
  threadId
  authorId
  body
  editedAt
  deletedAt
```

Targets:

- lyrics anchor;
- audio annotation;
- project;
- track;
- task.

Файлы/voice в comments запрещены.

Минимальная `DiscussionThread/DiscussionMessage` foundation создаётся на Stage 4B для lyrics targets. Stage 5B добавляет audio targets. Stage 6 завершает общие project/track views, mentions, notifications и conversion flows.

## 29. Chats

- Project chat.
- Track chat.
- Text only.
- Attachments запрещены.
- Links разрешены с external warning.
- Edit own message с marker.
- Delete own message оставляет tombstone.
- Pagination обязательна до public scale.
- Polling допустим сначала; realtime только после измеренной необходимости.

## 30. Tasks

```text
Task
  projectId
  trackId?
  sourceThreadId?
  sourceAssetId?
  sourceStartMs?
  sourceEndMs?
  title
  description?
  assigneeId?
  priority?
  dueAt?
  status
  createdBy
```

Statuses:

```text
TODO | IN_PROGRESS | DONE
```

Priority и due date optional. Comment/annotation можно convert to task без потери source context.

## 31. Activity и notifications

Activity — append-only журнал значимых событий, не event sourcing всей системы.

```text
ActivityEvent
  actorId
  projectId
  trackId?
  type
  resourceType
  resourceId
  metadata
  createdAt
```

Не записывать keystrokes.

`NotificationDelivery`:

- eventId;
- recipientId;
- readAt;
- delivery status/channel.

Inbox разделён:

- Activity;
- Messages/Requests.

Immediate email/push:

- invitations;
- message requests;
- mentions;
- assigned tasks;
- review requests.

Остальное — in-app/digest.

## 32. Ready review

```text
TrackReview
  trackId
  snapshotId
  status
  createdBy

TrackReviewApprover
  reviewId
  userId
  status
  respondedAt
  note?
```

Snapshot включает:

- final lyrics snapshot ID;
- selected/current asset IDs;
- title/metadata.

Flow:

1. Owner отправляет на review.
2. Выбирает required approvers.
3. Approver approves или requests changes.
4. Все required + owner approved → READY.
5. Изменение snapshot input инвалидирует approvals.
6. Owner может удалить approver с reason.
7. Действие логируется и уведомляется.

Это workflow, не юридический договор.

---

# Часть VI. Public/social layer

## 33. Публикации

Private workspace никогда не публикуется целиком.

`WORK`:

- cover;
- description;
- final audio asset;
- optional final lyrics snapshot;
- selected credits.

`COLLAB`:

- selected beat/text/demo snapshot;
- description;
- genres;
- language;
- requested specialization;
- terms;
- optional budget range/currency;
- expiresAt = 30 дней;
- renew/archive.

Terms:

```text
FREE | ROYALTY | FIXED_PAYMENT | NEGOTIABLE
```

CollabStudio:

- не принимает оплату;
- не хранит доли;
- не гарантирует расчёты;
- не добавляет watermark;
- не обрезает preview;
- не предоставляет DRM.

## 34. Public engagement

Work:

- plays;
- likes;
- comments;
- favorite;
- external share.

Collab:

- favorite;
- external share;
- response.

Нет internal repost.

Play count:

- не считать page open;
- определить минимальный playback threshold;
- дедуплицировать очевидный spam;
- не использовать в critical authorization logic.

## 35. Public comments и moderation

Резкая лексика допустима. Запрещены:

- threats;
- doxxing;
- spam;
- fraud;
- illegal content;
- нарушения Terms.

Возможности автора:

- hide comment;
- close publication comments;
- block user globally for own publications.

Platform:

- report;
- moderation queue;
- reasoned decision;
- hide/remove;
- suspend/ban;
- appeal/contact path;
- audit.

Комментировать может только verified registered user.

## 36. Profiles, follows и DM

Profile private by default; public only opt-in.

Follow:

- не даёт project access;
- не открывает DM автоматически.

DM:

- text/links only;
- no file/audio/voice;
- one request from stranger;
- recipient accepts/rejects/blocks/reports;
- conversation открывается только после acceptance;
- project invitation отправляется системной карточкой.

## 37. Discover

Разделы:

- Works;
- People;
- Collabs.

Filters:

- controlled genres;
- custom mood/style tags;
- language;
- specialization;
- collaboration terms;
- budget range.

Beta ranking:

- search;
- fresh;
- tags;
- manual featured.

No recommendation ML.

## 38. SEO

Index:

- public works;
- active collab posts;
- public profiles.

Noindex:

- private app;
- guest links;
- chats/tasks;
- internal assets;
- private profiles.

Public route должен отдавать crawlable title, description, canonical, OpenGraph и JSON-LD с сервера. Не менять весь стек на Next.js. Реализовать минимальный SSR/server-rendered public shell поверх существующего Express/Vite только на public routes, отдельным этапом.

---

# Часть VII. PWA, security, privacy и operations

## 39. PWA/offline

- installable manifest/icons/theme;
- app shell offline;
- IndexedDB lyrics draft offline;
- no automatic private API/audio cache;
- no silent mutation queue in first beta;
- reconnect performs revision check;
- conflict → compare/manual merge;
- logout очищает drafts/cache/player state текущего пользователя.

## 40. Security

Сохранить:

- Argon2id;
- HttpOnly session cookies;
- SameSite;
- origin checks;
- Helmet;
- rate limits;
- MIME/signature validation;
- Range streaming access guards.

Добавить:

- verified email gates;
- reset tokens hashed/expiring/single-use;
- invitation tokens hashed;
- guest-link rate limits;
- DM/public-comment anti-spam;
- upload quota server-side;
- CSP;
- external-link warning;
- audit admin private access;
- authorization tests для каждого capability;
- IDOR tests project/track scope;
- no secrets in browser bundle/logs.

## 41. Privacy и legal product boundaries

Первая beta: 18+.

CollabStudio не:

- определяет ownership;
- передаёт copyright автоматически;
- хранит доли/долги;
- решает disputes;
- заменяет договор.

Join и release acknowledgement — разные действия.

До public launch нужны:

- Terms;
- Privacy Policy;
- Moderation Rules;
- Copyright/notice path;
- Data deletion/export policy;
- Admin access policy.

Юридические тексты проверяются профильным специалистом; AI draft не считается окончательным.

## 42. Retention и export

Retention:

- asset trash: 30 дней;
- project recovery: 30 дней;
- account recovery: 30 дней.

Owner account нельзя удалить, пока ownership не передан или проекты не архивированы.

Export:

- owner: весь project;
- participant: доступный scope;
- guest: запрещён.

Archive включает:

- assets;
- lyrics snapshots;
- TXT;
- participants;
- comments/tasks/annotations readable HTML/JSON;
- manifest с authors/original filenames.

Mass export логируется.

## 43. Entitlements и storage

Beta:

- всем `Beta Pro`;
- payment отсутствует.

Entitlements:

- max owned projects;
- max tracks/project;
- max total storage;
- max file size;
- trash retention;
- feature flags.

Storage списывается owner проекта.

Invited projects не расходуют owned-project count участника.

External links storage не расходуют.

Будущие цены `$0/$5/$15` — гипотеза, не кодировать в business logic до отдельного этапа.

## 44. Infrastructure

Текущая beta:

- один VPS;
- 4 vCPU;
- 8 GB RAM;
- 75 GB NVMe либо 150 GB SSD;
- 200 Mbit/s;
- 5–10 первых пользователей;
- один production instance;
- отдельного staging server нет.

Обязательно:

- local test environment;
- off-server encrypted backups DB + assets;
- restore drill;
- disk alerts 70%/85%;
- structured logs/request IDs;
- health/readiness;
- previous image rollback;
- feature flags;
- additive migrations;
- short coordinated deploy.

Server snapshot не является единственным backup.

## 45. Analytics

Разрешены:

- registration completion;
- project/track creation;
- editor open;
- save success/conflict;
- playback/upload error;
- invitation acceptance;
- collab response;
- Web Vitals;
- client/server error.

Запрещены:

- lyrics;
- chat/DM/comment/task body;
- private filename;
- audio;
- private link;
- auth tokens.

---

# Часть VIII. Quality gates

## 46. Обязательные команды

Stage 0 должен создать одну воспроизводимую последовательность:

```text
npm ci
npm run prisma:generate
npm run lint
npm test
npm run build
npm run e2e
```

`npm run lint` после чистого `npm ci` сейчас падает без предварительного Prisma generate. Это первый исправляемый pipeline defect.

## 47. Test pyramid

Unit:

- capabilities;
- route builders;
- draft recovery;
- OCC conflict;
- player loop/time;
- anchors;
- quota calculations;
- notification targeting.

Component:

- editor states;
- player collapsed/expanded;
- comments sheet;
- permissions;
- project create/invite;
- loading/empty/error/read-only;
- DM request.

API integration:

- session/auth;
- project/track isolation;
- capability denial;
- lease/OCC;
- upload validation/quota;
- soft delete/restore;
- notification read;
- public/private boundary.

E2E viewports:

- 320×568;
- 390×844;
- 768×1024 portrait;
- tablet landscape;
- 1440×900 desktop.

## 48. Critical E2E

1. Register/login/logout/session expiry.
2. Direct track URL + browser Back.
3. Create single/project/track.
4. Project-scoped invite.
5. Track-scoped invite.
6. Guest link read/listen/no-download.
7. Edit lease.
8. Autosave/reload/recovery.
9. OCC conflict.
10. Final lyric snapshot.
11. Upload MP3/link/TXT.
12. Player continues across tabs.
13. Audio annotation seeks exact asset/time.
14. Lyrics thread and resolve.
15. Comment → task.
16. Project and track chat.
17. Ready approval/invalidation.
18. Viewer cannot mutate.
19. Trash/restore.
20. Owner transfer/grace.
21. Public/private publication boundary.
22. DM request acceptance.
23. Block/report.
24. Offline draft reconnect conflict.
25. Desktop regression.

## 49. Performance budgets

Production mobile p75:

- LCP ≤ 2.5 s;
- INP ≤ 200 ms;
- CLS ≤ 0.1.

Targets:

- login/home initial JS gzip стремится ≤200 KB;
- heavy workspace/public modules lazy-load;
- editor typing не rerender всего app;
- audio time update не rerender lyrics;
- polling останавливается background/logout;
- images dimensioned/lazy/optimized;
- stale requests abort;
- list virtualization только после measurement.

## 50. Accessibility gate

- 44×44 touch targets;
- icon-only `aria-label`;
- keyboard navigation;
- visible focus;
- semantic headings/landmarks;
- focus trap/restore dialogs/sheets;
- error association;
- screen reader status for save/player;
- reduced motion;
- zoom не блокируется;
- contrast проверен.

---

# Часть IX. Пошаговая реализация

## Stage 0 — Baseline, pipeline и recovery

### Цель

Сделать текущий production flow воспроизводимым и защищённым до рефакторинга.

### Scope

- package name → `collab-studio`;
- Prisma generate до typecheck;
- test scripts;
- Vitest/RTL либо эквивалент для components;
- Playwright;
- CI;
- smoke baseline текущего app;
- backup/restore drill;
- document deploy/rollback;
- исправить сломанный `mobile_discussion_tab`;
- feature flag infrastructure.

### Non-goals

- visual redesign;
- routes rewrite;
- schema redesign;
- public features.

### Gate

- clean pipeline проходит;
- current login/project/track/lyrics/audio/comments работают;
- backup восстановлен в тестовую БД;
- no functional regression.

## Stage 1 — Router и state boundaries

### Scope

- AppRouter;
- route URLs;
- Auth provider;
- server query/cache layer;
- route loaders/containers;
- Player provider boundary;
- draft interface boundary;
- error boundaries;
- session-expired flow;
- сохранить старые screens внутри новых routes.

### Non-goals

- редизайн editor/player;
- public layer;
- rich text migration.

### Gate

- direct track refresh работает;
- Back работает;
- mobileTab state удалён как router replacement;
- `App.tsx` существенно уменьшается;
- old flows проходят E2E.

## Stage 2 — i18n, design tokens и responsive shell

### Scope

- ru/en infrastructure;
- design tokens;
- primitives;
- phone/tablet/desktop shell;
- bottom nav;
- headers;
- safe area/keyboard;
- loading/empty/error/read-only;
- dark theme;
- cover/avatar fallback.

### Gate

- нет hardcoded новых strings;
- shell работает 320→desktop;
- нет duplicated global nav;
- accessibility gate primitives;
- old business components продолжают работать.

## Stage 3 — Projects, scopes и invitations

### Scope

- Home private dashboard;
- My Projects/Collaborations;
- single/album creation;
- project details/tracks;
- primary owner;
- project/track grants;
- capabilities/presets/custom toggles;
- guest links;
- ownership transfer/grace;
- quota skeleton/entitlements;
- activity foundation.
- open-registration hardening;
- email verification;
- password recovery;
- 18+ acknowledgement;
- убрать implicit global-admin access к private projects;
- break-glass admin access с reason/audit;
- project cover upload/fallback.

### Migration

- additive owner/access tables/fields;
- backfill current owners/members;
- compatibility guards;
- isolation tests.

### Gate

- project/track scope нельзя обойти;
- invitation tokens revocable/expiring;
- guest cannot download;
- participant can download within scope;
- owner transfer atomic/audited.
- unverified account не может upload/publish/comment/DM;
- admin private access требует audited break-glass flow.

## Stage 4A — Lyrics workspace на текущей plain-text модели

### Scope

- read mode first;
- explicit Edit;
- current autosave/recovery regression coverage;
- one-editor lease;
- dedicated `lyricsRevision`;
- OCC compare flow;
- persistent player placeholder;
- context comments mobile sheet;
- clean Notes-like layout;
- no line numbers.

### Non-goals

- WYSIWYG;
- stable structured blocks;
- public text.

### Gate

- accidental close recovers;
- conflict never overwrites silently;
- keyboard does not cover editor;
- viewer read-only;
- player remains available.

## Stage 4B — Limited WYSIWYG и stable anchors

### Preconditions

- ADR editor library;
- serialization tests;
- migration rehearsal.

### Scope

- structured document;
- heading/bold/italic;
- stable block IDs;
- derived plain text;
- rich snapshots;
- paragraph/selection comments;
- shared DiscussionThread/DiscussionMessage foundation для lyrics targets;
- orphaned anchor UX;
- TXT export.

### Gate

- legacy lyrics migrate losslessly;
- copy/paste/IME/mobile selection tested;
- comments do not jump silently;
- autosave/OCC/offline still work;
- rollback path exists.

## Stage 5A — TrackAsset migration

### Scope

- `TrackAsset`;
- categories;
- audio/document/link;
- rename/current/offset;
- external providers separated from auth providers;
- backfill `AudioVersion`;
- soft delete/trash;
- quotas;
- legacy compatibility.

### Gate

- no lost files;
- stream/download access unchanged;
- backup/restore maps metadata to files;
- orphan audit passes;
- migration tested with production-like copy.

## Stage 5B — Persistent player и audio annotations

### Scope

- one runtime;
- collapsed/expanded;
- tabs continuity;
- player controls;
- exact asset annotations;
- point/range;
- audio-target discussion threads;
- conversion to existing task;
- external non-playable fallback.

### Gate

- playback не сбрасывается внутри track;
- no lyrics rerender on time ticks;
- annotation target/time correct;
- mobile keyboard/player coexist;
- Range seek works.

## Stage 6 — Discussions, chats, tasks, activity, Inbox

### Scope

- discussion threads/messages;
- project chat;
- track chat;
- mentions;
- tasks/priority/due/source;
- ActivityEvent;
- NotificationDelivery;
- Inbox;
- email/push policy;
- deep links.

### Gate

- notification ведёт в точный context;
- duplicate messages/tasks отсутствуют;
- unread state consistent;
- permission checks complete;
- background polling controlled.

## Stage 7 — Ready review, retention и export

### Scope

- snapshots;
- approvers;
- approve/request changes;
- invalidation;
- owner removes approver with reason;
- project READY;
- 30-day trash/project/account recovery;
- full scope export.

### Gate

- changed final invalidates approval;
- export соответствует scope;
- ownerless project невозможен;
- final asset cannot purge silently.

## Stage 8 — PWA и offline lyrics

### Scope

- manifest/icons/install;
- app shell cache;
- offline draft;
- reconnect OCC;
- logout cleanup;
- no private media caching;
- optional push foundation.

### Gate

- install works supported browsers;
- offline draft survives restart;
- reconnect conflict safe;
- service worker cannot expose previous user's data.

## Stage 9 — Public profiles и publication core

### Scope

- public profile opt-in;
- avatar upload/fallback;
- works/collab publications;
- selected snapshot only;
- genres/language/tags/terms/budget;
- 30-day expiry;
- public routes;
- favorites/likes/plays;
- external share;
- strict private/public boundary.

### Gate

- no private field leaked through serializer/API/HTML;
- only selected assets public;
- expired collab leaves Discover;
- public page works unauthenticated.

## Stage 10 — Discover, follows, public comments, DM

### Scope

- search/filter;
- manual featured;
- follows;
- public comment threads;
- author moderation;
- blocks/reports;
- DM requests;
- accepted conversations;
- project invitation card.

Public comments, follows и DM остаются выключенными feature flags до прохождения Stage 11 moderation/security gate.

### Gate

- stranger cannot spam beyond request;
- block enforced everywhere;
- guest cannot comment/message;
- report/moderation path operational;
- no attachment upload through DM/comments.

## Stage 11 — SEO, admin, observability и public hardening

### Scope

- server-rendered public metadata/content shell;
- sitemap/canonical/OG/JSON-LD;
- admin reports/accounts/system;
- private access audit;
- analytics;
- Web Vitals;
- storage/disk alerts;
- rate-limit tuning;
- moderation/legal pages;
- load/security tests.

### Gate

- public pages crawlable;
- private pages noindex/not leaked;
- restore/rollback tested;
- alerts tested;
- no P0/P1;
- performance/accessibility budgets met.
- только после этого разрешено включать public comments/DM/follows для всех пользователей.

## Stage 12 — Pricing/payment, только после отдельного решения

### Preconditions

- beta usage/storage/egress measurements;
- approved quotas;
- provider selected;
- tax/VAT/legal process reviewed;
- webhook/idempotency design;
- cancellation/grace/refund policy.

До этого stage все users получают `Beta Pro`; pricing UI не обещает несуществующую оплату.

---

# Часть X. Deploy и change management

## 51. Один production instance

Отдельного staging VPS нет. Поэтому:

1. Dev/test выполняются локально.
2. Build создаётся до production deploy.
3. Backup DB/assets выполняется до migration.
4. Migration только additive.
5. Новый backend сначала понимает old/new fields.
6. Health/readiness проверяются.
7. Container переключается коротко и контролируемо.
8. Previous image сохраняется.
9. Rollback не требует down migration.
10. Destructive cleanup выполняется позднее отдельным release.

## 52. Формат одного PR/итерации

Каждая итерация содержит:

- одну user story либо инфраструктурный outcome;
- scope/non-goals;
- migration note;
- tests;
- docs;
- verification output;
- rollback note.

Нельзя смешивать:

- router rewrite + public social schema;
- editor migration + audio migration;
- visual redesign + destructive data cleanup;
- payment + quota redesign;
- PWA cache + auth rewrite.

## 53. Idempotency

Retryable create operations должны иметь client-generated ID либо idempotency key:

- upload metadata;
- lyric snapshot;
- comment/message;
- invitation;
- collab response.

Network timeout не должен создавать duplicate.

---

# Часть XI. Definition of Done

## 54. Private studio beta готова, когда

- phone/tablet/desktop используют одну архитектуру;
- основные routes имеют URL и Back;
- пользователь открывает недавний track ≤3 действия;
- lyrics draft нельзя потерять молча;
- один-editor lease и OCC работают;
- player persistent;
- files/links/categories/trash работают;
- text/audio discussions точны;
- project/track chat и tasks работают;
- permissions проверяются backend;
- Ready review работает;
- PWA/offline draft безопасны;
- clean pipeline/E2E проходят;
- backup/restore/rollback проверены.

## 55. Public beta готова, когда

- public profile explicit opt-in;
- publication раскрывает только selected snapshot;
- Discover/search работают без fake data;
- public comments имеют moderation;
- follows/DM requests/blocks/reports работают;
- verified email и 18+ gates включены;
- public SEO работает;
- Terms/Privacy/Moderation/Copyright pages опубликованы;
- performance/accessibility/security gates пройдены;
- monitoring и disk alerts включены.

## 56. Финальный протокол ответа агента

После каждой выполненной задачи агент сообщает:

1. Что изменено.
2. Какие файлы затронуты.
3. Какие migrations добавлены.
4. Какие тесты добавлены/изменены.
5. Результаты install/generate/lint/test/build/e2e.
6. Проверенные viewports.
7. Известные ограничения.
8. Rollback.
9. Что является следующим разрешённым stage.

Если gate не пройден, агент не объявляет задачу готовой и не переходит дальше.

---

# Часть XII. Первый промпт для coding agent

Скопировать агенту вместе с этим файлом:

```text
Ты работаешь в существующем production-репозитории CollabStudio.

Каноническое ТЗ:
docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md

Прочитай его целиком. Не используй старые документы как источник решений при противоречии.

Текущая задача: выполнить только Stage 0.

До изменений:
1. Покажи commit, git status и фактическую структуру проекта.
2. Проверь существующие scripts, autosave/recovery, API и tests.
3. Запиши scope и non-goals Stage 0.

Обязательный результат:
- clean install pipeline;
- Prisma generate до typecheck;
- единые test scripts;
- unit/component/E2E foundation;
- baseline критичных текущих flows;
- backup/restore verification procedure;
- deploy/rollback checklist;
- исправление конкретного broken mobile discussion transition;
- отсутствие визуального или schema redesign.

Не начинай Stage 1.
Не переписывай приложение.
Не меняй продуктовые решения.
Не создавай public/social features.

Заверши фактическими результатами:
npm ci
npm run prisma:generate
npm run lint
npm test
npm run build
npm run e2e

Если команда не проходит, исправь причину либо честно зафиксируй blocker. Не объявляй Stage 0 завершённым при failing gate.
```
