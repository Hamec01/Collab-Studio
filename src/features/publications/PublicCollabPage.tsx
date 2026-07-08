import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicCollab } from "../../api/publications";
import type { PublicWork } from "../../types";
import Avatar from "../../shared/ui/Avatar";
import StateView from "../../shared/ui/StateView";

function isSafeHttpUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function PublicCollabPage() {
  const { slug = "" } = useParams();
  const [collab, setCollab] = useState<PublicWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCollab(null);

    void getPublicCollab(slug, controller.signal)
      .then((response) => setCollab(response.collab))
      .catch(() => setError("Публичная collab-публикация не найдена или уже истекла/скрыта."))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  return (
    <div className="min-h-dvh bg-[var(--cs-color-bg)] text-[var(--cs-color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/app" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← Вернуться в CollabStudio
          </Link>
          <img src="/logo.png" alt="CollabStudio" className="h-10 w-auto object-contain" />
        </div>

        {loading && <StateView kind="loading" message="Загружаем public collab..." />}
        {!loading && error && <StateView kind="empty" message={error} />}

        {!loading && collab && (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-2xl">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="grid gap-4">
                {isSafeHttpUrl(collab.coverImageUrl) && (
                  <img
                    src={collab.coverImageUrl!}
                    alt={collab.title}
                    className="aspect-video w-full rounded-2xl border border-neutral-800 object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}

                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-indigo-900/40 bg-indigo-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-3">
                    Collab
                  </div>
                  <h1 className="text-3xl font-semibold text-white">{collab.title}</h1>
                  {collab.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{collab.description}</p>}
                </div>

                {collab.collabDetails && (
                  <div className="grid gap-4 rounded-2xl border border-indigo-900/30 bg-indigo-950/10 p-5">
                    <h3 className="text-lg font-semibold text-indigo-100">Ищем соавторов</h3>
                    
                    <div className="grid gap-3 sm:grid-cols-2">
                      {collab.collabDetails.budget && (
                        <div>
                          <div className="text-xs text-indigo-300/70 mb-1">Бюджет / Условия</div>
                          <div className="text-sm text-indigo-100">{collab.collabDetails.budget}</div>
                        </div>
                      )}
                      
                      {collab.collabDetails.rolesNeeded.length > 0 && (
                        <div>
                          <div className="text-xs text-indigo-300/70 mb-1">Нужны роли</div>
                          <div className="flex flex-wrap gap-1.5">
                            {collab.collabDetails.rolesNeeded.map((role) => (
                              <span key={role} className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-200">
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {collab.collabDetails.terms && (
                      <div className="mt-2">
                        <div className="text-xs text-indigo-300/70 mb-1">Подробные условия</div>
                        <div className="whitespace-pre-wrap text-sm text-indigo-200/90">{collab.collabDetails.terms}</div>
                      </div>
                    )}
                  </div>
                )}

                {collab.audio && (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                    <audio controls preload="metadata" src={collab.audio.streamUrl} className="w-full" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={collab.audio.downloadUrl}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-900/40 bg-indigo-950/30 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-900/40"
                      >
                        Скачать аудио
                      </a>
                    </div>
                  </div>
                )}

                {collab.lyrics && (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Lyrics snapshot</div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">{collab.lyrics.plainText}</pre>
                  </div>
                )}
              </div>

              <aside className="grid content-start gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex items-center gap-3">
                  <Avatar src={collab.author.avatarUrl} name={collab.author.displayName} className="h-12 w-12 text-sm" />
                  <div>
                    <div className="text-sm font-semibold text-white">{collab.author.displayName}</div>
                    {collab.author.publicProfileUrl && collab.author.username ? (
                      <a
                        href={collab.author.publicProfileUrl}
                        className="text-xs text-indigo-300 hover:text-indigo-200"
                      >
                        @{collab.author.username}
                      </a>
                    ) : (
                      <div className="text-xs text-neutral-500">Private profile</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Published</div>
                  <div className="text-sm text-neutral-200">{new Date(collab.publishedAt).toLocaleString("ru-RU")}</div>
                </div>
                
                {collab.expiresAt && (
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Expires</div>
                    <div className="text-sm text-red-300">{new Date(collab.expiresAt).toLocaleString("ru-RU")}</div>
                  </div>
                )}

                {collab.language && (
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Language</div>
                    <div className="text-sm text-neutral-200">{collab.language}</div>
                  </div>
                )}

                {collab.tags.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {collab.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

