import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { createProject } from "../../api/projects";
import { useAuth } from "../../app/auth/AuthProvider";
import { buildPrivatePath } from "../../app/routeContract";
import { useWorkspaceQuery } from "../../app/state/useWorkspaceQuery";
import { buildWorkspaceActivity, resolveActivityTarget } from "../notifications/workspaceInbox";
import type { Project, Task } from "../../types";
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
  role: "owner" | "editor" | "viewer" | null;
  trackId: string | null;
  isShared?: boolean;
  archived?: boolean;
};

type FilterKey = "all" | "mine" | "shared" | "archived";
type LayoutMode = "grid" | "list";
type MobileSection = "projects" | "tracks" | "tasks";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Все" },
  { key: "mine", label: "Мои" },
  { key: "shared", label: "Общие" },
  { key: "archived", label: "Архив" },
];

const PROJECT_COLORS: Array<{ accent: string; accentSecondary: string }> = [
  { accent: "#4338ca", accentSecondary: "#db2777" },
  { accent: "#0e7490", accentSecondary: "#38bdf8" },
  { accent: "#9a3412", accentSecondary: "#f472b6" },
  { accent: "#312e81", accentSecondary: "#f97316" },
  { accent: "#14532d", accentSecondary: "#22c55e" },
  { accent: "#3f3f46", accentSecondary: "#71717a" },
];

function initialLetters(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function humanRelative(isoDate: string) {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return "только что";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSeconds < 60) return "только что";
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)} мин назад`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)} ч назад`;
  if (deltaSeconds < 86400 * 7) return `${Math.floor(deltaSeconds / 86400)} д назад`;
  return `${Math.floor(deltaSeconds / (86400 * 7))} нед назад`;
}

function hashToColor(projectId: string) {
  let acc = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    acc = (acc * 33 + projectId.charCodeAt(index)) >>> 0;
  }
  return PROJECT_COLORS[acc % PROJECT_COLORS.length];
}

function normalizeProjects(projects: Project[]): ProjectPreview[] {
  return projects.map((project) => {
    const palette = hashToColor(project.id);
    return {
      id: project.id,
      title: project.title,
      tracks: project.tracks.length,
      collaborators: project.participants.length,
      updated: humanRelative(project.updatedAt),
      accent: palette.accent,
      accentSecondary: palette.accentSecondary,
      role: project.currentUserRole,
      trackId: project.tracks[0]?.id ?? null,
      isShared: project.currentUserRole === "editor" || project.currentUserRole === "viewer",
    };
  });
}

function mapCreateError(error: unknown) {
  if (!(error instanceof ApiError)) return "Не удалось создать проект.";
  if (error.code === "EMAIL_VERIFICATION_REQUIRED") return "Подтвердите email для создания проекта.";
  if (error.code === "AGE_ACKNOWLEDGEMENT_REQUIRED") return "Подтвердите 18+, чтобы создавать проекты.";
  if (error.status === 429) return "Слишком много запросов. Попробуйте чуть позже.";
  if (error.status === 400) return "Проверьте название проекта.";
  return "Не удалось создать проект.";
}

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

function AvatarStack({ names }: { names: string[] }) {
  const visible = Math.min(names.length, 3);
  return (
    <div className="cs-preview-avatar-stack" aria-label={`${names.length} участников`}>
      {Array.from({ length: visible }, (_, index) => (
        <span key={index} className={`cs-preview-avatar avatar-${index + 1}`}>
          {initialLetters(names[index] ?? "U").slice(0, 1)}
        </span>
      ))}
      {names.length > visible && <span className="cs-preview-avatar avatar-more">+{names.length - visible}</span>}
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
  key,
  project,
  collaborators,
  layout,
  selected,
  onSelect,
  onOpenStudio,
}: {
  key?: React.Key;
  project: ProjectPreview;
  collaborators: string[];
  layout: LayoutMode;
  selected: boolean;
  onSelect: () => void;
  onOpenStudio: () => void;
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
            <AvatarStack names={collaborators} />
            <span>Обновлён {project.updated}</span>
          </div>
        </div>
      </button>
      <button type="button" className="cs-preview-project-card__menu" aria-label={`Открыть проект ${project.title}`} onClick={onOpenStudio}>
        <span />
        <span />
        <span />
      </button>
    </article>
  );
}

function DesktopSidebar({
  collapsed,
  onToggle,
  currentPath,
  unreadCount,
  projects,
  selectedProjectId,
  onSelectProject,
  onNavigate,
  currentUserName,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  unreadCount: number;
  projects: ProjectPreview[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onNavigate: (path: string) => void;
  currentUserName: string;
}) {
  const navigation: Array<{ label: string; icon: SpriteIconName; path: string; badge?: string }> = [
    { label: "Главная", icon: "home", path: "/main" },
    { label: "Studio", icon: "wave", path: "/app" },
    { label: "Сообщения", icon: "chats", path: "/app/messages", badge: unreadCount > 0 ? String(unreadCount) : undefined },
    { label: "Релизы", icon: "musicUpload", path: "/app/publications" },
    { label: "Уведомления", icon: "bell", path: "/app" },
  ];

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
        {navigation.map((item) => {
          const isActive = item.path === "/app"
            ? currentPath === "/app" || currentPath.startsWith("/app/projects")
            : currentPath.startsWith(item.path);
          return (
          <button key={item.label} type="button" className={`cs-preview-nav-item${isActive ? " is-active" : ""}`} onClick={() => onNavigate(item.path)}>
            <span className="cs-preview-nav-item__icon"><SpriteIcon name={item.icon} size={19} /></span>
            <span className="cs-preview-nav-item__label">{item.label}</span>
            {item.badge && <span className="cs-preview-nav-item__badge">{item.badge}</span>}
          </button>
        );})}
      </nav>

      <div className="cs-preview-sidebar__section">
        <div className="cs-preview-sidebar__section-title">
          <span>Ваши проекты</span>
          <button type="button" aria-label="Создать проект" onClick={() => onNavigate("#create")}>+</button>
        </div>
        <div className="cs-preview-sidebar__projects">
          {projects.slice(0, 4).map((project) => (
            <button
              key={project.id}
              type="button"
              className={`cs-preview-sidebar-project${selectedProjectId === project.id ? " is-active" : ""}`}
              onClick={() => onSelectProject(project.id)}
            >
              <ProjectCover project={project} compact />
              <span>{project.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cs-preview-sidebar__footer">
        <button type="button" className="cs-preview-user-card" onClick={() => onNavigate("/app/profile")}>
          <span className="cs-preview-user-card__avatar">{initialLetters(currentUserName)}</span>
          <span className="cs-preview-user-card__text">
            <strong>{currentUserName}</strong>
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

function taskTone(task: Task) {
  if (task.status === "todo") return { tone: "high", title: "К выполнению" };
  if (task.status === "in-progress") return { tone: "medium", title: "В работе" };
  return { tone: "low", title: "Готово" };
}

function ContextPanel({
  activeProject,
  activity,
  onOpenActivity,
}: {
  activeProject: Project | null;
  activity: ReturnType<typeof buildWorkspaceActivity>;
  onOpenActivity: (href: string) => void;
}) {
  const onlineMembers = activeProject?.participants.slice(0, 4) ?? [];
  const projectActivity = activity.filter((item) => item.projectId === activeProject?.id).slice(0, 4);
  const projectTasks = (activeProject?.tasks ?? []).slice(0, 4);

  return (
    <aside className="cs-preview-context">
      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Команда</span>
            <h2>Сейчас онлайн</h2>
          </div>
          <button type="button">{onlineMembers.length}</button>
        </header>
        <div className="cs-preview-online-list">
          {onlineMembers.length > 0 ? onlineMembers.map((member, index) => (
            <div key={member.userId} className="cs-preview-online-person">
              <span className={`cs-preview-online-person__avatar avatar-${(index % 3) + 1}`}>{initialLetters(member.displayName).slice(0, 1)}</span>
              <span>
                <strong>{member.displayName}</strong>
                <small>{member.role === "owner" ? "Владелец" : member.role === "editor" ? "Редактор" : "Участник"}</small>
              </span>
              <i />
            </div>
          )) : (
            <div className="cs-preview-context-empty">Нет участников</div>
          )}
        </div>
      </section>

      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Активность</span>
            <h2>Последние события</h2>
          </div>
          <button type="button">{projectActivity.length}</button>
        </header>
        <div className="cs-preview-activity-list">
          {projectActivity.length > 0 ? projectActivity.map((item, index) => {
            const target = resolveActivityTarget(item);
            return (
            <button type="button" key={item.id} className="cs-preview-activity-item" onClick={() => onOpenActivity(target.href)}>
              <span className={`cs-preview-activity-item__avatar avatar-${(index % 3) + 1}`}>{initialLetters(item.actor?.displayName ?? "U")}</span>
              <span>
                <strong>{item.type.replaceAll("_", " ")}</strong>
                <small>{item.trackName ? `${item.trackName} · ${humanRelative(item.createdAt)}` : humanRelative(item.createdAt)}</small>
              </span>
            </button>
          );}) : (
            <div className="cs-preview-context-empty">Пока нет событий</div>
          )}
        </div>
      </section>

      <section className="cs-preview-context-card">
        <header>
          <div>
            <span className="cs-preview-eyebrow">Сегодня</span>
            <h2>Мои задачи</h2>
          </div>
          <button type="button">{projectTasks.length}</button>
        </header>
        <div className="cs-preview-task-list">
          {projectTasks.length > 0 ? projectTasks.map((task) => {
            const status = taskTone(task);
            return (
            <button type="button" key={task.id} className="cs-preview-task-item">
              <span className="cs-preview-task-item__check"><SpriteIcon name="doc" size={15} /></span>
              <span>
                <strong>{task.title}</strong>
                <small>{task.assignedToUser?.displayName ?? task.assignedTo ?? "Без исполнителя"}</small>
              </span>
              <em className={`tone-${status.tone}`}>{status.title}</em>
            </button>
          );}) : (
            <div className="cs-preview-context-empty">Нет задач</div>
          )}
        </div>
      </section>
    </aside>
  );
}

function StudioPlayer({
  playing,
  onToggle,
  activeProject,
  onOpenTrack,
}: {
  playing: boolean;
  onToggle: () => void;
  activeProject: Project | null;
  onOpenTrack: () => void;
}) {
  const currentTrack = activeProject?.tracks[0] ?? null;
  const visualProject = activeProject
    ? normalizeProjects([activeProject])[0]
    : {
        id: "empty",
        title: "Проект не выбран",
        tracks: 0,
        collaborators: 0,
        updated: "",
        accent: "#4338ca",
        accentSecondary: "#db2777",
        role: null,
        trackId: null,
      };

  return (
    <footer className="cs-preview-player">
      <div className="cs-preview-player__track">
        <ProjectCover project={visualProject} compact />
        <span>
          <strong>{activeProject?.title ?? "Выберите проект"}</strong>
          <small>{currentTrack?.title ?? "Откройте проект, чтобы продолжить"}</small>
        </span>
        <IconButton icon="heart" label="Открыть трек" onClick={onOpenTrack} />
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

function MobileNavigation({
  activeSection,
  unreadCount,
  onChange,
  onNavigate,
}: {
  activeSection: MobileSection;
  unreadCount: number;
  onChange: (section: MobileSection) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav className="cs-preview-mobile-nav" aria-label="Мобильная навигация">
      <button type="button" onClick={() => onNavigate("/main")}><SpriteIcon name="home" size={20} /><span>Главная</span></button>
      <button type="button" className={activeSection === "projects" ? "is-active" : ""} onClick={() => onChange("projects")}><SpriteIcon name="folders" size={20} /><span>Studio</span></button>
      <button type="button" className="cs-preview-mobile-nav__create"><span>+</span><small>Добавить</small></button>
      <button type="button" onClick={() => onNavigate("/app/messages")}><SpriteIcon name="chats" size={20} /><span>Сообщения</span>{unreadCount > 0 && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}</button>
      <button type="button" onClick={() => onNavigate("/app/profile")}><SpriteIcon name="user" size={20} /><span>Профиль</span></button>
    </nav>
  );
}

export default function ProjectsDesignPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authPhase, currentUser, withAuth } = useAuth();

  const {
    projects,
    notifications,
    workspaceReady,
    workspaceLoading,
    workspaceError,
    invalidateWorkspace,
  } = useWorkspaceQuery({
    authPhase,
    currentUserId: currentUser?.id ?? null,
    withAuth,
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [mobileSection, setMobileSection] = useState<MobileSection>("projects");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectType, setNewProjectType] = useState<"single" | "album">("single");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const projectCards = useMemo(() => normalizeProjects(projects), [projects]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);
  const workspaceActivity = useMemo(() => buildWorkspaceActivity(projects), [projects]);

  useEffect(() => {
    if (!selectedProjectId && projectCards.length > 0) {
      setSelectedProjectId(projectCards[0].id);
      return;
    }
    if (selectedProjectId && !projectCards.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectCards[0]?.id ?? null);
    }
  }, [projectCards, selectedProjectId]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return projectCards.filter((project) => {
      const matchesQuery = !normalized || project.title.toLocaleLowerCase("ru").includes(normalized);
      const matchesFilter = filter === "all"
        || (filter === "mine" && project.role === "owner")
        || (filter === "shared" && project.isShared)
        || (filter === "archived" && project.archived);
      return matchesQuery && matchesFilter;
    });
  }, [filter, projectCards, query]);

  const openProjectInStudio = (projectId: string, trackId: string | null) => {
    if (trackId) {
      navigate(buildPrivatePath({ projectId, trackId, tab: "lyrics" }));
      return;
    }
    navigate(buildPrivatePath({ projectId, trackId: null }));
  };

  const handleCreateProject = async () => {
    const title = newProjectTitle.trim();
    if (!title || createPending) return;
    setCreatePending(true);
    setCreateError("");
    try {
      const created = await withAuth(() => createProject({
        title,
        type: newProjectType,
        initialTrackTitle: newProjectType === "single" ? title : undefined,
      }));
      setShowCreateForm(false);
      setNewProjectTitle("");
      invalidateWorkspace();
      setSelectedProjectId(created.id);
    } catch (error) {
      setCreateError(mapCreateError(error));
    } finally {
      setCreatePending(false);
    }
  };

  if (authPhase === "loading" || (workspaceLoading && !workspaceReady)) {
    return (
      <div className="cs-preview">
        <div className="cs-preview-shell">
          <section className="cs-preview-mobile-placeholder">
            <SpriteIcon name="wave" size={42} />
            <h2>Загружаем рабочее пространство</h2>
            <p>Получаем проекты и статус сессии.</p>
          </section>
        </div>
      </div>
    );
  }

  if (authPhase === "unauthenticated" || !currentUser) {
    return (
      <div className="cs-preview">
        <div className="cs-preview-shell">
          <section className="cs-preview-mobile-placeholder">
            <SpriteIcon name="user" size={42} />
            <h2>Требуется вход</h2>
            <p>Новый Studio-дизайн использует реальные данные вашего аккаунта.</p>
            <button type="button" onClick={() => navigate("/login")}>Войти</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-preview">
      <div className={`cs-preview-shell${sidebarCollapsed ? " has-collapsed-sidebar" : ""}`}>
        <DesktopSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          currentPath={location.pathname}
          unreadCount={unreadCount}
          projects={projectCards}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          currentUserName={currentUser.displayName}
          onNavigate={(path) => {
            if (path === "#create") {
              setShowCreateForm(true);
              return;
            }
            navigate(path);
          }}
        />

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
              <IconButton icon="chats" label="Сообщения" onClick={() => navigate("/app/messages")} />
              <button type="button" className="cs-preview-topbar__profile" aria-label="Открыть профиль" onClick={() => navigate("/app/profile")}>{initialLetters(currentUser.displayName)}</button>
            </div>
          </header>

          <main className="cs-preview-main">
            <section className="cs-preview-page-heading">
              <div>
                <span className="cs-preview-eyebrow">Studio workspace</span>
                <h1>Проекты</h1>
                <p>Все музыкальные проекты, участники и рабочие материалы в одном месте.</p>
              </div>
              <button type="button" className="cs-preview-primary-action" onClick={() => setShowCreateForm((value) => !value)}><span>+</span> Новый проект</button>
            </section>

            {workspaceError && (
              <section className="cs-preview-empty-state">
                <SpriteIcon name="wrench" size={36} />
                <h2>Не удалось загрузить данные</h2>
                <p>{workspaceError}</p>
              </section>
            )}

            {showCreateForm && (
              <section className="cs-preview-inline-form">
                <div className="cs-preview-inline-form__row">
                  <input
                    value={newProjectTitle}
                    onChange={(event) => setNewProjectTitle(event.target.value)}
                    placeholder="Название нового проекта"
                    maxLength={80}
                    disabled={createPending}
                  />
                  <select value={newProjectType} onChange={(event) => setNewProjectType(event.target.value as "single" | "album")} disabled={createPending}>
                    <option value="single">Сингл</option>
                    <option value="album">Альбом</option>
                  </select>
                  <button type="button" onClick={handleCreateProject} disabled={createPending || !newProjectTitle.trim()}>
                    {createPending ? "Создание..." : "Создать"}
                  </button>
                </div>
                {createError && <p className="cs-preview-inline-form__error">{createError}</p>}
              </section>
            )}

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
                      collaborators={(projects.find((item) => item.id === project.id)?.participants ?? []).map((member) => member.displayName)}
                      layout={layout}
                      selected={selectedProjectId === project.id}
                      onSelect={() => setSelectedProjectId(project.id)}
                      onOpenStudio={() => openProjectInStudio(project.id, project.trackId)}
                    />
                  ))}
                  <button type="button" className={`cs-preview-create-card is-${layout}`} onClick={() => setShowCreateForm(true)}>
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
            ) : mobileSection === "tracks" ? (
              <section className="cs-preview-mobile-placeholder">
                <SpriteIcon name="wave" size={52} />
                <h2>Треки</h2>
                {activeProject?.tracks.length ? (
                  <div className="cs-preview-data-list">
                    {activeProject.tracks.slice(0, 8).map((track) => (
                      <button
                        type="button"
                        key={track.id}
                        className="cs-preview-data-list__item"
                        onClick={() => openProjectInStudio(activeProject.id, track.id)}
                      >
                        <span>{track.title}</span>
                        <small>Открыть lyrics</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>В проекте пока нет треков.</p>
                )}
                <button type="button" onClick={() => setMobileSection("projects")}>Вернуться к проектам</button>
              </section>
            ) : (
              <section className="cs-preview-mobile-placeholder">
                <SpriteIcon name="doc" size={52} />
                <h2>Задачи</h2>
                {activeProject?.tasks?.length ? (
                  <div className="cs-preview-data-list">
                    {activeProject.tasks.slice(0, 8).map((task) => (
                      <div key={task.id} className="cs-preview-data-list__item is-static">
                        <span>{task.title}</span>
                        <small>{taskTone(task).title}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>В проекте пока нет задач.</p>
                )}
                <button type="button" onClick={() => setMobileSection("projects")}>Вернуться к проектам</button>
              </section>
            )}
          </main>
        </div>

        <ContextPanel
          activeProject={activeProject}
          activity={workspaceActivity}
          onOpenActivity={(href) => navigate(href)}
        />
        <StudioPlayer
          playing={playing}
          onToggle={() => setPlaying((value) => !value)}
          activeProject={activeProject}
          onOpenTrack={() => {
            if (!activeProject?.id) return;
            openProjectInStudio(activeProject.id, activeProject.tracks[0]?.id ?? null);
          }}
        />
        <MobileNavigation
          activeSection={mobileSection}
          unreadCount={unreadCount}
          onChange={setMobileSection}
          onNavigate={(path) => navigate(path)}
        />
      </div>
    </div>
  );
}
