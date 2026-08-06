import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createWorkPublication, createCollabPublication, archivePublication, getMyPublications, getPublicationsStats, type PublicationStats } from "../../api/publications";
import { listProjects } from "../../api/projects";
import { isApiError } from "../../api/client";
import { useAuth } from "../../app/auth/AuthProvider";
import AppShell from "../../app/shell/AppShell";
import Button from "../../shared/ui/Button";
import StateView from "../../shared/ui/StateView";
import type { PrivatePublication, Project } from "../../types";

function mapPublicationError(error: unknown) {
  if (!isApiError(error)) return "Не удалось сохранить публикацию.";
  if (error.status === 400) return "Проверьте поля публикации.";
  if (error.status === 401) return "Нужно заново войти в аккаунт.";
  if (error.status === 403) return "Недостаточно прав для публикации этого трека.";
  if (error.status === 404) return "Проект или трек не найдены.";
  if (error.status === 409 && error.code === "PUBLICATION_ASSET_REQUIRED") return "Для публикации нужен готовый локальный аудио-asset трека.";
  if (error.status === 409) return "Публикация конфликтует с текущим состоянием.";
  return "Не удалось сохранить публикацию.";
}

type PublishableTrack = {
  projectId: string;
  projectTitle: string;
  trackId: string;
  trackTitle: string;
  readyAssetCount: number;
};

const PUBLICATION_READY_KINDS = new Set(["MASTER", "AUDIO_VERSION", "INSTRUMENTAL", "ACAPELLA", "STEM", "DEMO", "REFERENCE"]);

function countReadyPublicationAssets(project: Project, trackId: string) {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) return 0;

  return track.assets.filter((asset) => (
    asset.deletedAt === null
    && asset.status === "READY"
    && asset.storageProvider === "local"
    && asset.externalUrl === null
    && typeof asset.mimeType === "string"
    && asset.mimeType.startsWith("audio/")
    && PUBLICATION_READY_KINDS.has(asset.kind)
  )).length;
}

export default function PublicationManagerPage() {
  const { authPhase, currentUser, isCheckingSession, withAuth } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [publications, setPublications] = useState<PrivatePublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"WORK" | "COLLAB">("WORK");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [tags, setTags] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [budget, setBudget] = useState("");
  const [terms, setTerms] = useState("");
  const [rolesNeeded, setRolesNeeded] = useState("");

  // Tabs and Stats
  const [activeTab, setActiveTab] = useState<"manage" | "stats">("manage");
  const [stats, setStats] = useState<PublicationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; plays: number; likes: number; index: number } | null>(null);

  useEffect(() => {
    if (authPhase !== "authenticated") {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    void Promise.all([
      withAuth(() => listProjects(controller.signal)),
      withAuth(() => getMyPublications(controller.signal)),
    ])
      .then(([nextProjects, nextPublications]) => {
        setProjects(nextProjects);
        setPublications(nextPublications.publications);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        setError(mapPublicationError(nextError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authPhase, withAuth]);

  const publishableTracks = useMemo<PublishableTrack[]>(
    () =>
      projects
        .filter((project) => project.currentUserRole === "owner" || project.currentUserRole === "editor")
        .flatMap((project) =>
          project.tracks
            .map((track) => {
              const readyAssetCount = countReadyPublicationAssets(project, track.id);
              return {
                projectId: project.id,
                projectTitle: project.title,
                trackId: track.id,
                trackTitle: track.title,
                readyAssetCount,
              };
            })
            .filter((track) => track.readyAssetCount > 0),
        )
        .sort((left, right) =>
          left.projectTitle.localeCompare(right.projectTitle, "ru")
          || left.trackTitle.localeCompare(right.trackTitle, "ru"),
        ),
    [projects],
  );

  const selectedTrack = publishableTracks.find((track) => track.trackId === selectedTrackId) ?? null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTrack || submitting) return;

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const parsedTags = tags.split(",").map((item) => item.trim()).filter(Boolean);
      const payload = {
        projectId: selectedTrack.projectId,
        trackId: selectedTrack.trackId,
        allowDownload,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        language: language.trim() || undefined,
        tags: parsedTags,
      };

      let response;
      if (kind === "WORK") {
        response = await withAuth(() => createWorkPublication(payload));
      } else {
        response = await withAuth(() => createCollabPublication({
          ...payload,
          budget: budget.trim() || undefined,
          terms: terms.trim() || undefined,
          rolesNeeded: rolesNeeded.split(",").map((r) => r.trim()).filter(Boolean),
        }));
      }

      setPublications((current) => [response.publication, ...current.filter((item) => item.id !== response.publication.id)]);
      setMessage(`Публикация ${kind === "WORK" ? "Work" : "Collab"} создана.`);
      setTitle("");
      setDescription("");
      setCoverImageUrl("");
      setLanguage("");
      setTags("");
      setAllowDownload(true);
      setBudget("");
      setTerms("");
      setRolesNeeded("");
    } catch (nextError) {
      setError(mapPublicationError(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (publicationId: string) => {
    if (archivingId) return;
    setArchivingId(publicationId);
    setError("");
    setMessage("");
    try {
      const response = await withAuth(() => archivePublication(publicationId));
      setPublications((current) => current.map((item) => (item.id === publicationId ? response.publication : item)));
      setMessage("Публикация архивирована.");
    } catch (nextError) {
      setError(mapPublicationError(nextError));
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <AppShell
      title="Публикации"
      headerRight={
        <Link to="/app" className="text-sm text-indigo-300 hover:text-indigo-200">
          К проектам
        </Link>
      }
      currentUser={currentUser}
    >
      <div className="studio-page flex flex-col gap-4">
        {isCheckingSession || loading ? (
          <StateView kind="loading" message="Загружаем публикации..." />
        ) : authPhase !== "authenticated" || !currentUser ? (
          <StateView kind="readOnly" message="Сначала войдите в аккаунт, затем откройте /app/publications." />
        ) : (
          <>
            {message && <StateView kind="empty" message={message} compact />}
            {error && <StateView kind="error" message={error} compact />}

            {/* Navigation Tabs */}
            <div className="studio-toolbar border-b border-neutral-800 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("manage")}
                className={`studio-chip rounded-xl border transition-colors focus:outline-none ${
                  activeTab === "manage"
                    ? "is-active"
                    : "hover:bg-neutral-800/70"
                }`}
              >
                Управление публикациями
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("stats")}
                className={`studio-chip rounded-xl border transition-colors focus:outline-none ${
                  activeTab === "stats"
                    ? "is-active"
                    : "hover:bg-neutral-800/70"
                }`}
              >
                Аналитика и статистика
              </button>
            </div>

            {activeTab === "manage" && (
              <>
                <section className="studio-surface studio-surface--section">
                  <div className="mb-6">
                    <span className="studio-page__eyebrow">Studio Releases</span>
                    <h1 className="text-2xl font-semibold text-white">Новая публикация</h1>
                    <p className="mt-2 text-sm text-neutral-400">
                      Этот slice публикует выбранный track snapshot как Work или Collab.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="grid gap-4">

                    <div className="mb-4 flex gap-4 border-b border-neutral-800 pb-2">
                      <label className="flex items-center gap-2 text-sm text-white">
                        <input
                          type="radio"
                          name="publicationKind"
                          value="WORK"
                          checked={kind === "WORK"}
                          onChange={() => setKind("WORK")}
                          className="accent-indigo-500"
                        />
                        Work
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white">
                        <input
                          type="radio"
                          name="publicationKind"
                          value="COLLAB"
                          checked={kind === "COLLAB"}
                          onChange={() => setKind("COLLAB")}
                          className="accent-indigo-500"
                        />
                        Collab
                      </label>
                    </div>

                    <label className="grid gap-1 text-sm">
                      <span className="text-neutral-300">Трек</span>
                      {publishableTracks.length === 0 && (
                        <span className="text-xs text-amber-300">
                          Нет треков для публикации. Добавьте локальный audio asset со статусом READY в проекте.
                        </span>
                      )}
                      <select
                        aria-label="Track"
                        value={selectedTrackId}
                        onChange={(event) => setSelectedTrackId(event.target.value)}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                        disabled={publishableTracks.length === 0}
                        required
                      >
                        <option value="">Выберите трек</option>
                        {publishableTracks.map((track) => (
                          <option key={track.trackId} value={track.trackId}>
                            {track.projectTitle} / {track.trackTitle} ({track.readyAssetCount} ready assets)
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-neutral-300">Публичный заголовок</span>
                      <input
                        aria-label="Publication title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={selectedTrack?.trackTitle || "Будет использован title трека"}
                        maxLength={160}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-neutral-300">Описание</span>
                      <textarea
                        aria-label="Description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={4}
                        maxLength={3000}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                      />
                    </label>

                    {kind === "COLLAB" && (
                      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4">
                        <label className="grid gap-1 text-sm">
                          <span className="text-indigo-200">Бюджет</span>
                          <input
                            aria-label="Budget"
                            value={budget}
                            onChange={(event) => setBudget(event.target.value)}
                            placeholder="Например: $500 или RevShare"
                            maxLength={100}
                            className="rounded-xl border border-indigo-900/50 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                          />
                        </label>

                        <label className="grid gap-1 text-sm">
                          <span className="text-indigo-200">Необходимые роли (через запятую)</span>
                          <input
                            aria-label="Roles Needed"
                            value={rolesNeeded}
                            onChange={(event) => setRolesNeeded(event.target.value)}
                            placeholder="Vocalist, Producer, Mix Engineer"
                            className="rounded-xl border border-indigo-900/50 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                          />
                        </label>

                        <label className="grid gap-1 text-sm sm:col-span-2">
                          <span className="text-indigo-200">Условия (Terms)</span>
                          <textarea
                            aria-label="Terms"
                            value={terms}
                            onChange={(event) => setTerms(event.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Укажите права, роялти и другие условия."
                            className="rounded-xl border border-indigo-900/50 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                          />
                        </label>
                        <p className="text-xs text-indigo-300 sm:col-span-2">Коллаб будет автоматически закрыт (expired) через 30 дней.</p>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="text-neutral-300">Cover URL</span>
                        <input
                          aria-label="Cover URL"
                          value={coverImageUrl}
                          onChange={(event) => setCoverImageUrl(event.target.value)}
                          placeholder="https://example.com/cover.jpg"
                          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                        />
                      </label>

                      <label className="grid gap-1 text-sm">
                        <span className="text-neutral-300">Language</span>
                        <input
                          aria-label="Language"
                          value={language}
                          onChange={(event) => setLanguage(event.target.value)}
                          maxLength={40}
                          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                        />
                      </label>
                    </div>

                    <label className="grid gap-1 text-sm">
                      <span className="text-neutral-300">Tags</span>
                      <input
                        aria-label="Tags"
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="pop, demo, russian"
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                      />
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-200">
                      <input
                        type="checkbox"
                        checked={allowDownload}
                        onChange={(event) => setAllowDownload(event.target.checked)}
                        className="accent-indigo-500"
                      />
                      Разрешить скачивание аудио на публичной странице
                    </label>

                    <div className="flex flex-wrap gap-3 mt-2">
                      <Button type="submit" disabled={submitting || !selectedTrackId}>
                        {submitting ? "Публикуем..." : `Создать ${kind === "WORK" ? "work" : "collab"} publication`}
                      </Button>
                      <span className="self-center text-xs text-neutral-500">
                        Публикуется только snapshot, собранный в момент создания.
                      </span>
                    </div>
                  </form>
                </section>

                <section className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-white">Мои публикации</h2>
                    <span className="text-xs text-neutral-500">{publications.length} total</span>
                  </div>

                  {publications.length === 0 ? (
                    <StateView kind="empty" message="Пока нет публикаций." compact />
                  ) : (
                    <div className="grid gap-3">
                      {publications.map((publication) => (
                        <article key={publication.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-base font-semibold text-white">{publication.title}</h3>
                              <p className="text-sm text-neutral-400">
                                {publication.projectTitle} / {publication.trackTitle}
                              </p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {publication.status === "PUBLISHED" ? "Опубликовано" : "Архив"} · {new Date(publication.publishedAt).toLocaleString("ru-RU")}
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                              <a
                                href={publication.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-900/40 bg-indigo-950/30 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-900/40 w-full sm:w-auto text-center cursor-pointer"
                              >
                                Открыть страницу
                              </a>
                              {publication.status === "PUBLISHED" && (
                                <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={archivingId === publication.id} onClick={() => void handleArchive(publication.id)}>
                                  {archivingId === publication.id ? "Архивируем..." : "Архивировать"}
                                </Button>
                              )}
                            </div>
                          </div>
                          {publication.description && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-300">{publication.description}</p>}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {activeTab === "stats" && (
              <div className="space-y-6">
                {statsLoading ? (
                  <StateView kind="loading" message="Загружаем аналитику..." />
                ) : statsError ? (
                  <StateView kind="error" message={statsError} compact />
                ) : !stats || stats.publications.length === 0 ? (
                  <StateView kind="empty" message="У вас пока нет активных публикаций для отображения аналитики." compact />
                ) : (
                  <>
                    {/* Overall Summary Cards */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-left">
                        <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Всего воспроизведений</span>
                        <div className="mt-2 text-3xl font-bold text-indigo-400">{stats.totalPlays}</div>
                      </div>
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-left">
                        <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Всего лайков</span>
                        <div className="mt-2 text-3xl font-bold text-rose-500">{stats.totalLikes}</div>
                      </div>
                    </div>

                    {/* Interactive SVG Chart Card */}
                    <div className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-xl relative text-left">
                      <h3 className="text-base font-semibold text-white mb-2">Активность за последние 30 дней</h3>
                      <p className="text-xs text-neutral-400 mb-6">График воспроизведений и лайков по дням.</p>

                      <div className="relative h-64 w-full">
                        {/* SVG Drawing */}
                        {(() => {
                          const chartWidth = 600;
                          const chartHeight = 200;
                          const paddingLeft = 40;
                          const paddingRight = 20;
                          const paddingTop = 20;
                          const paddingBottom = 30;
                          
                          const plotWidth = chartWidth - paddingLeft - paddingRight;
                          const plotHeight = chartHeight - paddingTop - paddingBottom;

                          const maxVal = Math.max(...stats.byDate.map(d => Math.max(d.plays, d.likes, 1)));
                          
                          // Generate polyline points
                          const playPoints = stats.byDate.map((point, index) => {
                            const x = paddingLeft + (index * plotWidth) / 29;
                            const y = paddingTop + plotHeight - (point.plays / maxVal) * plotHeight;
                            return `${x},${y}`;
                          }).join(" ");

                          const likePoints = stats.byDate.map((point, index) => {
                            const x = paddingLeft + (index * plotWidth) / 29;
                            const y = paddingTop + plotHeight - (point.likes / maxVal) * plotHeight;
                            return `${x},${y}`;
                          }).join(" ");

                          // Gradient coordinates
                          const playGradientPoints = `${paddingLeft},${paddingTop + plotHeight} ` + playPoints + ` ${paddingLeft + plotWidth},${paddingTop + plotHeight}`;
                          const likeGradientPoints = `${paddingLeft},${paddingTop + plotHeight} ` + likePoints + ` ${paddingLeft + plotWidth},${paddingTop + plotHeight}`;

                          return (
                            <div className="w-full h-full relative">
                              <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="playsGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                                  </linearGradient>
                                  <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                  </linearGradient>
                                </defs>

                                {/* Grid lines */}
                                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                                  const y = paddingTop + ratio * plotHeight;
                                  const labelVal = Math.round(maxVal * (1 - ratio));
                                  return (
                                    <g key={ratio}>
                                      <line x1={paddingLeft} y1={y} x2={paddingLeft + plotWidth} y2={y} stroke="#262626" strokeWidth="1" strokeDasharray="4 4" />
                                      <text x={paddingLeft - 8} y={y + 4} fill="#737373" className="text-[10px] font-mono text-right" textAnchor="end">{labelVal}</text>
                                    </g>
                                  );
                                })}

                                {/* X-axis Date Markers */}
                                {[0, 14, 29].map((index) => {
                                  const point = stats.byDate[index];
                                  if (!point) return null;
                                  const x = paddingLeft + (index * plotWidth) / 29;
                                  const [, month, day] = point.date.split("-");
                                  return (
                                    <text key={index} x={x} y={paddingTop + plotHeight + 18} fill="#737373" className="text-[10px] font-mono" textAnchor="middle">
                                      {`${day}.${month}`}
                                    </text>
                                  );
                                })}

                                {/* Shaded gradient areas */}
                                <polygon points={playGradientPoints} fill="url(#playsGrad)" />
                                <polygon points={likeGradientPoints} fill="url(#likesGrad)" />

                                {/* Lines */}
                                <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" points={playPoints} />
                                <polyline fill="none" stroke="#f43f5e" strokeWidth="2" points={likePoints} />

                                {/* Hover Guides & Interactions */}
                                {stats.byDate.map((point, index) => {
                                  const x = paddingLeft + (index * plotWidth) / 29;
                                  return (
                                    <g
                                      key={index}
                                      className="cursor-pointer group/point"
                                      onMouseEnter={() => setHoveredPoint({ ...point, index })}
                                      onMouseLeave={() => setHoveredPoint(null)}
                                      onClick={() => setHoveredPoint(hoveredPoint?.index === index ? null : { ...point, index })}
                                    >
                                      {/* Interactive Hitbox Band */}
                                      <rect x={x - 10} y={paddingTop} width={20} height={plotHeight} fill="transparent" />
                                      
                                      {/* Highlight hover vertical line */}
                                      {hoveredPoint?.index === index && (
                                        <line x1={x} y1={paddingTop} x2={x} y2={paddingTop + plotHeight} stroke="#404040" strokeWidth="1" />
                                      )}

                                      {/* Dots */}
                                      {hoveredPoint?.index === index && (
                                        <>
                                          <circle cx={x} cy={paddingTop + plotHeight - (point.plays / maxVal) * plotHeight} r="5" fill="#6366f1" stroke="#171717" strokeWidth="1.5" />
                                          <circle cx={x} cy={paddingTop + plotHeight - (point.likes / maxVal) * plotHeight} r="4" fill="#f43f5e" stroke="#171717" strokeWidth="1.5" />
                                        </>
                                      )}
                                    </g>
                                  );
                                })}
                              </svg>

                              {/* Hover Tooltip */}
                              {hoveredPoint && (() => {
                                const pct = (hoveredPoint.index / 29) * 100;
                                let style: React.CSSProperties = {
                                  left: `${pct}%`,
                                  transform: "translateX(-50%)"
                                };
                                if (hoveredPoint.index < 4) {
                                  style = { left: "10px", transform: "none" };
                                } else if (hoveredPoint.index > 25) {
                                  style = { right: "10px", left: "auto", transform: "none" };
                                }
                                return (
                                  <div
                                    className="absolute top-0 bg-neutral-900 border border-neutral-800 p-2.5 rounded-lg text-xs space-y-1.5 shadow-2xl z-10 pointer-events-none transition-all duration-75"
                                    style={style}
                                  >
                                    <div className="font-mono text-neutral-400 font-semibold">{new Date(hoveredPoint.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</div>
                                    <div className="flex flex-col gap-1">
                                      <span className="flex items-center gap-1.5 text-indigo-300">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                        Воспроизведения: <strong>{hoveredPoint.plays}</strong>
                                      </span>
                                      <span className="flex items-center gap-1.5 text-rose-350">
                                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                                        Лайки: <strong>{hoveredPoint.likes}</strong>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Legend */}
                      <div className="flex gap-4 mt-2 justify-center text-xs">
                        <span className="flex items-center gap-1.5 text-neutral-350">
                          <span className="w-3 h-1.5 rounded-full bg-indigo-500 inline-block" />
                          Прослушивания
                        </span>
                        <span className="flex items-center gap-1.5 text-neutral-350">
                          <span className="w-3 h-1.5 rounded-full bg-rose-500 inline-block" />
                          Лайки
                        </span>
                      </div>
                    </div>

                    {/* Breakdown by individual publication table */}
                    <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6 text-left">
                      <h3 className="text-base font-semibold text-white mb-4">Статистика по релизам</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-neutral-350">
                          <thead>
                            <tr className="border-b border-neutral-800 text-neutral-400 text-xs font-mono uppercase">
                              <th className="py-2.5">Название публикации</th>
                              <th className="py-2.5 text-right">Прослушивания</th>
                              <th className="py-2.5 text-right">Лайки</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.publications.map((pub) => (
                              <tr key={pub.id} className="border-b border-neutral-900 hover:bg-neutral-900/20 transition-colors">
                                <td className="py-3 font-semibold text-white">{pub.title}</td>
                                <td className="py-3 text-right text-indigo-300 font-mono font-medium">{pub.plays}</td>
                                <td className="py-3 text-right text-rose-300 font-mono font-medium">{pub.likes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
