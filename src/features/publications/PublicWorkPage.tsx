import React, { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicWork, likeWork, playWork, requestJoinFromWork, unlikeWork } from "../../api/publications";
import { sendDmRequestByUserId } from "../../api/dm";
import type { PublicWork } from "../../types";
import { useAuth } from "../../app/auth/AuthProvider";
import { isApiError } from "../../api/client";
import Avatar from "../../shared/ui/Avatar";
import StateView from "../../shared/ui/StateView";
import { PublicationComments } from "../../components/PublicationComments";
import { featureFlags } from "../../app/featureFlags";

function isSafeHttpUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function PublicWorkPage() {
  const { slug = "" } = useParams();
  const [work, setWork] = useState<PublicWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const [isLiking, setIsLiking] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinInfo, setJoinInfo] = useState<string | null>(null);
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [dmText, setDmText] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [dmSent, setDmSent] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setWork(null);

    void getPublicWork(slug, controller.signal)
      .then((response) => {
        setError(null);
        setWork(response.work);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Публичная work-публикация не найдена или уже скрыта.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  const handleLikeToggle = async () => {
    if (!work || !currentUser || isLiking) return;
    setIsLiking(true);
    try {
      if (work.hasLiked) {
        await unlikeWork(slug);
        setWork({ ...work, hasLiked: false, likeCount: Math.max(0, work.likeCount - 1) });
      } else {
        await likeWork(slug);
        setWork({ ...work, hasLiked: true, likeCount: work.likeCount + 1 });
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
    } finally {
      setIsLiking(false);
    }
  };

  const handlePlay = () => {
    if (!work || hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    playWork(slug).catch(console.error);
    setWork({ ...work, playCount: work.playCount + 1 });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: work?.title,
        text: work?.description || "",
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href)
        .then(() => alert("Ссылка скопирована в буфер обмена"))
        .catch(console.error);
    }
  };

  const handleJoinRequest = async () => {
    if (!work || !currentUser || joinLoading) return;
    setJoinInfo(null);
    setJoinLoading(true);
    try {
      await requestJoinFromWork(slug, { requestedRole: "viewer" });
      setJoinInfo("Запрос на участие отправлен владельцу проекта.");
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        if (error.code === "JOIN_REQUEST_ALREADY_PENDING") {
          setJoinInfo("Ваш запрос уже ожидает решения владельца.");
        } else if (error.code === "ALREADY_PROJECT_MEMBER") {
          setJoinInfo("Вы уже участник этого проекта.");
        } else {
          setJoinInfo("Нельзя отправить запрос в этот проект.");
        }
      } else {
        setJoinInfo("Не удалось отправить запрос. Попробуйте позже.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleSendDmToAuthor = async () => {
    if (!work?.authorUserId || !dmText.trim() || dmSending) return;
    setDmSending(true);
    setDmError(null);
    try {
      await sendDmRequestByUserId(work.authorUserId, dmText.trim());
      setDmSent(true);
      setDmText("");
    } catch (error) {
      if (isApiError(error) && error.status === 409 && error.code === "DUPLICATE_REQUEST") {
        setDmError("Диалог уже создан или ожидает подтверждения автора.");
      } else {
        setDmError(error instanceof Error ? error.message : "Не удалось отправить сообщение автору.");
      }
    } finally {
      setDmSending(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--cs-color-bg)] text-[var(--cs-color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/main" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← Вернуться в CollabStudio
          </Link>
          <img src="/logo.png" alt="CollabStudio" className="h-10 w-auto object-contain" />
        </div>

        {loading && <StateView kind="loading" message="Загружаем public work..." />}
        {!loading && error && <StateView kind="empty" message={error} />}

        {!loading && work && (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-2xl">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="grid gap-4">
                {isSafeHttpUrl(work.coverImageUrl) && (
                  <img
                    src={work.coverImageUrl!}
                    alt={work.title}
                    className="aspect-video w-full rounded-2xl border border-neutral-800 object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}

                <div>
                  <h1 className="text-3xl font-semibold text-white">{work.title}</h1>
                  {work.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{work.description}</p>}
                </div>

                {work.audio && (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                    <audio controls preload="metadata" src={work.audio.streamUrl} className="w-full" onPlay={handlePlay} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {work.audio.downloadUrl ? (
                        <a
                          href={work.audio.downloadUrl}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-900/40 bg-indigo-950/30 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-900/40"
                        >
                          Скачать аудио
                        </a>
                      ) : (
                        <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-400">
                          Скачивание отключено автором
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {work.lyrics && (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Lyrics snapshot</div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">{work.lyrics.plainText}</pre>
                  </div>
                )}
              </div>

              <aside className="grid content-start gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex flex-wrap gap-4 rounded-xl border border-neutral-800/60 bg-neutral-950/40 p-4">
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-bold text-white">{work.playCount}</div>
                    <div className="text-xs uppercase tracking-wider text-neutral-500">Plays</div>
                  </div>
                  <div className="w-[1px] bg-neutral-800/60"></div>
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-bold text-white">{work.likeCount}</div>
                    <div className="text-xs uppercase tracking-wider text-neutral-500">Likes</div>
                  </div>
                </div>

                {currentUser && (
                  <button
                    onClick={handleLikeToggle}
                    disabled={isLiking}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                      work.hasLiked
                        ? "border-pink-900/40 bg-pink-950/30 text-pink-300 hover:bg-pink-900/40"
                        : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                    }`}
                  >
                    {work.hasLiked ? "Unlike" : "Like"}
                  </button>
                )}

                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                >
                  Share
                </button>

                {currentUser && work.authorUserId !== currentUser.id && (
                  <>
                    <button
                      onClick={handleJoinRequest}
                      disabled={joinLoading}
                      className="flex items-center justify-center gap-2 rounded-xl border border-indigo-900/40 bg-indigo-950/20 px-4 py-3 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-900/30 disabled:opacity-60"
                    >
                      {joinLoading ? "Отправляем запрос..." : "Попроситься в проект"}
                    </button>
                    {featureFlags.directMessages && (
                      <button
                        onClick={() => {
                          setDmModalOpen(true);
                          setDmError(null);
                          setDmSent(false);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-indigo-700/40 bg-indigo-950/30 px-4 py-3 text-sm font-semibold text-indigo-300 transition-colors hover:bg-indigo-900/40"
                      >
                        Написать автору
                      </button>
                    )}
                  </>
                )}

                {joinInfo && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-300">
                    {joinInfo}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Avatar src={work.author.avatarUrl} name={work.author.displayName} className="h-12 w-12 text-sm" />
                  <div>
                    <div className="text-sm font-semibold text-white">{work.author.displayName}</div>
                    {work.author.publicProfileUrl && work.author.username ? (
                      <a
                        href={work.author.publicProfileUrl}
                        className="text-xs text-indigo-300 hover:text-indigo-200"
                      >
                        @{work.author.username}
                      </a>
                    ) : (
                      <div className="text-xs text-neutral-500">Private profile</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Published</div>
                  <div className="text-sm text-neutral-200">{new Date(work.publishedAt).toLocaleString("ru-RU")}</div>
                </div>

                {work.language && (
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Language</div>
                    <div className="text-sm text-neutral-200">{work.language}</div>
                  </div>
                )}

                {work.tags.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {work.tags.map((tag) => (
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

        {!loading && work && featureFlags.publicComments && (
          <PublicationComments
            publicationId={work.id}
            publicationSlug={work.slug}
            publicationAuthorId={work.authorUserId}
            commentsClosed={work.commentsClosed}
          />
        )}

        {dmModalOpen && work && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
              <h3 className="mb-4 text-lg font-semibold text-white">Написать автору публикации</h3>
              {dmSent ? (
                <div className="py-4 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-sm text-neutral-300">Запрос в личные сообщения отправлен.</p>
                  <button
                    onClick={() => setDmModalOpen(false)}
                    className="mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    value={dmText}
                    onChange={(event) => setDmText(event.target.value)}
                    placeholder="Напишите первое сообщение автору..."
                    rows={4}
                    maxLength={1000}
                    className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                  <div className="flex justify-between items-center text-xs text-neutral-500 mt-1">
                    <span>{dmText.length}/1000</span>
                  </div>
                  {dmError && <p className="mt-2 text-xs text-rose-400">{dmError}</p>}
                  <div className="mt-4 flex gap-3 justify-end">
                    <button
                      onClick={() => {
                        setDmModalOpen(false);
                        setDmText("");
                      }}
                      className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => void handleSendDmToAuthor()}
                      disabled={!dmText.trim() || dmSending}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition-colors"
                    >
                      {dmSending ? "Отправка..." : "Отправить"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

