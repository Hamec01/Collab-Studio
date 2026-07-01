import React, { useState } from "react";
import { FolderPlus, Disc, Layers, Music, Users, Plus, Tag, ArrowRight, Trash2, UserPlus, Check } from "lucide-react";
import { AuthUser, Project, Track } from "../types";

interface ProjectListProps {
  projects: Project[];
  activeProject: Project | null;
  activeTrack: Track | null;
  onSelectProject: (p: Project) => void;
  onSelectTrack: (t: Track) => void;
  onCreateProject: (title: string, type: 'single' | 'album', tags: string[], coverUrl?: string) => void;
  onAddTrack: (projectId: string, title: string) => void;
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
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleCopyInviteLink = () => {
    if (!activeProject) return;
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    const inviteUrl = `${origin}${window.location.pathname}?invite=${activeProject.id}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    });
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
          <div className="text-center p-6 italic text-neutral-500 text-xs">Нет созданных проектов</div>
        ) : (
          projects.map((proj) => {
            const isSelected = activeProject?.id === proj.id;
            return (
              <div
                key={proj.id}
                className={`rounded-xl border transition-all text-left overflow-hidden ${
                  isSelected
                    ? "bg-neutral-900/40 border-indigo-500/50"
                    : "bg-neutral-900/10 border-neutral-900 hover:border-neutral-800"
                }`}
              >
                {/* Project Brief Info */}
                <div
                  onClick={() => onSelectProject(proj)}
                  className="p-3 flex items-start gap-3 cursor-pointer select-none relative"
                >
                  <img
                    src={proj.coverUrl || "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80"}
                    alt={proj.title}
                    className="w-12 h-12 rounded-lg object-cover bg-neutral-850 border border-neutral-800 shrink-0"
                    referrerPolicy="no-referrer"
                  />

                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5">
                      {proj.type === "album" ? (
                        <Layers className="w-3.5 h-3.5 text-teal-400 shrink-0" title="Альбом" />
                      ) : (
                        <Disc className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-spin-slow" title="Сингл" />
                      )}
                      <h4 className="font-semibold text-white text-xs truncate leading-snug">
                        {proj.title}
                      </h4>
                    </div>

                    {/* Participants count */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-neutral-500" />
                        {proj.participants.length} уч.
                      </span>
                      <span>•</span>
                      <span>{proj.tracks.length} трек.</span>
                    </div>

                    {/* Tags */}
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

                  {/* Delete button (only show if owner or admin) */}
                  {currentUser && (currentUser.role === "admin" || proj.participants.some(p => p.userId === currentUser.id && p.role === "owner")) && (
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

                {/* Sub-Tracks Expand (only if project is selected) */}
                {isSelected && (
                  <div className="bg-neutral-950/60 border-t border-neutral-900 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1 px-1">
                      <span>ТРЕКИ В ПРОЕКТЕ:</span>
                      <button
                        onClick={() => setShowAddTrack(!showAddTrack)}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        Добавить трек
                      </button>
                    </div>

                    {/* Add Track Inline Form */}
                    {showAddTrack && (
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

                    {/* Tracks List */}
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
          })
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
            <button
              onClick={handleCopyInviteLink}
              className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
              title="Скопировать ссылку-приглашение для совместной работы"
            >
              {copiedInvite ? (
                <>
                  <Check className="w-3 h-3 text-teal-400 animate-pulse" />
                  <span className="text-teal-400">Скопировано!</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3 h-3" />
                  <span>Пригласить</span>
                </>
              )}
            </button>
          </div>
          <div className="space-y-2">
            {activeProject.participants.map((part) => (
              <div key={part.userId} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-neutral-900/40">
                <span className="text-[11px] font-medium text-white">{part.displayName}</span>
                <span className="text-[9px] font-mono text-neutral-400 bg-neutral-800 border border-neutral-750 p-0.5 px-1.5 rounded">
                  {part.role === "owner" ? "Владелец" : part.role === "editor" ? "Редактор" : "Зритель"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
