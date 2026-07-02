# ARCHIVED INPUT — CollabStudio: решения продуктового интервью

> Этот документ сохранён как история продуктового интервью. Каноническое ТЗ: `docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md`.

Дата фиксации: 2 июля 2026 года  
Статус: утверждённые продуктовые решения для последующего ТЗ

## 1. Позиционирование

CollabStudio — рабочее пространство творческой команды, а не DAW и не доска объявлений.

Основная ценность:

> Писать текст с телефона и ПК, слушать рабочее аудио, собирать материалы, приглашать участников, обсуждать правки и доводить трек до готового состояния в одном месте.

Основные пользователи:

- артист/музыкант;
- автор текста;
- начинающий продюсер/битмейкер;
- звукорежиссёр/sound designer;
- сольный пользователь;
- творческая команда.

Эмоциональное направление:

- творческий;
- живой;
- приглашающий.

Референсы по ощущениям: Suno, SoundCloud, Instagram, BeatStars и ясность старых версий VK. Прямое копирование интерфейсов не требуется.

## 2. Иерархия работы

```text
Project
  Track
    Lyrics
    Audio materials
    Comments
    Tasks
    Track chat
    Versions
```

- Project может быть альбомом или техническим контейнером одиночного трека.
- Пользователь может создать одиночный трек без необходимости понимать внутренний project container.
- Доступ выдаётся ко всему проекту либо только к выбранным трекам.
- Общий чат существует на уровне проекта.
- Отдельный чат существует на уровне трека.

## 3. Доступ и приглашения

- Все проекты приватны по умолчанию.
- Приватная ссылка даёт незарегистрированному пользователю статус гостя.
- Гость может читать и слушать, но не скачивать и не менять данные.
- Для редактирования, комментариев, загрузок, подписок, откликов и сообщений нужна регистрация.
- Любой зарегистрированный участник может скачивать все материалы в пределах выданного ему project/track scope.
- Право скачивания является базовым и не отключается отдельной capability.
- После выхода или удаления участника доступ и скачивание прекращаются.

При создании приглашения владелец:

- выбирает project/track scope;
- выбирает готовый permission preset;
- при необходимости вручную меняет capabilities;
- может отозвать ссылку;
- может задать срок действия.

Guest link policy:

- 7 дней по умолчанию;
- configurable extension;
- optional password;
- owner revocation;
- бессрочная ссылка только по явному выбору;
- token сам является credential и хранится безопасно.

Предварительные presets:

- соавтор текста;
- работа с аудио;
- ревьюер;
- только просмотр;
- пользовательский набор прав.

Owner-only действия не входят даже в «полные права» участника:

- удаление проекта;
- передача ownership;
- управление владельцем;
- окончательное удаление истории;
- изменение обязательных approvers без audit.

### Ownership

- В каждый момент у проекта один primary owner.
- Owner может назначать управляющих участников.
- Управляющие получают расширенные capabilities, но не становятся billing/storage owner.
- Ownership можно передать другому участнику.
- Получатель обязан подтвердить передачу.
- После передачи прежний owner остаётся участником либо выходит.
- Storage quota проекта переходит новому owner.
- При нехватке quota действует 7-дневный grace period без новых upload.
- После grace period проект становится read-only, но не удаляется автоматически.

## 4. Текст и редактор

Трек сначала открывается в режиме чтения. Пользователь осознанно нажимает «Редактировать».

### Режим чтения

- чистый текст без постоянных номеров строк;
- persistent mini-player;
- быстрый комментарий к абзацу;
- комментарий к выделенной фразе;
- маркеры открытых обсуждений;
- resolved comments скрыты по умолчанию.

### Режим редактирования

- один активный редактор одновременно;
- остальные участники читают и комментируют;
- отображается, кто редактирует;
- edit lease имеет heartbeat и expiration;
- владелец может снять зависшую блокировку;
- optimistic concurrency остаётся последней защитой.

Редактор ощущается как простой Notes-style блокнот:

- ограниченный WYSIWYG;
- обычный текст;
- заголовки;
- bold;
- italic;
- undo/redo;
- autosave;
- draft recovery;
- история версий;
- без таблиц, картинок, цветов и тяжёлого Word-интерфейса.

Актуальный `main` уже содержит autosave, IndexedDB recovery и draft conflict protection. Новый UI должен сохранить эти возможности.

### Версии и финал

- участник может свободно менять текущий рабочий текст;
- сохранённые версии нельзя уничтожить редактированием current draft;
- original/final snapshots остаются в истории;
- после изменения финального текста создаётся новый рабочий draft;
- новый draft можно позже утвердить как следующий финал.

## 5. Комментарии к тексту

Комментарий создаёт thread:

- исходное сообщение;
- ответы;
- `@mentions`;
- open/resolved/reopened;
- преобразование в задачу;
- сохранённый контекст;
- author edit с пометкой;
- soft deletion без разрушения истории.

Файлы и голосовые сообщения к комментариям не прикрепляются.

Anchor поддерживает:

- весь абзац;
- выбранную фразу;
- source revision;
- exact quote/context;
- orphaned/outdated state при неоднозначной перепривязке.

Комментарий никогда не переносится на случайный текст молча.

## 6. Аудиоматериалы

На уровне трека четыре простых раздела:

```text
Бит
Вокал
Микс
Другое
```

Каждая загрузка:

- является отдельной видимой карточкой;
- не перезаписывает старый файл;
- имеет изменяемое display name;
- сохраняет неизменное original filename;
- имеет автора, дату, заметку и категорию;
- может быть отмечена как актуальная;
- может иметь необязательный start offset.

Пользователь сам называет материалы, например:

- Вася — основной вокал v1;
- Вася — основной вокал v2;
- Вася — бэк-вокал;
- Mix 3.

Автоматически прятать старые файлы внутрь новой карточки не нужно.

### Загрузка и ссылки

- Небольшой MP3 бита/демо загружается непосредственно в CollabStudio.
- Большие WAV, капы и stems можно передавать внешними ссылками.
- Внешняя ссылка не расходует storage quota.
- Если URL является playable source, он работает в player.
- Иначе пользователь видит «Открыть у провайдера».
- Полные OAuth-интеграции облачных провайдеров не входят в первый этап.
- TXT разрешён в разделе «Другое».
- Executable/script/archive uploads в первой beta запрещены.

### Удаление

- Участник может отправить собственный файл в корзину.
- Владелец получает уведомление и может восстановить файл.
- Окончательно удаляет только владелец.
- Удаление актуального/аннотированного/final материала требует предупреждения.
- Действия видны в audit/activity.

## 7. Player и аудиоаннотации

- Один player runtime на Track Workspace.
- Collapsed и expanded UI используют один `<audio>`.
- Player продолжает работать при смене вкладок трека.
- Воспроизводится один выбранный файл одновременно.
- CollabStudio не является multitrack DAW.

Функции:

- play/pause;
- seek;
- ±10 секунд;
- volume;
- playback speed;
- A/B loop;
- выбор файла;
- current marker;
- Media Session как progressive enhancement.

Audio annotation:

- привязана к конкретному аудиофайлу;
- имеет точку либо диапазон;
- хранит миллисекунды;
- отображается маркером на progress/waveform;
- открывает thread;
- поддерживает mentions, resolve/reopen и conversion to task;
- не переносится автоматически на новый mix.

Для внешних ссылок таймкоды работают только при встроенном playback.

## 8. Задачи

Task может быть связан с:

- проектом;
- треком;
- абзацем/фразой;
- аудиофайлом;
- таймкодом/диапазоном;
- исходным комментарием.

Task содержит:

- title;
- description;
- assignee;
- status;
- optional priority;
- optional due date;
- source context;
- author;
- history.

Комментарий можно превратить в задачу одним действием.

## 9. Activity и согласование готовности

Все участники видят структурированную activity feed:

- сохранение текста/версии;
- загрузка/удаление материала;
- комментарий и resolve;
- задача и изменение статуса;
- приглашение/выход;
- изменение permissions;
- согласование.

Keystrokes в activity не записываются.

### Ready approval

`Готов` — результат согласования snapshot:

1. Владелец отправляет трек на проверку.
2. Выбирает обязательных approvers.
3. Фиксируются final lyrics, актуальный mix и выбранные материалы.
4. Участники подтверждают либо запрашивают изменения.
5. После подтверждения owner и всех required approvers трек получает статус `Готов`.
6. Изменение final lyrics/current mix сбрасывает соответствующие approvals.
7. Владелец может исключить пропавшего/несогласного approver.
8. Исключение записывается в историю и отправляет уведомление.

Это workflow-согласование, а не юридическая передача прав.

## 10. Публичные публикации

Рабочий проект никогда не публикуется целиком.

### Публичная работа

- cover;
- description;
- final audio;
- optional final lyrics;
- указанные имена/псевдонимы участников.

Приватными остаются:

- отдельные биты/капы;
- drafts;
- старые mixes;
- comments;
- tasks;
- chats;
- work history.

### Поиск коллаборации

Можно опубликовать только выбранный:

- бит;
- текст;
- demo.

Публикация содержит:

- description;
- genre;
- work/song language;
- requested collaborator type;
- author;
- expiration/status;
- collaboration terms.

Collab-публикация активна 30 дней:

- автор получает напоминание;
- может продлить одним действием;
- expired post скрывается из Discover;
- в профиле остаётся как закрытый/архивный;
- готовые публичные работы не имеют автоматического срока.

Условия:

- бесплатная коллаборация;
- роялти;
- фиксированная оплата;
- обсуждается.

Для fixed payment можно указать optional min/max range и currency. CollabStudio не принимает оплату, не хранит доли и не гарантирует расчёты.

Отклик:

1. Зарегистрированный пользователь отправляет сообщение.
2. Владелец принимает/отклоняет.
3. При принятии владелец выбирает scope и permissions.
4. Только затем пользователь становится участником.

## 11. Публичные комментарии и модерация

Публичные комментарии разрешены и могут содержать резкую лексику.

Запрещены:

- угрозы;
- doxxing;
- spam;
- fraud;
- illegal content;
- иные нарушения опубликованных правил.

Возможности автора:

- скрыть комментарий в ветке;
- закрыть все комментарии публикации;
- заблокировать пользователя для всех своих публикаций.

Возможности платформы:

- report;
- moderation queue;
- hide/remove;
- suspend/ban;
- decision reason;
- audit log.

Незарегистрированные гости читают, но не комментируют.

### Public reactions

Готовая публичная работа:

- play count;
- like;
- comments;
- favorite/save;
- внешняя ссылка share.

Collab-предложение:

- save;
- external share link;
- respond.

Внутренних reposts нет. CollabStudio не превращается в TikTok-style repost feed.

Автор самостоятельно решает, публиковать полный бит, короткое demo или tagged MP3. CollabStudio не обрезает preview, не добавляет watermark и не предоставляет DRM.

## 12. Profiles, follows и direct messages

Публичный профиль:

- display name/alias;
- avatar;
- bio;
- несколько specializations;
- genres;
- works;
- open collab posts;
- external links;
- availability;
- followers/following counts.

Профиль приватен после регистрации и становится публичным только после явного opt-in пользователя.

DM:

- только зарегистрированным;
- text и ordinary links;
- без файлов, аудио и voice;
- read/unread;
- report/block;
- project invite как системная карточка.

Незнакомый пользователь:

1. отправляет одно message request;
2. не может продолжить до принятия;
3. получатель принимает, отклоняет, жалуется или блокирует.

Follow не даёт доступ к DM или private projects.

## 13. Home, Discover и навигация

После входа главная ориентирована на работу:

1. Продолжить.
2. Требует внимания.
3. Мои проекты и коллаборации.
4. Активность команды.
5. Небольшой блок новых публичных работ/collabs.

Discover является отдельным экраном и не доминирует.

Discover:

- Работы;
- Люди;
- Коллаборации.

Основные фильтры:

- genre;
- language;
- specialization/requested role;
- collaboration terms;
- optional budget range.

В beta используются search, tags, newest и manual featured без сложного recommendation algorithm.

Metadata:

- genre выбирается из локализованного controlled vocabulary;
- разрешено несколько genres;
- mood/style задаются свободными tags;
- language выбирается из стандартного списка;
- search учитывает controlled genres и custom tags.

### Search engine visibility

Индексируются только явно публичные:

- works;
- collab posts;
- public profiles.

Private projects, guest links, chats, tasks и internal files:

- требуют соответствующего access;
- получают `noindex`;
- не входят в sitemap.

## 14. Responsive interface

Одна общая responsive-система заменяет старые независимые представления.

### Phone

- один главный контекст на экран;
- bottom navigation;
- sheets/dialogs;
- persistent mini-player;
- keyboard-safe editor;
- dark theme.

### Tablet

- master-detail;
- portrait/landscape adaptation.

### Desktop

```text
Left: projects/tracks
Center: track workspace
Right: contextual comments/chat/tasks
Bottom: persistent player
```

- боковые панели сворачиваются;
- focus mode оставляет editor + player;
- старый desktop UI не сохраняется как отдельный продукт.

AI не входит в первую мобильную версию. Существующий desktop AI временно сохраняется без расширения.

## 15. Visual system

- одна качественная dark theme в первой версии;
- фиолетово-синий accent используется умеренно;
- covers и content создают эмоциональность;
- минимум тяжёлых background effects;
- minimum 44×44 touch targets;
- accessible contrast/focus;
- reduced motion;
- design tokens допускают будущую light theme, но она не разрабатывается сейчас.

Images:

- project cover необязателен;
- JPG/PNG/WebP загружается напрямую;
- изображения оптимизируются;
- при отсутствии cover используется качественный deterministic gradient fallback;
- public work может наследовать project cover либо иметь отдельный;
- публикация без cover разрешена;
- avatar необязателен, fallback — initials.

## 16. PWA и offline

- приложение устанавливается на главный экран;
- app shell открывается offline;
- lyrics draft сохраняется offline;
- после восстановления сети выполняется revision check;
- при конфликте показывается compare/manual merge;
- offline draft никогда не перезаписывает server text автоматически;
- chat/comments/tasks/uploads в первой beta требуют сети;
- private audio не кэшируется offline автоматически.

## 17. Локализация

Первая beta:

- русский;
- английский.

Архитектура сразу допускает:

- испанский;
- французский;
- немецкий;
- другие языки.

Локализуются UI, email и системные уведомления. User content автоматически не переводится.

## 18. Accounts, age и privacy

- Свободная публичная регистрация.
- Email/password и Google.
- Email verification перед public comments, DM, publication и uploads.
- Password recovery.
- Rate limits и anti-abuse.
- Первая публичная beta только `18+`.
- Дата рождения публично не показывается.

Администратор:

- видит public content и moderation data;
- видит quotas/technical metadata;
- не имеет свободного доступа к private content;
- открывает private content только по report/support/legal reason;
- каждый такой доступ audit-логируется.

## 19. Права на материалы и release acknowledgement

CollabStudio не:

- рассчитывает авторские доли;
- хранит долги;
- проводит выплаты;
- заменяет юридический договор;
- решает copyright disputes.

Join и commercial release — разные подтверждения.

- Join разрешает совместную работу внутри конкретного project scope.
- Перед release создаётся конкретный snapshot.
- Required participants дают workflow approval.
- Условия коммерческого использования стороны оформляют самостоятельно.

## 20. Уход участника и удаление аккаунта

При выходе участника:

- дальнейший доступ прекращается;
- activity и сохранённые материалы остаются;
- авторство сохраняется;
- owner получает уведомление;
- removal request является отдельным процессом.

Удаление owner account:

- active project нельзя оставить без владельца;
- ownership передаётся участнику либо проект архивируется;
- public posts скрываются;
- участники уведомляются;
- проект временно становится read-only;
- есть recovery period;
- удаление можно отменить.

Retention:

- file trash — 30 дней;
- deleted project recovery — 30 дней;
- account deletion recovery — 30 дней;
- ранняя permanent cleanup требует повторного подтверждения;
- final/published material нельзя окончательно удалить без снятия соответствующего состояния.

## 21. Экспорт

- Owner может экспортировать весь project.
- Participant может экспортировать весь доступный ему track/project scope.
- Guest не экспортирует.

Export включает:

- audio;
- lyrics и versions;
- TXT/attachments;
- participants;
- comments/tasks/annotations в readable format;
- manifest с авторами и original filenames.

Downloads и mass export записываются в owner security log.

## 22. Тарифы и квоты

Сейчас публичная beta бесплатна и выдаёт всем временный `Beta Pro`.

Будущая гипотеза:

- Free: `$0`;
- второй тариф: `$5`;
- третий тариф: `$15`.

Платёжная интеграция пока не реализуется.

Entitlements проектируются отдельно:

- owned project count;
- tracks per project;
- total storage;
- max upload size;
- trash retention;
- feature flags.

Storage расходует owner проекта независимо от uploader. Shared projects не расходуют owned-project quota участника.

«Безлимитный storage» не является буквальным техническим значением: перед оплатой назначаются реальные quotas/fair-use после измерения storage и egress.

## 23. Инфраструктура beta

- Домен: `collabstudio.run`.
- Один VPS.
- Ожидаемые первые пользователи: 5–10.
- 4 vCPU, 8 GB RAM.
- 75 GB NVMe либо 150 GB SSD.
- 200 Mbit/s port.
- Один production instance.
- Отдельный staging server пока не создаётся.

Обязательны:

- local test environment;
- backup DB + audio;
- off-server encrypted backup;
- restore drill;
- disk alerts;
- health checks;
- logs;
- prebuilt release;
- additive migrations;
- previous image rollback;
- feature flags.

### Privacy-friendly analytics

Разрешены технические/product events:

- registration completed;
- project/track created;
- editor opened;
- save success/conflict;
- playback/upload failure;
- invitation accepted;
- collab response;
- Web Vitals;
- client/server errors.

Запрещено отправлять:

- lyrics;
- messages;
- private filenames;
- audio;
- private URLs;
- content of comments/tasks.

## 24. Порядок реализации

1. Pipeline, tests, backup и rollback.
2. Routes, state boundaries и responsive shell.
3. Private projects, editor, player, comments, chat и tasks.
4. Invitations, capabilities, activity и Ready approval.
5. PWA и offline lyrics draft.
6. Public profiles, Discover, collab posts, public comments, follows и DM.
7. Performance, moderation и production hardening.
8. Pricing/payment только после beta measurements.

Public social layer не разрабатывается раньше качественной private team studio.

## 25. Оставшиеся ADR/точные параметры

До реализации соответствующих этапов требуется окончательно определить:

- rich-text canonical storage и migration с текущего `lyrics String`;
- stable block IDs/text anchors;
- точную capability matrix каждого preset;
- edit lease duration/heartbeat;
- trash и account recovery periods;
- реальные total storage/max file quotas;
- outbound email/push providers;
- backup destination/retention;
- public Terms, Privacy, Moderation и Copyright policies;
- analytics events без user content;
- payment provider и налоговый процесс перед платными тарифами.
