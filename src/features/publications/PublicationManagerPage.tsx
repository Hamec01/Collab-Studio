import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createWorkPublication, archivePublication, getMyPublications } from "../../api/publications";
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
  assetCount: number;
};

export default function PublicationManagerPage() {
  const { authPhase, currentUser, isCheckingSession, withAuth } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [publications, setPublications] = useState<PrivatePublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [tags, setTags] = useState("");

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
          project.tracks.map((track) => ({
            projectId: project.id,
            projectTitle: project.title,
            trackId: track.id,
            trackTitle: track.title,
            assetCount: track.assets.length,
          })),
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
      const response = await withAuth(() => createWorkPublication({
        projectId: selectedTrack.projectId,
        trackId: selectedTrack.trackId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        language: language.trim() || undefined,
        tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
      }));
      setPublications((current) => [response.publication, ...current.filter((item) => item.id !== response.publication.id)]);
      setMessage("Публикация создана.");
      setTitle("");
      setDescription("");
      setCoverImageUrl("");
      setLanguage("");
      setTags("");
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
      showMobileNav={false}
      mobileNavItems={[]}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
        {isCheckingSession || loading ? (
          <StateView kind="loading" message="Загружаем публикации..." />
        ) : authPhase !== "authenticated" || !currentUser ? (
          <StateView kind="readOnly" message="Сначала войдите в аккаунт, затем откройте /app/publications." />
        ) : (
          <>
            {message && <StateView kind="empty" message={message} compact />}
            {error && <StateView kind="error" message={error} compact />}

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-2xl">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">WORK publication</h1>
                <p className="mt-2 text-sm text-neutral-400">
                  Этот slice публикует только selected work snapshot с одним готовым локальным audio asset.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-300">Трек</span>
                  <select
                    aria-label="Track"
                    value={selectedTrackId}
                    onChange={(event) => setSelectedTrackId(event.target.value)}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Выберите трек</option>
                    {publishableTracks.map((track) => (
                      <option key={track.trackId} value={track.trackId}>
                        {track.projectTitle} / {track.trackTitle} ({track.assetCount} assets)
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

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={submitting || !selectedTrackId}>
                    {submitting ? "Публикуем..." : "Создать work publication"}
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

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={publication.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-900/40 bg-indigo-950/30 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-900/40"
                          >
                            Открыть public page
                          </a>
                          {publication.status === "PUBLISHED" && (
                            <Button type="button" variant="secondary" disabled={archivingId === publication.id} onClick={() => void handleArchive(publication.id)}>
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
      </div>
    </AppShell>
  );
}
