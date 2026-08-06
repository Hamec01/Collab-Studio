import React, { useEffect, useRef, useState } from "react";
import { FolderPlus, Disc, Layers, Music, Users, Plus, Tag, ArrowRight, Trash2, UserPlus, Link, Copy, Check, Edit2, Globe } from "lucide-react";
import { AuthUser, Project, Track } from "../types";
import { ApiError } from "../api/client";
import { createProjectInvite } from "../api/projects";
import CoverImage from "../shared/ui/CoverImage";
import Avatar from "../shared/ui/Avatar";

interface ProjectListProps {
  projects: Project[];
  activeProject: Project | null;
  activeTrack: Track | null;
  onSelectProject: (p: Project) => void;
  onSelectTrack: (t: Track) => void;
  onCreateProject: (title: string, type: 'single' | 'album', initialTrackTitle: string | undefined, tags: string[], coverUrl?: string) => Promise<void>;
  onAddTrack: (projectId: string, title: string) => Promise<void>;
  onUpdateTrack?: (projectId: string, trackId: string, payload: { title?: string; coverUrl?: string; tags?: string[] }) => Promise<void>;
  onReviewJoinRequest?: (
    projectId: string,
    requestId: string,
    payload: { action: "approve"; role: "viewer" | "editor" } | { action: "reject" },
  ) => Promise<void>;
  onToggleProjectPublic?: (projectId: string, options?: { allowDownload?: boolean }) => Promise<void>;
  projectPublicStatus?: Record<string, { isPublic: boolean; canPublish: boolean; pending: boolean }>;
  onAddMember: (projectId: string, payload: { login: string; role: "viewer" | "editor" }) => Promise<void>;
  onUpdateMemberRole: (projectId: string, userId: string, role: "viewer" | "editor") => Promise<void>;
  onRemoveMember: (projectId: string, userId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
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
  onUpdateTrack,
  onReviewJoinRequest,
  onToggleProjectPublic,
  projectPublicStatus,
  onAddMember,
  onUpdateMemberRole,
  onRemoveMember,
  onDeleteProject,
  currentUser,
}: ProjectListProps) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<'single' | 'album'>("single");
  const [newInitialTrackTitle, setNewInitialTrackTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newCover, setNewCover] = useState("");
  const [projectSubmitLoading, setProjectSubmitLoading] = useState(false);
  const [projectSubmitError, setProjectSubmitError] = useState("");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Track Edit
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTrackTitle, setEditTrackTitle] = useState("");
  const [editTrackCoverUrl, setEditTrackCoverUrl] = useState("");
  const [editTrackTags, setEditTrackTags] = useState("");
  const [editTrackLoading, setEditTrackLoading] = useState(false);
  const [editTrackError, setEditTrackError] = useState("");

  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [trackSubmitLoading, setTrackSubmitLoading] = useState(false);
  const [trackSubmitError, setTrackSubmitError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMode, setInviteMode] = useState<"direct" | "link">("direct");
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [memberActionLoadingKey, setMemberActionLoadingKey] = useState<string | null>(null);
  const [joinRequestLoadingId, setJoinRequestLoadingId] = useState<string | null>(null);
  const [joinRequestRoles, setJoinRequestRoles] = useState<Record<string, "viewer" | "editor">>({});
  const [quickPublishAllowDownload, setQuickPublishAllowDownload] = useState<Record<string, boolean>>({});
  const inviteInputRef = useRef<HTMLInputElement | null>(null);

  const canInvite = !!(
    activeProject && currentUser &&
    activeProject.participants.some((p) => p.userId === currentUser.id && p.role === "owner")
  );

  const filteredProjects = projects.filter((project) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const matchesTitle = project.title.toLowerCase().includes(query);
    const matchesTags = project.tags.some(tag => tag.toLowerCase().includes(query));
    return matchesTitle || matchesTags;
  });

  const ownedProjects = filteredProjects.filter((project) => project.currentUserRole === "owner");
  const sharedProjects = filteredProjects.filter((project) => project.currentUserRole === "viewer" || project.currentUserRole === "editor");
  const recentProjects = [...filteredProjects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 5);

  const resetInviteState = () => {
    setShowInviteModal(false);
    setInviteLogin("");
    setInviteRole("viewer");
    setInviteError("");
    setInviteLoading(false);
    setInviteMode("direct");
    setGeneratedLink("");
    setLinkCopied(false);
  };

  useEffect(() => {
    resetInviteState();
  }, [activeProject?.id, currentUser?.id]);

  useEffect(() => {
    setJoinRequestLoadingId(null);
    setJoinRequestRoles({});
  }, [activeProject?.id]);

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

  useEffect(() => {
    if (newType !== "single") {
      setNewInitialTrackTitle("");
      return;
    }
    setNewInitialTrackTitle((current) => (current.trim() ? current : newTitle));
  }, [newType, newTitle]);

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

  const mapProjectWriteError = (error: unknown) => {
    if (!(error instanceof ApiError)) return "Сервер недоступен.";
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") return "Подтвердите email, чтобы создавать проекты и треки.";
    if (error.code === "AGE_ACKNOWLEDGEMENT_REQUIRED") return "Подтвердите 18+, чтобы создавать проекты и треки.";
    if (error.status === 400) return "Проверьте заполнение формы.";
    if (error.status === 403) return "У вас нет прав на это действие.";
    if (error.status === 409) return "Операция конфликтует с текущим состоянием. Повторите попытку.";
    if (error.status === 429) return "Слишком много попыток. Повторите позже.";
    if (error.status === 0) return "Сервер недоступен.";
    return "Не удалось сохранить изменения.";
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

  const handleGenerateInviteLink = async () => {
    if (!activeProject || !canInvite || inviteLoading) return;
    setInviteError("");
    setInviteLoading(true);
    try {
      const response = await createProjectInvite(activeProject.id, { role: inviteRole });
      const token = response.invite.token;
      const link = `${window.location.origin}/app?inviteToken=${token}&projectId=${activeProject.id}`;
      setGeneratedLink(link);
    } catch (error) {
      setInviteError(mapInviteError(error));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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

  const resolveRequestedRole = (role: "owner" | "editor" | "viewer") => (role === "editor" ? "editor" : "viewer");

  const handleReviewJoinRequest = async (
    requestId: string,
    action: "approve" | "reject",
    fallbackRole: "viewer" | "editor",
  ) => {
    if (!activeProject || !onReviewJoinRequest || joinRequestLoadingId) return;
    setInviteError("");
    setJoinRequestLoadingId(requestId);
    try {
      if (action === "approve") {
        const selectedRole = joinRequestRoles[requestId] ?? fallbackRole;
        await onReviewJoinRequest(activeProject.id, requestId, { action: "approve", role: selectedRole });
      } else {
        await onReviewJoinRequest(activeProject.id, requestId, { action: "reject" });
      }
    } catch (error) {
      setInviteError(mapMemberActionError(error));
    } finally {
      setJoinRequestLoadingId(null);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || projectSubmitLoading) return;
    const tagsArr = newTags.split(",").map((t) => t.trim()).filter(Boolean);
    setProjectSubmitError("");
    setProjectSubmitLoading(true);
    try {
      await onCreateProject(
        newTitle.trim(),
        newType,
        newType === "single" ? (newInitialTrackTitle.trim() || newTitle.trim()) : undefined,
        tagsArr,
        newCover.trim() || undefined,
      );
      setNewTitle("");
      setNewInitialTrackTitle("");
      setNewTags("");
      setNewCover("");
      setShowAddProject(false);
    } catch (error) {
      setProjectSubmitError(mapProjectWriteError(error));
    } finally {
      setProjectSubmitLoading(false);
    }
  };

  const handleCreateTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackTitle.trim() || !activeProject || trackSubmitLoading) return;
    setTrackSubmitError("");
    setTrackSubmitLoading(true);
    try {
      await onAddTrack(activeProject.id, newTrackTitle.trim());
      setNewTrackTitle("");
      setShowAddTrack(false);
    } catch (error) {
      setTrackSubmitError(mapProjectWriteError(error));
    } finally {
      setTrackSubmitLoading(false);
    }
  };

  const handleEditTrackSubmit = async (event: React.FormEvent, projectId: string, trackId: string) => {
    event.preventDefault();
    if (!editTrackTitle.trim() || !onUpdateTrack || editTrackLoading) return;
    setEditTrackError("");
    setEditTrackLoading(true);
    try {
      const tagsArr = editTrackTags.split(",").map((t) => t.trim()).filter(Boolean);
      await onUpdateTrack(projectId, trackId, {
        title: editTrackTitle.trim(),
        coverUrl: editTrackCoverUrl.trim() || undefined,
        tags: tagsArr,
      });
      setEditingTrackId(null);
    } catch (error) {
      setEditTrackError(mapProjectWriteError(error));
    } finally {
      setEditTrackLoading(false);
    }
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
    const publicStatus = projectPublicStatus?.[proj.id] ?? { isPublic: false, canPublish: false, pending: false };

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
                  void onDeleteProject(proj.id);
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
            {canEditProject && onToggleProjectPublic && (
              <div className="px-1 pb-1.5">
                <button
                  type="button"
                  onClick={() => void onToggleProjectPublic(proj.id, { allowDownload: quickPublishAllowDownload[proj.id] ?? true })}
                  disabled={publicStatus.pending || (!publicStatus.isPublic && !publicStatus.canPublish)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${
                    publicStatus.isPublic
                      ? "border-emerald-700/40 bg-emerald-950/25 text-emerald-300 hover:bg-emerald-900/30"
                      : "border-indigo-800/50 bg-indigo-950/20 text-indigo-300 hover:bg-indigo-900/30"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  title={
                    publicStatus.isPublic
                      ? "Снять проект с публичной страницы"
                      : publicStatus.canPublish
                        ? "Опубликовать проект на Главной"
                        : "Для публикации нужен READY локальный audio asset"
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    {publicStatus.pending
                      ? "Обновляем публичность..."
                      : publicStatus.isPublic
                        ? "Публичный проект: выключить"
                        : "Сделать проект публичным"}
                  </span>
                </button>
                {!publicStatus.isPublic && (
                  <label className="mt-2 inline-flex items-center gap-2 text-[10px] text-neutral-300">
                    <input
                      type="checkbox"
                      checked={quickPublishAllowDownload[proj.id] ?? true}
                      onChange={(event) => {
                        setQuickPublishAllowDownload((prev) => ({
                          ...prev,
                          [proj.id]: event.target.checked,
                        }));
                      }}
                      className="accent-indigo-500"
                    />
                    Разрешить скачивание после быстрой публикации
                  </label>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1 px-1">
              <span>ТРЕКИ В ПРОЕКТЕ:</span>
              {canEditProject ? (
                <button
                  onClick={() => {
                    setTrackSubmitError("");
                    setShowAddTrack(!showAddTrack);
                  }}
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
              <form onSubmit={handleCreateTrack} className="space-y-1.5 p-1">
                <div className="flex gap-1.5">
                  <input
                    aria-label="НАЗВАНИЕ ТРЕКА"
                    type="text"
                    required
                    value={newTrackTitle}
                    onChange={(e) => setNewTrackTitle(e.target.value)}
                    placeholder="Название трека..."
                    disabled={trackSubmitLoading}
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded p-1 text-[10px] text-white focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={trackSubmitLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white p-1 px-2 rounded text-[10px] font-medium"
                  >
                    {trackSubmitLoading ? "..." : "ОК"}
                  </button>
                </div>
                {trackSubmitError ? <div className="text-[10px] text-red-400 text-left">{trackSubmitError}</div> : null}
              </form>
            )}

            <div className="space-y-1">
              {proj.tracks.map((track) => {
                const isTrackActive = activeTrack?.id === track.id;
                const isEditing = editingTrackId === track.id;

                if (isEditing) {
                  return (
                    <form
                      key={track.id}
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => handleEditTrackSubmit(e, proj.id, track.id)}
                      className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs text-left"
                    >
                      <div>
                        <label className="block text-[8px] font-mono text-neutral-400 mb-0.5">НАЗВАНИЕ ТРЕКА</label>
                        <input
                          type="text"
                          required
                          value={editTrackTitle}
                          onChange={(e) => setEditTrackTitle(e.target.value)}
                          placeholder="Название трека..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-1 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono text-neutral-400 mb-0.5">ОБЛОЖКА ТРЕКА (URL)</label>
                        <input
                          type="text"
                          value={editTrackCoverUrl}
                          onChange={(e) => setEditTrackCoverUrl(e.target.value)}
                          placeholder="Ссылка на обложку..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-1 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono text-neutral-400 mb-0.5">ТЕГИ (через запятую)</label>
                        <input
                          type="text"
                          value={editTrackTags}
                          onChange={(e) => setEditTrackTags(e.target.value)}
                          placeholder="теги трека..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-1 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      {editTrackError && <div className="text-[10px] text-red-400">{editTrackError}</div>}
                      <div className="flex gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingTrackId(null)}
                          className="px-2 py-0.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 rounded text-[10px]"
                        >
                          Отмена
                        </button>
                        <button
                          type="submit"
                          disabled={editTrackLoading}
                          className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-medium"
                        >
                          {editTrackLoading ? "..." : "ОК"}
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectTrack(track)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all group/track ${
                      isTrackActive
                        ? "bg-indigo-950/40 border border-indigo-900/30 text-white font-medium"
                        : "bg-neutral-900/30 hover:bg-neutral-900 text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] truncate pr-2 flex-1">
                      <CoverImage src={track.coverUrl || proj.coverUrl} title={track.title} className="w-5 h-5 rounded-md shrink-0 border border-neutral-800" />
                      <span className="truncate">{track.title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canEditProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTrackId(track.id);
                            setEditTrackTitle(track.title);
                            setEditTrackCoverUrl(track.coverUrl || "");
                            setEditTrackTags(track.tags.join(", "));
                            setEditTrackError("");
                          }}
                          className="p-1 hover:text-indigo-400 text-neutral-500 rounded transition-colors focus:outline-none opacity-0 group-hover/track:opacity-100"
                          title="Редактировать трек"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      <ArrowRight className={`w-3 h-3 text-neutral-600 ${isTrackActive ? "text-indigo-400" : ""}`} />
                    </div>
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
    <div className="studio-surface studio-surface--soft flex h-full flex-col space-y-3 rounded-xl p-3 md:space-y-4 md:p-4">
      {/* List Header */}
      <div className="flex flex-col gap-2 border-b border-neutral-900 pb-3 text-left sm:flex-row sm:items-center sm:justify-between">
        <div className="text-left">
          <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ПРОЕКТЫ (СИНГЛЫ / АЛЬБОМЫ)</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Выберите папку проекта или трек для работы</p>
        </div>
        <button
          onClick={() => {
            setProjectSubmitError("");
            setShowAddProject(!showAddProject);
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 p-2 px-3 text-xs font-medium text-white transition-colors cursor-pointer hover:bg-indigo-500 sm:w-auto"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Создать
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="relative text-left">
        <input
          aria-label="Поиск по названию или тегам..."
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию или тегам..."
          className="studio-input min-h-0 rounded-lg p-2 text-xs placeholder-neutral-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-2 text-neutral-500 hover:text-neutral-300 text-xs font-semibold focus:outline-none"
          >
            ✕
          </button>
        )}
      </div>

      {/* Add Project Form */}
      {showAddProject && (
        <form onSubmit={handleCreateProject} className="studio-surface studio-surface--soft space-y-2.5 rounded-xl p-3 text-xs md:p-3.5">
          <div className="text-left">
            <label className="block text-[10px] font-mono text-neutral-400 mb-1">НАЗВАНИЕ ПРОЕКТА</label>
            <input
              aria-label="НАЗВАНИЕ ПРОЕКТА"
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Например: Ночной Экспресс"
              disabled={projectSubmitLoading}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
            />
          </div>

          {newType === "single" && (
            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">НАЗВАНИЕ ОСНОВНОГО ТРЕКА</label>
              <input
                aria-label="НАЗВАНИЕ ОСНОВНОГО ТРЕКА"
                type="text"
                required
                value={newInitialTrackTitle}
                onChange={(e) => setNewInitialTrackTitle(e.target.value)}
                placeholder="По умолчанию совпадает с названием проекта"
                disabled={projectSubmitLoading}
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="text-left">
              <label className="block text-[10px] font-mono text-neutral-400 mb-1">ФОРМАТ</label>
              <select
                aria-label="ФОРМАТ"
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
                aria-label="ТЕГИ"
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Поп, Акустика, 2026"
                disabled={projectSubmitLoading}
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div className="text-left">
            <label className="block text-[10px] font-mono text-neutral-400 mb-1">ОБЛОЖКА (Ссылка на картинку, необязательно)</label>
              <input
                aria-label="ОБЛОЖКА"
                type="text"
                value={newCover}
                onChange={(e) => setNewCover(e.target.value)}
                placeholder="https://..."
                disabled={projectSubmitLoading}
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none disabled:opacity-60"
              />
            </div>

          {projectSubmitError ? <div className="text-[10px] text-red-400 text-left">{projectSubmitError}</div> : null}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowAddProject(false)}
              disabled={projectSubmitLoading}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800 text-neutral-300 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={projectSubmitLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded font-medium"
            >
              {projectSubmitLoading ? "Создаём..." : "Создать проект"}
            </button>
          </div>
        </form>
      )}

      {/* Projects Cards List */}
      <div className="max-h-[52vh] flex-1 space-y-3 overflow-y-auto pr-1 md:max-h-[500px]">
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

          {canInvite && (activeProject.joinRequests?.length ?? 0) > 0 && (
            <div className="pt-2 border-t border-neutral-900 space-y-2">
              <div className="text-[10px] font-mono text-amber-300 uppercase tracking-wider">Запросы на участие</div>
              {(activeProject.joinRequests ?? []).map((request) => {
                const fallbackRole = resolveRequestedRole(request.requestedRole);
                const selectedRole = joinRequestRoles[request.id] ?? fallbackRole;
                const isPendingAction = joinRequestLoadingId === request.id;
                return (
                  <div key={request.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-white font-semibold truncate">{request.requester.displayName}</div>
                        <div className="text-[10px] text-neutral-400">@{request.requester.username}</div>
                        {request.message ? (
                          <div className="mt-1 text-[10px] text-neutral-300">{request.message}</div>
                        ) : null}
                      </div>
                      <div className="text-[9px] font-mono text-neutral-500 shrink-0">{new Date(request.createdAt).toLocaleString()}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedRole}
                        disabled={isPendingAction}
                        onChange={(event) => {
                          setJoinRequestRoles((prev) => ({
                            ...prev,
                            [request.id]: event.target.value as "viewer" | "editor",
                          }));
                        }}
                        className="text-[9px] font-mono text-neutral-300 bg-neutral-800 border border-neutral-700 p-0.5 px-1.5 rounded focus:outline-none"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button
                        type="button"
                        disabled={isPendingAction}
                        onClick={() => void handleReviewJoinRequest(request.id, "approve", fallbackRole)}
                        className="text-[9px] text-emerald-300 bg-emerald-950/40 border border-emerald-900/40 p-0.5 px-1.5 rounded disabled:opacity-60"
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        disabled={isPendingAction}
                        onClick={() => void handleReviewJoinRequest(request.id, "reject", fallbackRole)}
                        className="text-[9px] text-rose-300 bg-rose-950/40 border border-rose-900/40 p-0.5 px-1.5 rounded disabled:opacity-60"
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showInviteModal && activeProject && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => resetInviteState()}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-4 shadow-2xl"
          >
            <div className="text-left border-b border-neutral-900 pb-3">
              <h4 className="text-sm font-semibold text-white">Добавить участников</h4>
              <p className="text-[11px] text-neutral-400 mt-1">Пригласите коллег в проект "{activeProject.title}"</p>
            </div>

            {/* Mode Switcher */}
            <div className="flex border-b border-neutral-900 p-0.5 rounded bg-neutral-900/50">
              <button
                type="button"
                onClick={() => { setInviteMode("direct"); setInviteError(""); }}
                className={`flex-1 text-center py-1.5 text-xs font-medium rounded transition-colors ${
                  inviteMode === "direct"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                По имени / почте
              </button>
              <button
                type="button"
                onClick={() => { setInviteMode("link"); setInviteError(""); }}
                className={`flex-1 text-center py-1.5 text-xs font-medium rounded transition-colors ${
                  inviteMode === "link"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Ссылка-приглашение
              </button>
            </div>

            {inviteMode === "direct" ? (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
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
                  <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded p-2 text-left font-mono">
                    {inviteError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
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
            ) : (
              <div className="space-y-4">
                <div className="text-left">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">РОЛЬ ДЛЯ ССЫЛКИ</label>
                  <select
                    value={inviteRole}
                    onChange={(event) => {
                      setInviteRole(event.target.value as "viewer" | "editor");
                      setGeneratedLink("");
                    }}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="viewer">Viewer (Только чтение)</option>
                    <option value="editor">Editor (Редактирование)</option>
                  </select>
                </div>

                {!generatedLink ? (
                  <button
                    type="button"
                    onClick={handleGenerateInviteLink}
                    disabled={inviteLoading}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>{inviteLoading ? "Создание ссылки..." : "Создать ссылку-приглашение"}</span>
                  </button>
                ) : (
                  <div className="space-y-2 text-left">
                    <label className="block text-[10px] font-mono text-neutral-400">СКОПИРУЙТЕ ССЫЛКУ</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-300 focus:outline-none font-mono selection:bg-indigo-500/30"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-indigo-400 hover:text-indigo-300 transition-colors flex items-center justify-center cursor-pointer"
                        title="Скопировать в буфер обмена"
                      >
                        {linkCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-green-400/90 mt-1 font-mono">
                      {linkCopied ? "Ссылка скопирована!" : "Любой пользователь с этой ссылкой сможет войти в проект."}
                    </p>
                  </div>
                )}

                {inviteError && (
                  <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded p-2 text-left font-mono">
                    {inviteError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
                  <button
                    type="button"
                    onClick={() => resetInviteState()}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
