# ARCHIVED INPUT — CollabStudio: уточнённые архитектурные решения

> Этот документ сохранён как история анализа. Каноническое ТЗ: `docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md`.

Дата: 2 июля 2026 года  
Статус: решения для планирования; не являются выполненными изменениями кода

## 1. Что принимается из дополнительного ревью

### OCC для текста — обязательный блокер server autosave

Текущий `PATCH /api/projects/:projectId/tracks/:trackId` не проверяет, на какой версии текста основано изменение. Два редактора могут сохранить изменения по очереди, и более поздний запрос молча заменит результат первого.

Целевой минимальный контракт:

```text
request:
  lyrics
  baseLyricsRevision
  versionLabel?

success:
  lyrics
  lyricsRevision

conflict:
  409 LYRICS_CONFLICT
  currentLyrics
  currentLyricsRevision
  currentUpdatedAt
```

Для `Track` предпочтителен отдельный монотонный `lyricsRevision Int`, а не общий `updatedAt`: название, tags и другие изменения трека не должны создавать ложный конфликт текста.

Запись выполняется условно:

```text
update where id = trackId and lyricsRevision = baseLyricsRevision
set lyrics = newLyrics, lyricsRevision = lyricsRevision + 1
```

Если обновлено ноль строк, сервер возвращает `409`, а не повторяет запись автоматически. Retry без участия пользователя для текстового конфликта опасен.

### Draft, saved lyrics и LyricVersion — разные состояния

- Draft: локальная незавершённая работа.
- Saved lyrics: актуальное состояние на сервере.
- LyricVersion: осознанная контрольная точка.

Сначала создаётся storage interface, затем реализация через IndexedDB. UI никогда не подменяет server lyrics локальным draft молча. Пользователь видит сравнение времени/revision и выбирает «Восстановить» или «Отбросить».

Local recovery является страховкой, а не гарантированным хранилищем. Draft удаляется после подтверждённого сохранения и при logout пользователя; ключ включает `userId/projectId/trackId`.

### Аннотация должна иметь конкретную audio target

Текущий код принимает дробный `timestampSeconds`, округляет его через `Math.round` и сохраняет `Int`. Аннотация относится ко всему треку, поэтому отображается и для другой аудиоверсии.

Целевая модель:

```text
AudioAnnotation
  audioRevisionId
  startMs
  endMs?
  text
  authorId
  status
```

До миграции UI должен явно фильтровать/объяснять legacy track-level annotations. Нельзя показывать их как точные замечания к каждой аудиоверсии.

### Домены OAuth и внешнего аудио должны быть разделены

Текущий Prisma enum `ExternalProvider` используется одновременно `AuthAccount` и `AudioVersion`. Это связало два независимых словаря.

Целевое разделение:

```text
AuthProvider
AudioExternalProvider
```

Миграция не блокирует routes/shell, но должна произойти до добавления новых OAuth или audio providers.

### Capabilities нужны как единая политика

UI и backend должны использовать одинаково названную матрицу возможностей:

```text
canEditLyrics
canCreateLyricVersion
canUploadAudio
canCommentLyrics
canAnnotateAudio
canResolveComments
canCreateTasks
canAssignTasks
canInviteMembers
canManageRoles
canDeleteProject
```

На первом этапе capabilities вычисляются из `admin/owner/editor/viewer` централизованно. Не нужно сразу хранить десяток boolean-флагов на каждом membership.

Текущее реальное поведение viewer:

- может читать и слушать;
- может создавать комментарии;
- может писать в chat;
- не может создавать аудио-аннотации;
- не может менять lyrics, audio, tasks и members.

Разрешить viewer аудио-аннотации можно только как явное продуктовое изменение backend policy, а не как побочный эффект нового UI.

## 2. Где дополнительное ревью нужно скорректировать

### Сначала audio domain decision, затем богатый player UI

Порядок `persistent player → AudioAsset/AudioRevision migration` создаёт риск двойной переделки:

- selector сначала работает с плоским `AudioVersion[]`, потом с группами;
- annotations сначала track-level, потом revision-level;
- labels и version numbers меняют смысл;
- upload flow должен получить asset target.

Правильный порядок:

1. На Stage 1 выделить player runtime и адаптер `PlayableAudio`.
2. До полной audio-вкладки принять ADR о границе продукта.
3. Выполнить additive migration аудиодомена.
4. Перенести данные и проверить rollback.
5. После этого строить окончательный selector, annotations и upload UX.

Допустим ранний минимальный persistent player на старой модели, если он использует адаптер и не включает новый сложный audio browser. Но он не должен закреплять плоскую модель в UI-контрактах.

### Не превращать CollabStudio в DAW без продуктового решения

`AudioAsset → AudioRevision` выглядит разумно для группировки Beat, Lead Vocal, Mix и Master. Но stems, takes, comping и одновременное воспроизведение дорожек могут быстро превратить продукт в браузерную DAW.

Перед schema migration нужно ответить:

- приложение только хранит и ревьюит отдельные файлы;
- или синхронно проигрывает несколько stems;
- нужен ли offset/sync между файлами;
- является ли take новой revision или отдельным asset;
- что пользователь считает «актуальной» ревизией каждой группы.

До отдельного решения scope: один выбранный аудиофайл проигрывается одновременно; CollabStudio не занимается multitrack mixing.

### Text anchors нельзя копировать из стандарта механически

`exactQuote/prefix/suffix/offsets/sourceRevision` — хорошая основа, но целевая модель зависит от редактора.

Для текущего plain textarea сначала нужен ADR:

- комментарий навсегда относится к конкретной lyric revision;
- или переносится вперёд при совпадении anchor;
- что делать с несколькими одинаковыми строками;
- offsets считаются в UTF-16 code units или Unicode code points;
- как UI показывает orphaned/outdated comment.

Минимальное безопасное правило:

1. хранить исходную revision и точную цитату;
2. пытаться перепривязать только при однозначном совпадении контекста;
3. при сомнении помечать anchor как outdated/orphaned;
4. никогда не переносить комментарий на другую строку молча.

Стабильный `blockId` имеет смысл только при переходе от одного textarea к block-based document model. Добавлять его в текущий plain text без механизма сохранения ID бессмысленно.

### ActivityEvent полезен, но не должен становиться event sourcing

Для Inbox и activity feed полезно отделить факт от доставки:

```text
ActivityEvent
NotificationDelivery
```

Но Stage 6 сначала должен определить реальные запросы:

- нужна ли общая activity feed;
- нужен ли один event многим получателям;
- нужны ли локализованные шаблоны;
- нужны ли retries/outbox.

Если нужен только Inbox, достаточно структурированной Notification с `type`, `actorId`, resource IDs, metadata и `readAt`. Полный event log без потребителя будет преждевременной сложностью.

### VisualViewport — fallback, не основной layout engine

Сначала применяются CSS safe areas, корректные scroll containers и keyboard-aware composition. `VisualViewport` добавляется как progressive enhancement для проблемных браузеров. Подписки на viewport events нужно throttling/debouncing и обязательно снимать при unmount.

Реальная клавиатура проверяется на физических iOS/Android устройствах; изменение viewport в desktop DevTools этого не заменяет.

## 3. Дополнительные решения, которых не хватало

### Discover — гипотеза, а не гарантированный финал

Публичная платформа не становится обязательной только потому, что присутствует в концепт-макетах. До Stage 10 нужно подтвердить:

- пользователи действительно хотят публиковать рабочие материалы;
- авторы готовы к правилам прав, скачивания и moderation;
- discovery помогает создавать коллаборации, а не отвлекает от студии;
- команда готова поддерживать abuse reports, ranking и публичный storage traffic.

Решение о разработке принимается по исследованию и beta-метрикам. Возможен итог, в котором CollabStudio остаётся сильным private collaboration product с share links, но без социальной сети.

### Идемпотентность мутаций

OCC защищает от конфликтов, но не от повторной отправки одного запроса после network timeout.

Для действий, создающих сущности или файлы, следует определить idempotency strategy:

- upload metadata;
- создание lyric version;
- отправка comment/message;
- приглашение участника.

Не все endpoints немедленно требуют `Idempotency-Key`, но retryable UI не должен создавать дубликаты.

### Нулевое число багов нельзя сделать acceptance criterion

Корректная инженерная цель:

- критические потоки покрыты тестами;
- определены SLO и performance budgets;
- ошибки наблюдаемы;
- есть staged rollout и rollback;
- известные дефекты имеют severity/owner;
- regressions блокируют release по заранее заданным правилам.

Формулировка «без багов и лагов» заменяется измеримыми порогами.

### Удаление и lifecycle аудио

При переходе к `AudioAsset/AudioRevision` нужно определить:

- soft delete или hard delete;
- кто может удалять;
- что происходит с annotations;
- как обрабатывается активная revision;
- как чистятся orphaned files;
- как backup/restore сохраняет связи metadata ↔ storage.

### Privacy локальных черновиков

IndexedDB доступен JavaScript текущего origin и не защищает от XSS. Поэтому нужны:

- строгий CSP;
- отсутствие HTML-инъекций в lyrics/comments;
- очистка draft при logout;
- понятное предупреждение на общем устройстве;
- запрет кэшировать приватные API-ответы service worker без отдельной политики.

### Версионирование API и additive migrations

Frontend и backend могут обновляться не атомарно. Изменения OCC, audio schema и anchors должны быть backward-compatible на период deploy:

1. добавить nullable/new fields;
2. развернуть backend, понимающий старый и новый контракт;
3. backfill;
4. переключить frontend;
5. наблюдать;
6. только затем сделать поля обязательными и удалить legacy path.

## 4. Уточнённые архитектурные ворота

### До Stage 4 Lyrics Workspace

- принят OCC contract;
- определена draft semantics;
- определено отличие Save от Create checkpoint;
- выбран временный и целевой anchor policy;
- есть conflict E2E test.

### До Stage 5 Audio Workspace

- принят ADR о review tool vs multitrack DAW;
- определены AudioAsset/AudioRevision;
- annotation target — конкретная revision;
- определены active revision и numbering;
- продуман lifecycle upload/delete;
- миграция проверена на копии данных.

### До Stage 6 Inbox/Activity

- определены типы событий и deep links;
- принято решение Notification metadata vs ActivityEvent;
- определены unread и deduplication semantics.

### До Stage 9 PWA

- определена cache policy для private API/audio;
- logout очищает draft/cache/player state;
- offline UI не обещает сохранение, если запрос ещё не дошёл до сервера.

## 5. Итог

Дополнительное ревью правильно нашло domain-level риски, которых не хватало в первом плане. Главная корректировка — не откладывать аудиомодель до момента, когда богатый audio UI уже построен.

Приоритет решений:

1. pipeline/tests/routes;
2. OCC и draft contract;
3. audio domain boundary и annotation target;
4. capabilities policy;
5. text anchor policy;
6. activity model только по реальному сценарию.

Так план остаётся последовательным и не превращается ни в визуальный прототип на моках, ни в преждевременно сложную платформу.
