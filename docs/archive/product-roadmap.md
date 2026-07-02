# ARCHIVED INPUT — CollabStudio: мастер-план развития от текущего сайта до мобильного продукта

> Этот документ сохранён как история анализа. Каноническое ТЗ: `docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md`.

Дата: 2 июля 2026 года  
Исходная точка: `main`, commit `fa92fbf`

## 1. Цель продукта

CollabStudio должен стать удобной рабочей студией для создания трека с телефона, планшета и компьютера.

Основной результат для пользователя:

> Я быстро открываю нужный трек, вижу актуальный текст, слушаю нужную аудиоверсию, оставляю точную правку или таймкод и понимаю, что изменили другие участники.

Визуальные макеты задают направление: тёмная тема, музыкальный характер, крупные touch controls, карточки и компактный плеер. Они не являются обязательной пиксельной спецификацией и не требуют спрайтов.

## 2. Для кого делаем

### Автор / владелец проекта

- создаёт проект и треки;
- пишет текст и фиксирует версии;
- прикрепляет демо, бит, вокал и референсы;
- приглашает участников и назначает права;
- принимает или закрывает правки.

### Соавтор / редактор

- открывает приглашённый проект;
- редактирует текст;
- загружает аудиоверсии;
- комментирует строки и таймкоды;
- работает с задачами и чатом.

### Ревьюер / viewer

- читает и слушает;
- оставляет разрешённую обратную связь;
- не может менять защищённые данные проекта.

### Звукорежиссёр / sound designer

- быстро переключает аудиоверсии;
- ставит A/B loop;
- оставляет таймкод-аннотации;
- видит контекст задачи и обсуждения.

## 3. Приоритет пользовательских сценариев

Порядок важности:

1. Войти и продолжить последнюю работу.
2. Найти свой или приглашённый проект.
3. Открыть трек и не потерять контекст.
4. Читать и редактировать текст.
5. Слушать и переключать аудиоверсии.
6. Оставить комментарий к строке или таймкоду.
7. Понять, что требует внимания.
8. Создать проект/трек и пригласить участника.
9. Управлять версиями, задачами и обсуждением.
10. Публиковать и находить публичные работы — после стабилизации рабочей студии.

Пункт 10 является продуктовой гипотезой, а не гарантированной частью продукта. Решение о публичной платформе принимается после beta private studio и исследования пользователей.

## 3.1. Как измеряем пользу и качество

Продуктовые метрики без сбора содержимого lyrics/audio:

- доля пользователей, открывших нужный трек после входа;
- median time от входа до первого meaningful action;
- успешность сохранения текста и частота `LYRICS_CONFLICT`;
- успешность старта playback и переключения аудиоверсии;
- успешность/длительность upload и причины отказов;
- доля уведомлений, открывающих правильный контекст;
- время от comment/task до resolve;
- возврат в активный проект в течение недели.

Инженерные метрики:

- crash-free/error-free sessions;
- API p50/p95 latency и error rate по endpoint;
- LCP, INP и CLS p75 по типу устройства;
- доля failed media streams/uploads;
- размер route chunks;
- количество rollback/recovery случаев.

Запрещено отправлять в аналитику текст песен, сообщения, имена приватных файлов, аудио или секретные URL.

## 4. Принципы архитектуры

### Рабочее приложение важнее витрины

Сначала доводим приватную совместную работу. Публичная лента не должна задерживать качественный editor workspace.

### Один источник правды

- server state приходит только через API layer;
- URL хранит текущий экран, проект, трек и вкладку;
- player state живёт в workspace/player provider;
- черновик редактора отделён от сохранённой lyric version;
- права определяются backend, UI только отражает их.

### Маленькие обратимые изменения

Каждый этап:

- ограничен конкретным пользовательским потоком;
- не смешивает большие schema, backend и visual rewrite;
- завершается рабочими lint/build/tests;
- может быть выпущен независимо;
- имеет rollback без потери пользовательских данных.

### Не обещать несуществующее

Кнопка появляется только тогда, когда у неё есть:

- понятное действие;
- loading state;
- success state;
- error/retry state;
- проверка прав;
- тест.

### Mobile-first, не mobile-only

- phone: один главный контекст на экран;
- tablet: master-detail;
- desktop: полноценное рабочее пространство;
- данные и действия одинаковы, представление адаптивно.

## 5. Целевая структура frontend

Примерная граница модулей, а не требование одномоментного переезда:

```text
src/
  app/
    AppRouter.tsx
    AppProviders.tsx
    routes.ts
  features/
    auth/
    projects/
    track-workspace/
      lyrics/
      audio/
      comments/
      chat/
      tasks/
      versions/
    inbox/
    profile/
  shared/
    api/
    ui/
    hooks/
    lib/
    styles/
```

Не нужно сначала создавать десятки пустых файлов. Модуль выделяется, когда в него переносится реальный работающий flow.

## 6. Целевая навигация

### Phone

Глобальная нижняя навигация:

- Главная
- Проекты
- `+`
- Inbox
- Профиль

Track Workspace является вложенным экраном и не обязан быть отдельным глобальным пунктом.

### Tablet

- список проектов/треков слева;
- выбранный workspace справа;
- комментарии и дополнительные действия открываются sheet/panel;
- в portrait допускается однооконный режим.

### Desktop

- сохранить продуктивность текущих трёх зон;
- после стабилизации перевести их на те же routes и feature modules;
- не поддерживать две независимые реализации бизнес-логики.

## 7. План работ по релизным этапам

## Этап 0. Зафиксировать рабочую исходную точку

Цель: будущий редизайн не должен незаметно ломать существующий сайт.

Работы:

- описать реальные текущие сценарии и роли;
- исправить clean-install pipeline: Prisma generate до typecheck;
- добавить CI: install → generate → lint → test → build;
- добавить минимальный test runner;
- добавить Playwright smoke tests существующего desktop flow;
- проверить миграции на пустой БД и обновление существующей БД;
- зафиксировать тестовые данные без production-секретов;
- переименовать npm package в `collab-studio`;
- документировать known issues, включая сломанный переход `mobile_discussion_tab`.
- завести ADR/decision log для OCC, text anchors, audio domain, capabilities и notification/activity model;

Выходной контроль:

- чистая установка воспроизводима;
- lint/build/tests проходят одной последовательностью;
- login, project, track, lyrics save и audio playback проверяются автоматически;
- git tree чист после проверок.

## Этап 1. URL, providers и границы состояния

Цель: сделать фундамент экранов до визуального редизайна.

Работы:

- добавить маршруты и browser history;
- вынести session bootstrap из `App.tsx`;
- вынести загрузку проектов и активного трека в route-level слой;
- определить player state boundary;
- определить адаптер `PlayableAudio`, чтобы player runtime не зависел от плоской или сгруппированной модели хранения;
- определить draft storage interface без автоматического включения server autosave;
- добавить route error boundary;
- поддержать прямое открытие project/track URL;
- корректно восстанавливать контекст после login/session expiry;
- не менять внешний вид глубоко на этом этапе.

Выходной контроль:

- refresh на URL трека возвращает в тот же трек;
- browser Back работает предсказуемо;
- нет второго конкурирующего `mobileTab` state;
- `App.tsx` заметно уменьшается;
- desktop flow проходит прежние smoke tests.

## Этап 2. UI foundations и responsive app shell

Цель: единая визуальная и адаптивная основа.

Работы:

- определить design tokens: фон, поверхности, текст, accent, danger, success, radius, spacing;
- выбрать один комплект Lucide icons;
- сделать fallback cover как CSS-gradient/initials, без обязательных спрайтов;
- создать AppShell, ScreenHeader, BottomNav, Tabs, Button, IconButton, Sheet, Dialog;
- создать Loading, Empty, Error и ReadOnly states;
- добавить safe-area, `100dvh`, keyboard-safe layout;
- добавить reduced-motion и видимые focus states;
- проверить контраст и touch targets;
- сделать phone/tablet/desktop shells.

Выходной контроль:

- нет дублирующей глобальной навигации;
- shell работает от 320 px;
- tablet имеет master-detail foundation;
- ни один control не перекрывается home indicator или клавиатурой;
- нет кнопок без accessible name.

## Этап 3. Проекты и треки

Цель: быстрый путь к рабочему материалу.

Работы:

- экран «Продолжить работу» на основе недавних доступных треков;
- список «Мои» и «Со мной» на основе membership/role;
- поиск и фильтрация по уже загруженным доступным проектам;
- project detail;
- создание проекта и трека;
- приглашение участника;
- role/read-only indicators;
- skeleton, empty, retry и destructive confirmation;
- optimistic UI только там, где rollback очевиден.

Backend gap:

Текущий API возвращает проекты, доступные пользователю, но явно не разделяет owner/shared и не предоставляет отдельный lightweight recent endpoint. Сначала можно вычислять это из текущего ответа; оптимизацию endpoint делать только по измерениям.

Выходной контроль:

- пользователь за ≤3 действия открывает недавний трек;
- нельзя выполнить запрещённое действие только за счёт скрытой кнопки — backend по-прежнему проверяет права;
- создание и приглашение работают на phone и desktop;
- empty user понимает, как создать первый проект.

## Этап 4. Track Workspace: текст и версии

Цель: сделать написание текста удобным на телефоне.

Работы:

- вкладки workspace;
- read mode и edit mode;
- добавить отдельный `lyricsRevision` и optimistic concurrency contract;
- понятный статус dirty/saving/saved/error;
- ручное сохранение новой lyric version;
- предупреждение о несохранённом черновике;
- восстановление локального draft после случайного refresh;
- version history и compare/restore только в рамках поддержанного API;
- line number и comment indicators;
- bottom sheet выбранной строки.
- при `409 LYRICS_CONFLICT` не повторять сохранение автоматически: предложить сравнить, скопировать свой вариант или объединить вручную;

Важное решение:

Не называть debounce «autosave version». Autosave сохраняет черновик, а новая версия создаётся осознанным действием. Иначе история версий быстро превращается в шум.

Отдельный будущий backend task:

Заменить нестабильный `lineIndex` на устойчивые text anchors. Перед schema change принять политику source revision, exact quote/context, неоднозначных совпадений и orphaned comments. До этого явно тестировать вставку/удаление строк и не обещать идеальную перепривязку комментариев.

Выходной контроль:

- ввод не тормозит на длинном тексте;
- клавиатура не перекрывает save/status/player;
- незаписанный draft нельзя потерять молча;
- viewer не видит ложного editable state;
- версия создаётся ровно один раз на подтверждённое сохранение.

## Этап 5A. Решение и миграция аудиодомена

Цель: не закрепить в новом UI плоскую модель, которая не различает бит, вокал, референс, mix и master.

Сначала принять продуктовую границу:

- CollabStudio проигрывает один выбранный файл и служит для review/version collaboration;
- multitrack playback, offsets, stem sync и mixing не входят в этот этап;
- определить, что является audio asset, revision/take и active revision.

Целевая основа:

```text
Track
  AudioAsset
    AudioRevision
      AudioAnnotation
```

Работы:

- спроектировать additive Prisma migration и rollback;
- разделить OAuth provider и audio external provider domains;
- связать annotation с конкретной audio revision;
- хранить таймкод в миллисекундах и при необходимости диапазон;
- определить numbering, active revision, upload/delete lifecycle;
- backfill существующих `AudioVersion` и legacy annotations;
- проверить migration на копии данных до production.

Выходной контроль:

- существующее аудио не потеряно;
- old/new backend contract совместим на период deploy;
- у каждой новой annotation однозначная target revision;
- orphan cleanup и backup/restore учитывают новую модель.

## Этап 5B. Persistent audio workspace

Цель: аудио остаётся доступным во время всей работы над треком.

Работы:

- один audio element на workspace;
- collapsed/expanded player;
- выбор версии;
- play/pause, seek, ±10 сек, speed, volume;
- A/B loop;
- список аудиоверсий и upload/link;
- таймкод-аннотации;
- media session metadata, если браузер поддерживает;
- корректное поведение при blocked autoplay, network error и unsupported external URL;
- не загружать все аудиофайлы заранее;
- waveform добавлять только после выбора реального способа декодирования/кэширования; обычный progress bar допустим.

Performance:

- player controls реагируют без ожидания server round-trip;
- смена вкладки не перезапускает audio;
- смена трека останавливает или переносит playback по явно выбранному правилу;
- большие аудиофайлы стримятся и не удерживаются целиком в React state.

Выходной контроль:

- playback не прерывается при переходе Текст ↔ Обсуждение ↔ Версии;
- player не перекрывает редактор;
- upload показывает реальный progress/error или честное состояние ожидания;
- annotation создаётся на правильном таймкоде.

## Этап 6. Обсуждение, задачи и Inbox

Цель: пользователь понимает, где от него ждут действия.

Работы:

- line comments sheet;
- общий comments view;
- chat;
- tasks с assignee/status;
- notifications/invitations в Inbox;
- unread badges;
- переход из notification прямо в нужный project/track/context;
- polling оставить как начальный вариант, realtime вводить только при доказанной необходимости;
- дедупликация уведомлений и понятный mark-as-read.
- централизовать capability policy; сначала вычислять capabilities из существующих ролей;
- выбрать минимальную модель структурированной Notification либо ActivityEvent + NotificationDelivery по реальным требованиям ленты и Inbox.

Выходной контроль:

- notification ведёт в правильный контекст;
- resolve соблюдает права;
- отправленное сообщение не дублируется после refresh/poll;
- unread state согласован между badge и списком.

## Этап 7. Профиль и настройки

Цель: управление реальным аккаунтом, а не декоративная social-статистика.

Работы:

- avatar, display name, username/email;
- связанные OAuth accounts;
- logout/session management;
- настройки интерфейса и доступности;
- список недавних доступных проектов;
- privacy и security actions;
- статистику показывать только из реальных данных.

Выходной контроль:

- изменение данных имеет validation/error/success;
- OAuth linking не создаёт второй случайный аккаунт;
- опасные действия требуют подтверждения.

## Этап 8. Производительность и устойчивость

Цель: убрать лаги измеряемо, а не обещанием «должно быть быстро».

Performance budgets для production mobile:

- initial JS gzip: стремиться ≤200 KB для login/home route; тяжёлые workspace-модули lazy-load;
- LCP p75 ≤2.5 сек на типичном 4G;
- INP p75 ≤200 мс;
- CLS p75 ≤0.1;
- ввод текста не вызывает заметный re-render всего приложения;
- списки с большим числом элементов измерить до решения о virtualization;
- изображения имеют размеры, lazy loading и fallback;
- polling останавливается в background tab и после logout.

Работы:

- route/code splitting;
- React Profiler для editor/player hot paths;
- abort устаревших запросов;
- устранение waterfall requests;
- кэширование только с понятной invalidation;
- monitoring client/server errors;
- structured server logs и request IDs;
- backup/restore drill;
- rate limits и upload limits проверить на реальных сценариях.

Выходной контроль:

- Lighthouse/Web Vitals записаны для контрольных устройств;
- нет утечек audio listeners, intervals и object URLs;
- slow/offline/error flows протестированы;
- restore проверен, а не только описан.

## Этап 9. PWA и beta release

Цель: удобная установка и безопасный ограниченный запуск.

Работы:

- web app manifest, icons и theme colors;
- installable shell;
- не кэшировать приватные API-ответы опасным образом;
- offline fallback без обещания offline collaboration;
- beta cohort;
- feedback form с route/build/version context;
- аналитика ключевых воронок без записи текста песен и приватного аудио;
- release checklist и rollback.

Выходной контроль:

- приложение устанавливается как PWA там, где поддерживается;
- logout очищает чувствительный client state;
- beta users проходят ключевые сценарии;
- критические ошибки и latency видимы команде.

## Этап 10. Опциональная публичная платформа — отдельный проектный поток

Только после устойчивой private studio.

До разработки провести интервью/beta experiment и зафиксировать критерии go/no-go. Если ценность не подтверждена, не строить социальную платформу «по инерции».

Сначала продуктовые решения:

- что именно можно публиковать: project, track или конкретную version;
- draft/private/unlisted/public;
- кто владеет правами на совместную работу;
- можно ли скачивать аудио;
- moderation/report/block;
- авторские права и takedown;
- что считается play;
- нужны ли likes/follows/comments отдельно от рабочих комментариев.

Затем backend:

- visibility/publication models;
- public profile;
- discovery/search API;
- reactions/follows/play events;
- moderation;
- pagination/ranking;
- abuse protection.

Только затем UI по мотивам публичной части макетов.

## 8. Стратегия тестирования

### Unit

- permissions mapping;
- draft/version state;
- route builders;
- player time/loop calculations;
- API error mapping.

### Component

- editor dirty/saved/error;
- player collapsed/expanded;
- comments sheet;
- project create/invite;
- loading/empty/read-only states.

### API integration

- auth/session expiry;
- project role enforcement;
- version creation;
- upload validation;
- notification read state;
- transaction/error cases.

### E2E

Минимальная матрица:

- phone 390×844;
- small phone 320×568;
- tablet portrait 768×1024;
- tablet landscape;
- desktop 1440×900.

Критические сценарии:

- login/logout/OAuth callback;
- direct link to track;
- create project/track/invite;
- edit text/save version/reload;
- comment/resolve;
- audio play/switch tab/switch version;
- upload failure and retry;
- session expiry;
- viewer read-only;
- notification deep link.

## 9. Работа с визуалом без спрайтов

На старте использовать:

- Lucide для функциональных иконок;
- CSS gradients и design tokens;
- реальные пользовательские cover URLs;
- deterministic fallback cover из project ID/title;
- initials/avatar fallback;
- системный или выбранный web font с ограниченным количеством начертаний.

Не использовать случайные AI-картинки как обязательную часть интерфейса: они маскируют отсутствие реального контента и увеличивают вес. Собственный art direction и набор assets можно добавить после стабилизации UX.

## 10. Процесс одной итерации

Для каждого небольшого feature slice:

1. Записать user story и non-goals.
2. Проверить существующий API и права.
3. Описать states: loading, empty, success, error, read-only.
4. Добавить/обновить тест.
5. Реализовать минимальный вертикальный flow.
6. Проверить phone, tablet и desktop.
7. Измерить bundle/runtime, если затронут hot path.
8. Провести code review.
9. Выпустить в staging.
10. Пройти smoke checklist.
11. Только после этого брать зависимый этап.

## 11. Правило «шаг вперёд»

Команда всегда знает следующий этап, но не смешивает его с текущим.

Пример:

- во время shell проектируем место persistent player;
- сам player переносим только после стабилизации routes;
- во время private projects предусматриваем будущую visibility;
- schema публичности не добавляем, пока не определены права и moderation.

Так архитектура не закрывает будущие возможности, но код не обрастает преждевременными заглушками.

## 12. Общий Definition of Done

Продукт готов к широкой beta, когда:

- ключевые сценарии работают на phone/tablet/desktop;
- URL и Back не теряют контекст;
- права одинаково соблюдаются UI и backend;
- текстовый draft нельзя потерять молча;
- audio не обрывается внутри workspace;
- комментарии и уведомления ведут в точный контекст;
- clean install, migrations, lint, build, tests и E2E воспроизводимы;
- performance budgets измерены;
- ошибки наблюдаемы;
- backup и restore реально проверены;
- нет production-моков, пустых кнопок и декоративных функций;
- есть staging, release checklist и rollback.
