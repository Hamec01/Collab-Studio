import React, { useEffect, useRef, useState } from "react";
import { FolderPlus, Disc, Layers, Music, Users, Plus, Tag, ArrowRight, Trash2, UserPlus } from "lucide-react";
import { AuthUser, Project, Track } from "../types";
import { ApiError } from "../api/client";
import CoverImage from "../shared/ui/CoverImage";
import Avatar from "../shared/ui/Avatar";

interface ProjectListProps {
  projects: Project[];
  activeProject: Project | null;
  activeTrack: Track | null;
  onSelectProject: (p: Project) => void;
  onSelectTrack: (t: Track) => void;
  onCreateProject: (title: string, type: 'single' | 'album', tags: string[], coverUrl?: string) => void;
  onAddTrack: (projectId: string, title: string) => void;
  onAddMember: (projectId: string, payload: { login: string; role: "viewer" | "editor" }) => Promise<void>;
  onUpdateMemberRole: (projectId: string, userId: string, role: "viewer" | "editor") => Promise<void>;
  onRemoveMember: (projectId: string, userId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => void;
  currentUser: AuthUser | null;
}

export default function ProjectList({
  projects,
  activeProject,
  activeTrack,
  onSelectProject,
  onSelectTrack,
  onCreateProject,
  onAddTrack,
  onAddMember,
  onUpdateMemberRole,
  onRemoveMember,
  onDeleteProject,
  currentUser,
}: ProjectListProps) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<'single' | 'album'>("single");
  const [newTags, setNewTags] = useState("");
  const [newCover, setNewCover] = useState("");

  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [memberActionLoadingKey, setMemberActionLoadingKey] = useState<string | null>(null);
  const inviteInputRef = useRef<HTMLInputElement | null>(null);

  const canInvite = !!(
    activeProject && currentUser &&
    activeProject.participants.some((p) => p.userId === currentUser.id && p.role === "owner")
  );

  const ownedProjects = projects.filter((project) => project.currentUserRole === "owner");
  const sharedProjects = projects.filter((project) => project.currentUserRole === "viewer" || project.currentUserRole === "editor");
  const recentProjects = [...projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 5);

  const resetInviteState = () => {
    setShowInviteModal(false);
    setInviteLogin("");
    setInviteRole("viewer");
    setInviteError("");
    setInviteLoading(false);
  };

  useEffect(() => {
    resetInviteState();
  }, [activeProject?.id, currentUser?.id]);

  useEffect(() => {
    if (!showInviteModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resetInviteState();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showInviteModal]);

  useEffect(() => {
    if (showInviteModal) {
      inviteInputRef.current?.focus();
    }
  }, [showInviteModal]);

  const mapInviteError = (error: unknown) => {
    if (!(error instanceof ApiError)) return "Сервер недоступен.";
    if (error.status === 400) return "Проверьте введённые данные.";
    if (error.status === 403) return "У вас нет прав добавлять участников.";
    if (error.status === 404) return "Пользователь с таким логином или email не найден.";
    if (error.status === 409) return "Этот пользователь уже участвует в проекте.";
    if (error.status === 429) return "Слишком много попыток. Повторите позже.";
    if (error.status === 0) return "Сервер недоступен.";
    return "Не удалось добавить участника.";
  };

  const mapMemberActionError = (error: unknown) => {
    if (!(error instanceof ApiError)) return "Сервер недоступен.";
    if (error.status === 403) return "У вас нет прав изменять участников.";
    if (error.status === 404) return "Участник не найден.";
    if (error.status === 409) return "Операция недоступна для владельца проекта.";
    if (error.status === 429) return "Слишком много попыток. Повторите позже.";
    if (error.status === 0) return "Сервер недоступен.";
    return "Не удалось изменить участника.";
  };

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeProject || !canInvite || inviteLoading) return;
    const login = inviteLogin.trim();
    if (!login) return;
    setInviteError("");
    setInviteLoading(true);
    try {
      await onAddMember(activeProject.id, { login, role: inviteRole });
      resetInviteState();
    } catch (error) {
      setInviteError(mapInviteError(error));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleChangeMemberRole = async (userId: string, role: "viewer" | "editor") => {
    if (!activeProject || memberActionLoadingKey) return;
    setInviteError("");
    setMemberActionLoadingKey(`role:${userId}`);
    try {
      await onUpdateMemberRole(activeProject.id, userId, role);
    } catch (error) {
      setInviteError(mapMemberActionError(error));
    } finally {
      setMemberActionLoadingKey(null);
    }
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!activeProject || memberActionLoadingKey) return;
    if (!confirm(`Удалить участника \"${displayName}\" из проекта?`)) return;
    setInviteError("");
    setMemberActionLoadingKey(`remove:${userId}`);
    try {
      await onRemoveMember(activeProject.id, userId);
    } catch (error) {
      setInviteError(mapMemberActionError(error));
    } finally {
      setMemberActionLoadingKey(null);
    }
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const tagsArr = newTags.split(",").map((t) => t.trim()).filter(Boolean);
    onCreateProject(newTitle.trim(), newType, tagsArr, newCover.trim() || undefined);
    setNewTitle("");
    setNewTags("");
    setNewCover("");
    setShowAddProject(false);
  };

  const handleCreateTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackTitle.trim() || !activeProject) return;
    onAddTrack(activeProject.id, newTrackTitle.trim());
    setNewTrackTitle("");
    setShowAddTrack(false);
  };

  const roleLabel = (role: "owner" | "editor" | "viewer") => {
    if (role === "owner") return "Владелец";
    if (role === "editor") return "Редактор";
    return "Зритель";
  };

  const renderProjectCard = (proj: Project) => {
    const isSelected = activeProject?.id === proj.id;
    const myRole = proj.currentUserRole ?? (currentUser ? proj.participants.find((p) => p.userId === currentUser.id)?.role ?? null : null);
    const canManageMembers = myRole === "owner";
    const canEditProject = myRole === "owner" || myRole === "editor";

    return (
      <div
        key={proj.id}
        className={`rounded-xl border transition-all text-left overflow-hidden ${
          isSelected
            ? "bg-neutral-900/40 border-indigo-500/50"
            : "bg-neutral-900/10 border-neutral-900 hover:border-neutral-800"
        }`}
      >
        <div
          onClick={() => onSelectProject(proj)}
          className="p-3 flex items-start gap-3 cursor-pointer select-none relative"
        >
          <CoverImage src={proj.coverUrl} title={proj.title} className="shrink-0" />

          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5">
              {proj.type === "album" ? (
                <Layers className="w-3.5 h-3.5 text-teal-400 shrink-0" title="Альбом" />
              ) : (
                <Disc className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-spin-slow" title="Сингл" />
              )}
              <h4 className="font-semibold text-white text-xs truncate leading-snug">{proj.title}</h4>
            </div>

            <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-neutral-500" />
                {proj.participants.length} уч.
              </span>
              <span>•</span>
              <span>{proj.tracks.length} трек.</span>
              {myRole && (
                <>
                  <span>•</span>
                  <span>{roleLabel(myRole)}</span>
                </>
              )}
            </div>

            {proj.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {proj.tags.map((tg, i) => (
                  <span
                    key={i}
                    className="text-[8px] font-mono bg-neutral-900 border border-neutral-850 px-1 py-0.2 rounded text-neutral-400"
                  >
                    {tg}
                  </span>
                ))}
              </div>
            )}
          </div>

          {canManageMembers && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Вы уверены, что хотите удалить проект "${proj.title}"?`)) {
                  onDeleteProject(proj.id);
                }
              }}
              className="absolute right-2 top-2 p-1 text-neutral-500 hover:text-red-400 hover:bg-neutral-800/40 rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100 sm:opacity-100"
              title="Удалить проект"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isSelected && (
          <div className="bg-neutral-950/60 border-t border-neutral-900 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1 px-1">
              <span>ТРЕКИ В ПРОЕКТЕ:</span>
              {canEditProject ? (
                <button
                  onClick={() => setShowAddTrack(!showAddTrack)}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                  Добавить трек
                </button>
              ) : (
                <span className="text-neutral-500">Только чтение</span>
              )}
            </div>

            {showAddTrack && canEditProject && (
              <form onSubmit={handleCreateTrack} className="flex gap-1.5 p-1">
                <input
                  type="text"
                  required
                  value={newTrackTitle}
                  onChange={(e) => setNewTrackTitle(e.target.value)}
                  placeholder="Название трека..."
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded p-1 text-[10px] text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-1 px-2 rounded text-[10px] font-medium"
                >
                  ОК
                </button>
              </form>
            )}

            <div className="space-y-1">
              {proj.tracks.map((track) => {
                const isTrackActive = activeTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectTrack(track)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      isTrackActive
                        ? "bg-indigo-950/40 border border-indigo-900/30 text-white font-medium"
                        : "bg-neutral-900/30 hover:bg-neutral-900 text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] truncate pr-2">
                      <Music className="w-3 h-3 text-neutral-400" />
                      <span className="truncate">{track.title}</span>
                    </div>
                    <ArrowRight className={`w-3 h-3 text-neutral-600 ${isTrackActive ? "text-indigo-400" : ""}`} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col h-full space-y-4">
      {/* List Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
        <div className="text-left">
          <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ПРОЕКТЫ (СИНГЛЫ / АЛЬБОМЫ)</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Выберите папку проекта или трек для работы</p>
        </div>
        <button
          onClick={() => setShowAddProject(!showAddProject)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Создать
        </button>
      </div>

      {/* Add Project Form */}
      {showAddProject && (
        <form onSubmit={handleCreateProject} className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-xs space-y-2.5">
          <div className="text-left">
            <label className="block text-[10px] font-mono text-neutral-400 mb-1">НАЗВАНИЕ ПРОЕКТА</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Например: Ночной Экспресс"
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">ФОРМАТ</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "single" | "album")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="single">Сингл (Один трек)</option>
                <option value="album">Альбом (Плейлист)</option>
              </select>
            </div>
            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">ТЕГИ (через запятую)</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Поп, Акустика, 2026"
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="text-left">
            <label className="block text-[10px] font-mono text-neutral-400 mb-1">ОБЛОЖКА (Ссылка на картинку, необязательно)</label>
            <input
              type="text"
              value={newCover}
              onChange={(e) => setNewCover(e.target.value)}
              placeholder="https://..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowAddProject(false)}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
            >
              Создать проект
            </button>
          </div>
        </form>
      )}

      {/* Projects Cards List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[500px]">
        {projects.length === 0 ? (
          <div className="text-center p-6 text-neutral-400 text-xs space-y-3">
            <p>У вас пока нет проектов</p>
            <button
              onClick={() => setShowAddProject(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
            >
              Создать первый проект
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Мои проекты</div>
              {ownedProjects.length === 0 ? (
                <div className="text-[11px] text-neutral-500 p-2 rounded border border-neutral-900 bg-neutral-900/20">Пока нет проектов, где вы владелец.</div>
              ) : (
                ownedProjects.map(renderProjectCard)
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Доступные мне</div>
              {sharedProjects.length === 0 ? (
                <div className="text-[11px] text-neutral-500 p-2 rounded border border-neutral-900 bg-neutral-900/20">Приглашений пока нет.</div>
              ) : (
                sharedProjects.map(renderProjectCard)
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Последние</div>
              <div className="space-y-1.5">
                {recentProjects.map((project) => (
                  <button
                    key={`recent-${project.id}`}
                    type="button"
                    onClick={() => onSelectProject(project)}
                    className="w-full text-left p-2 rounded-lg bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-900"
                  >
                    <div className="text-[11px] text-white truncate">{project.title}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">{new Date(project.updatedAt).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Participants List */}
      {activeProject && (
        <div className="bg-neutral-900/30 border border-neutral-900 p-3 rounded-xl text-left text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono text-neutral-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              ДОСТУП И УЧАСТНИКИ ({activeProject.participants.length})
            </div>
            {canInvite ? (
              <button
                onClick={() => {
                  setInviteError("");
                  setShowInviteModal(true);
                }}
                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
                title="Добавить существующего пользователя в проект"
              >
                <UserPlus className="w-3 h-3" />
                <span>Пригласить</span>
              </button>
            ) : (
              <span className="text-[10px] text-neutral-500">Только владелец может приглашать</span>
            )}
          </div>
          {inviteError && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded p-2 text-left">
              {inviteError}
            </div>
          )}
          <div className="space-y-2">
            {activeProject.participants.map((part) => (
              <div key={part.userId} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-neutral-900/40">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar src={part.avatarUrl} name={part.displayName} size="sm" />
                  <span className="text-[11px] font-medium text-white truncate">{part.displayName}</span>
                </div>
                {canInvite && part.role !== "owner" ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={part.role}
                      onChange={(event) => handleChangeMemberRole(part.userId, event.target.value as "viewer" | "editor")}
                      disabled={memberActionLoadingKey !== null}
                      className="text-[9px] font-mono text-neutral-300 bg-neutral-800 border border-neutral-700 p-0.5 px-1.5 rounded focus:outline-none"
                    >
                      <option value="viewer">Зритель</option>
                      <option value="editor">Редактор</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(part.userId, part.displayName)}
                      disabled={memberActionLoadingKey !== null}
                      className="text-[9px] text-red-400 bg-red-950/40 border border-red-900/40 p-0.5 px-1.5 rounded disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] font-mono text-neutral-400 bg-neutral-800 border border-neutral-750 p-0.5 px-1.5 rounded">
                    {roleLabel(part.role)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInviteModal && activeProject && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => resetInviteState()}
        >
          <form
            onSubmit={handleInviteSubmit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-4"
          >
            <div className="text-left">
              <h4 className="text-sm font-semibold text-white">Добавить участника</h4>
              <p className="text-[11px] text-neutral-400 mt-1">Укажите точный username или email существующего пользователя.</p>
            </div>

            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">USERNAME ИЛИ EMAIL</label>
              <input
                ref={inviteInputRef}
                type="text"
                value={inviteLogin}
                onChange={(event) => setInviteLogin(event.target.value)}
                placeholder="username или email"
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">РОЛЬ</label>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "viewer" | "editor")}
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>

            {inviteError && (
              <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded p-2 text-left">
                {inviteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resetInviteState()}
                disabled={inviteLoading}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={inviteLoading || !inviteLogin.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium disabled:opacity-60"
              >
                {inviteLoading ? "Добавляем..." : "Добавить участника"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
