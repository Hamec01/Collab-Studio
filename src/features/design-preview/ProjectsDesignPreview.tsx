import React, { useMemo, useState } from "react";
import SpriteIcon, { type SpriteIconName } from "../../shared/ui/SpriteIcon";
import "./projects-design-preview.css";

type ProjectPreview = {
  id: string;
  title: string;
  tracks: number;
  collaborators: number;
  updated: string;
  accent: string;
  accentSecondary: string;
  isShared?: boolean;
  archived?: boolean;
};

type FilterKey = "all" | "mine" | "shared" | "archived";
type LayoutMode = "grid" | "list";
type MobileSection = "projects" | "tracks" | "tasks";

const PROJECTS: ProjectPreview[] = [
  {
    id: "midnight-drive",
    title: "Midnight Drive",
    tracks: 12,
    collaborators: 3,
    updated: "2 часа назад",
    accent: "#4338ca",
    accentSecondary: "#db2777",
  },
  {
    id: "neon-lights",
    title: "Neon Lights",
    tracks: 8,
    collaborators: 2,
    updated: "5 часов назад",
    accent: "#7c3aed",
    accentSecondary: "#ec4899",
    isShared: true,
  },
  {
    id: "ocean-eyes",
    title: "Ocean Eyes",
    tracks: 10,
    collaborators: 4,
    updated: "1 день назад",
    accent: "#0e7490",
    accentSecondary: "#38bdf8",
    isShared: true,
  },
  {
    id: "skyline-ep",
    title: "Skyline EP",
    tracks: 7,
    collaborators: 3,
    updated: "2 дня назад",
    accent: "#312e81",
    accentSecondary: "#f97316",
  },
  {
    id: "summer-vibes",
    title: "Summer Vibes",
    tracks: 9,
    collaborators: 2,
    updated: "3 дня назад",
    accent: "#9a3412",
    accentSecondary: "#f472b6",
  },
  {
    id: "night-sessions",
    title: "Night Sessions",
    tracks: 11,
    collaborators: 4,
    updated: "4 дня назад",
    accent: "#4c1d95",
    accentSecondary: "#2563eb",
  },
  {
    id: "archive-demo",
    title: "Archive Demo",
    tracks: 4,
    collaborators: 1,
    updated: "3 недели назад",
    accent: "#3f3f46",
    accentSecondary: "#71717a",
    archived: true,
  },
];

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Все" },
  { key: "mine", label: "Мои" },
  { key: "shared", label: "Общие" },
  { key: "archived", label: "Архив" },
];

const NAVIGATION: Array<{ label: string; icon: SpriteIconName; active?: boolean; badge?: string }> = [
  { label: "Главная", icon: "home" },
  { label: "Studio", icon: "wave", active: true },
  { label: "Сообщения", icon: "chats", badge: "12" },
  { label: "Релизы", icon: "musicUpload" },
  { label: "Уведомления", icon: "bell" },
];

const ACTIVITY = [
  { title: "Liam загрузил Vocal Take 3", meta: "Neon Lights · 2 часа назад", initials: "LC" },
  { title: "Lisa добавила комментарий", meta: "Ocean Eyes · 4 часа назад", initials: "LM" },
  { title: "Max утвердил мастер", meta: "Midnight Drive · 6 часов назад", initials: "MK" },
  { title: "Anna присоединилась к проекту", meta: "Skyline EP · вчера", initials: "AS" },
];

const TASKS = [
  { title: "Свести вокал", project: "Neon Lights", priority: "Высокий", tone: "high" },
  { title: "Подготовить мастер", project: "Skyline EP", priority: "Средний", tone: "medium" },
  { title: "Проверить правки", project: "Ocean Eyes", priority: "Низкий", tone: "low" },
];

function IconButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: SpriteIconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`cs-preview-icon-button${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <SpriteIcon name={icon} size={19} />
    </button>
  );
}

function AvatarStack({ count }: { count: number }) {
  const visible = Math.min(count, 3);
  return (
    <div className="cs-preview-avatar-stack" aria-label={`${count} участников`}>
      {Array.from({ length: visible }, (_, index) => (
        <span key={index} className={`cs-preview-avatar avatar-${index + 1}`}>
          {String.fromCharCode(65 + index)}
        </span>
      ))}
      {count > visible && <span className="cs-preview-avatar avatar-more">+{count - visible}</span>}
    </div>
  );
}

function ProjectCover({ project, compact = false }: { project: ProjectPreview; compact?: boolean }) {
  const style = {
    "--project-accent": project.accent,
    "--project-accent-secondary": project.accentSecondary,
  } as React.CSSProperties;

  return (
    <div className={`cs-preview-project-cover${compact ? " is-compact" : ""}`} style={style} aria-hidden="true">
      <span className="cs-preview-project-cover__grid" />
      <span className="cs-preview-project-cover__glow" />
      <span className="cs-preview-project-cover__wave wave-a" />
      <span className="cs-preview-project-cover__wave wave-b" />
      <span className="cs-preview-project-cover__wave wave-c" />
    </div>
  );
}

function ProjectCard({
  project,
  layout,
  selected,
  onSelect,
}: {
  key?: React.Key;
  project: ProjectPreview;
  layout: LayoutMode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`cs-preview-project-card is-${layout}${selected ? " is-selected" : ""}`}>
      <button type="button" className="cs-preview-project-card__hit" onClick={onSelect} aria-label={`Открыть проект ${project.title}`}>
        <ProjectCover project={project} compact={layout === "list"} />
        <div className="cs-preview-project-card__body">
          <div className="cs-preview-project-card__title-row">
            <h3>{project.title}</h3>
            {project.isShared && <span className="cs-preview-project-card__shared">Общий</span>}
          </div>
          <p>{project.tracks} треков · {project.collaborators} участника</p>
          <div className="cs-preview-project-card__meta">
            <AvatarStack count={project.collaborators} />
            <span>Обновлён {project.updated}</span>
          </div>
        </div>
      </button>
      <button type="button" className="cs-preview-project-card__menu" aria-label={`Меню проекта ${project.title}`}>
        <span />
        <span />
        <span />
      </button>
    </article>
  );
}

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`cs-preview-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="cs-preview-brand">
        <div className="cs-preview-brand__mark">CS</div>
        <div className="cs-preview-brand__text">
          <strong>CollabStudio</strong>
          <span>Creative workspace</span>
        </div>
      </div>

      <nav className="cs-preview-sidebar__nav" aria-label="Основная навигация">
        {NAVIGATION.map((item) => (
          <button key={item.label} type="button" className={`cs-preview-nav-item${item.active ? " is-active" : ""}`}>
            <span className="cs-preview-nav-item__icon"><SpriteIcon name={item.icon} size={19} /></span>
            <span className="cs-preview-nav-item__label">{item.label}</span>
            {item.badge && <span className="cs-preview-nav-item__badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="cs-preview-sidebar__section">
        <div className="cs-preview-sidebar__section-title">
          <span>Ваши проекты</span>
          <button type="button" aria-label="Создать проект">+</button>
        </div>
        <div className="cs-preview-sidebar__projects">
          {PROJECTS.slice(0, 4).map((project, index) => (
            <button key={project.id} type="button" className={`cs-preview-sidebar-project${index === 0 ? " is-active" : ""}`}>
              <ProjectCover project={project} compact />
              <span>{project.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cs-preview-sidebar__footer">
        <button type="button" className="cs-preview-user-card">
          <span className="cs-preview-user-card__avatar">AS</span>
          <span className="cs-preview-user-card__text">
            <strong>Andrei Sakki</strong>
            <small>Открыть профиль</small>
          </span>
          <span className="cs-preview-user-card__chevron">⌄</span>
        </button>
        <button type="button" className="cs-preview-sidebar__collapse" onClick={onToggle} aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}>
          <SpriteIcon name="menu" size={18} />
          <span>{collapsed ? "" : "Свернуть меню"}</span>
        </button>
      </div>
    </aside>
  );
}

function ContextPanel() {
  return (
    <aside className="cs-preview-context">
      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Команда</span>
            <h2>Сейчас онлайн</h2>
          </div>
          <button type="button">Все</button>
        </header>
        <div className="cs-preview-online-list">
          {["Lisa M.", "Max K.", "John D.", "Anna S."].map((name, index) => (
            <div key={name} className="cs-preview-online-person">
              <span className={`cs-preview-online-person__avatar avatar-${(index % 3) + 1}`}>{name.slice(0, 1)}</span>
              <span>
                <strong>{name}</strong>
                <small>{index === 0 ? "Редактирует текст" : index === 1 ? "Сводит трек" : "В проекте"}</small>
              </span>
              <i />
            </div>
          ))}
        </div>
      </section>

      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Активность</span>
            <h2>Последние события</h2>
          </div>
          <button type="button">Все</button>
        </header>
        <div className="cs-preview-activity-list">
          {ACTIVITY.map((item, index) => (
            <button type="button" key={item.title} className="cs-preview-activity-item">
              <span className={`cs-preview-activity-item__avatar avatar-${(index % 3) + 1}`}>{item.initials}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Сегодня</span>
            <h2>Мои задачи</h2>
          </div>
          <button type="button">Все</button>
        </header>
        <div className="cs-preview-task-list">
          {TASKS.map((task) => (
            <button type="button" key={task.title} className="cs-preview-task-item">
              <span className="cs-preview-task-item__check"><SpriteIcon name="doc" size={15} /></span>
              <span>
                <strong>{task.title}</strong>
                <small>{task.project}</small>
              </span>
              <em className={`tone-${task.tone}`}>{task.priority}</em>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function StudioPlayer({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <footer className="cs-preview-player">
      <div className="cs-preview-player__track">
        <ProjectCover project={PROJECTS[1]} compact />
        <span>
          <strong>Neon Lights</strong>
          <small>Liam Carter · Vocal Take 3</small>
        </span>
        <IconButton icon="heart" label="Добавить в избранное" />
      </div>

      <div className="cs-preview-player__controls">
        <IconButton icon="undo" label="Предыдущий трек" />
        <button type="button" className="cs-preview-player__play" onClick={onToggle} aria-label={playing ? "Пауза" : "Воспроизвести"}>
          <SpriteIcon name={playing ? "pause" : "play"} size={24} />
        </button>
        <IconButton icon="share" label="Следующий трек" />
      </div>

      <div className="cs-preview-player__timeline">
        <span>1:24</span>
        <div className="cs-preview-waveform" aria-label="Прогресс воспроизведения">
          {Array.from({ length: 42 }, (_, index) => (
            <i key={index} className={index < 18 ? "is-played" : ""} style={{ height: `${8 + ((index * 13) % 24)}px` }} />
          ))}
        </div>
        <span>3:48</span>
      </div>

      <div className="cs-preview-player__extras">
        <IconButton icon="headphones" label="Устройство вывода" />
        <IconButton icon="menu" label="Очередь" />
      </div>
    </footer>
  );
}

function MobileNavigation({ activeSection, onChange }: { activeSection: MobileSection; onChange: (section: MobileSection) => void }) {
  return (
    <nav className="cs-preview-mobile-nav" aria-label="Мобильная навигация">
      <button type="button"><SpriteIcon name="home" size={20} /><span>Главная</span></button>
      <button type="button" className={activeSection === "projects" ? "is-active" : ""} onClick={() => onChange("projects")}><SpriteIcon name="folders" size={20} /><span>Studio</span></button>
      <button type="button" className="cs-preview-mobile-nav__create"><span>+</span><small>Добавить</small></button>
      <button type="button"><SpriteIcon name="chats" size={20} /><span>Сообщения</span><i>12</i></button>
      <button type="button"><SpriteIcon name="user" size={20} /><span>Профиль</span></button>
    </nav>
  );
}

export default function ProjectsDesignPreview() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECTS[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [mobileSection, setMobileSection] = useState<MobileSection>("projects");

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return PROJECTS.filter((project) => {
      const matchesQuery = !normalized || project.title.toLocaleLowerCase("ru").includes(normalized);
      const matchesFilter = filter === "all"
        || (filter === "mine" && !project.isShared && !project.archived)
        || (filter === "shared" && project.isShared)
        || (filter === "archived" && project.archived);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query]);

  return (
    <div className="cs-preview">
      <div className={`cs-preview-shell${sidebarCollapsed ? " has-collapsed-sidebar" : ""}`}>
        <DesktopSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />

        <div className="cs-preview-workspace">
          <header className="cs-preview-topbar">
            <div className="cs-preview-mobile-brand">
              <button type="button" aria-label="Открыть меню"><SpriteIcon name="menu" size={20} /></button>
              <strong>Studio</strong>
            </div>

            <label className="cs-preview-global-search">
              <SpriteIcon name="search" size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск проектов, треков и участников…" />
              <kbd>⌘ K</kbd>
            </label>

            <div className="cs-preview-topbar__actions">
              <IconButton icon="bell" label="Уведомления" />
              <IconButton icon="chats" label="Сообщения" />
              <button type="button" className="cs-preview-topbar__profile" aria-label="Открыть профиль">AS</button>
            </div>
          </header>

          <main className="cs-preview-main">
            <section className="cs-preview-page-heading">
              <div>
                <span className="cs-preview-eyebrow">Studio workspace</span>
                <h1>Проекты</h1>
                <p>Все музыкальные проекты, участники и рабочие материалы в одном месте.</p>
              </div>
              <button type="button" className="cs-preview-primary-action"><span>+</span> Новый проект</button>
            </section>

            <div className="cs-preview-mobile-tabs" role="tablist" aria-label="Разделы Studio">
              {(["projects", "tracks", "tasks"] as MobileSection[]).map((section) => (
                <button key={section} type="button" className={mobileSection === section ? "is-active" : ""} onClick={() => setMobileSection(section)}>
                  {section === "projects" ? "Проекты" : section === "tracks" ? "Треки" : "Задачи"}
                </button>
              ))}
            </div>

            {mobileSection === "projects" ? (
              <>
                <section className="cs-preview-filters" aria-label="Фильтры проектов">
                  <div className="cs-preview-filter-tabs">
                    {FILTERS.map((item) => (
                      <button key={item.key} type="button" className={filter === item.key ? "is-active" : ""} onClick={() => setFilter(item.key)}>
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <label className="cs-preview-project-search">
                    <SpriteIcon name="search" size={16} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск проектов…" />
                  </label>

                  <div className="cs-preview-filter-actions">
                    <button type="button" className="cs-preview-select-button">Недавние <span>⌄</span></button>
                    <IconButton icon="folders" label="Сетка" active={layout === "grid"} onClick={() => setLayout("grid")} />
                    <IconButton icon="menu" label="Список" active={layout === "list"} onClick={() => setLayout("list")} />
                  </div>
                </section>

                <section className={`cs-preview-project-grid is-${layout}`} aria-live="polite">
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      layout={layout}
                      selected={selectedProjectId === project.id}
                      onSelect={() => setSelectedProjectId(project.id)}
                    />
                  ))}
                  <button type="button" className={`cs-preview-create-card is-${layout}`}>
                    <span>+</span>
                    <strong>Новый проект</strong>
                    <small>Создать рабочее пространство</small>
                  </button>
                </section>

                {filteredProjects.length === 0 && (
                  <section className="cs-preview-empty-state">
                    <SpriteIcon name="search" size={42} />
                    <h2>Проекты не найдены</h2>
                    <p>Измени запрос или выбери другой фильтр.</p>
                    <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Сбросить фильтры</button>
                  </section>
                )}
              </>
            ) : (
              <section className="cs-preview-mobile-placeholder">
                <SpriteIcon name={mobileSection === "tracks" ? "wave" : "doc"} size={52} />
                <h2>{mobileSection === "tracks" ? "Треки" : "Задачи"}</h2>
                <p>Этот переключатель уже работает. Следующим этапом сюда подключаются реальные данные CollabStudio.</p>
                <button type="button" onClick={() => setMobileSection("projects")}>Вернуться к проектам</button>
              </section>
            )}
          </main>
        </div>

        <ContextPanel />
        <StudioPlayer playing={playing} onToggle={() => setPlaying((value) => !value)} />
        <MobileNavigation activeSection={mobileSection} onChange={setMobileSection} />
      </div>
    </div>
  );
}
