import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth/AuthProvider";
import { useI18n } from "../app/i18n/I18nProvider";
import {
  getPublicationComments,
  createPublicationComment,
  toggleCommentsClosed,
  toggleCommentHidden,
  blockUser,
  reportContent,
} from "../api/comments";
import type { PublicationComment } from "../types";

interface PublicationCommentsProps {
  publicationId: string;
  publicationSlug: string;
  publicationAuthorId: string | null;
  commentsClosed: boolean;
}

export function PublicationComments({
  publicationId,
  publicationSlug,
  publicationAuthorId,
  commentsClosed: initialCommentsClosed,
}: PublicationCommentsProps) {
  const { user } = useAuth();
  const { t } = useI18n();

  const [comments, setComments] = useState<PublicationComment[]>([]);
  const [closed, setClosed] = useState(initialCommentsClosed);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Block/Report state
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const isPublicationAuthor = user?.id === publicationAuthorId;

  // Verification status check
  const isVerified = user?.emailVerifiedAt && user?.ageAcknowledgedAt;

  useEffect(() => {
    let active = true;
    setFetchLoading(true);
    getPublicationComments(publicationSlug)
      .then((res) => {
        if (active) {
          setComments(res.comments);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Не удалось загрузить комментарии");
        }
      })
      .finally(() => {
        if (active) setFetchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [publicationSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await createPublicationComment(publicationSlug, text.trim());
      setComments((prev) => [...prev, res.comment]);
      setText("");
    } catch (err: any) {
      setError(err.message || "Не удалось отправить комментарий");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClosed = async () => {
    setError(null);
    try {
      const nextClosed = !closed;
      await toggleCommentsClosed(publicationSlug, nextClosed);
      setClosed(nextClosed);
    } catch (err: any) {
      setError(err.message || "Не удалось изменить статус обсуждения");
    }
  };

  const handleHideComment = async (commentId: string, isHidden: boolean) => {
    setError(null);
    try {
      const res = await toggleCommentHidden(commentId, !isHidden);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, isHidden: res.comment.isHidden } : c))
      );
    } catch (err: any) {
      setError(err.message || "Не удалось модерировать комментарий");
    }
  };

  const handleBlockUser = async (username: string) => {
    if (!window.confirm(`Вы уверены, что хотите заблокировать пользователя @${username}? Он больше не сможет оставлять комментарии под вашими публикациями.`)) {
      return;
    }
    setError(null);
    try {
      await blockUser(username);
      alert(`Пользователь @${username} успешно заблокирован.`);
    } catch (err: any) {
      setError(err.message || "Не удалось заблокировать пользователя");
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingCommentId || !reportReason.trim()) return;

    setReportError(null);
    setReportSuccess(null);
    try {
      await reportContent({
        contentType: "COMMENT",
        contentId: reportingCommentId,
        reason: reportReason.trim(),
      });
      setReportSuccess("Жалоба успешно отправлена администрации.");
      setReportReason("");
      setTimeout(() => setReportingCommentId(null), 2000);
    } catch (err: any) {
      setReportError(err.message || "Не удалось отправить жалобу");
    }
  };

  return (
    <div className="mt-8 border-t border-neutral-800 pt-8 max-w-4xl mx-auto w-full px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
          Обсуждение
          <span className="text-sm font-normal text-neutral-400">
            ({comments.filter(c => !c.isHidden || isPublicationAuthor).length})
          </span>
        </h3>

        {isPublicationAuthor && (
          <button
            type="button"
            onClick={handleToggleClosed}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              closed
                ? "border-emerald-700 bg-emerald-950 text-emerald-300 hover:bg-emerald-900"
                : "border-red-700 bg-red-950 text-red-300 hover:bg-red-900"
            }`}
          >
            {closed ? "Открыть обсуждение" : "Закрыть обсуждение"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Write Comment Box */}
      <div className="mb-8 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        {closed ? (
          <p className="text-sm text-neutral-400 text-center py-2">
            🔒 Автор закрыл обсуждение этой публикации.
          </p>
        ) : !user ? (
          <p className="text-sm text-neutral-400 text-center py-2">
            Чтобы оставить комментарий, пожалуйста,{" "}
            <Link to="/login" className="text-indigo-400 hover:underline">
              войдите в аккаунт
            </Link>
            .
          </p>
        ) : !isVerified ? (
          <p className="text-sm text-yellow-300 text-center py-2 bg-yellow-950/40 rounded-lg border border-yellow-800/40">
            ⚠️ Для комментирования необходимо подтвердить почту и возраст в профиле.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Напишите комментарий..."
              maxLength={1000}
              className="w-full bg-neutral-850 border border-neutral-750 rounded-lg p-3 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              disabled={loading}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {text.length} / 1000
              </span>
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {loading ? "Отправка..." : "Отправить"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Comments List */}
      {fetchLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-neutral-500 text-sm text-center py-8">
          Здесь пока нет ни одного комментария. Станьте первым!
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const showHiddenLabel = comment.isHidden;
            if (comment.isHidden && !isPublicationAuthor) {
              return null; // Skip rendering hidden comments entirely for non-authors
            }

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-xl border transition-colors ${
                  comment.isHidden
                    ? "bg-neutral-950 border-neutral-900 opacity-60"
                    : "bg-neutral-850/40 border-neutral-800/80 hover:bg-neutral-850/60"
                }`}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <Link
                    to={`/u/${comment.author.username}`}
                    className="h-10 w-10 shrink-0 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-neutral-300 hover:border-neutral-500 transition-colors overflow-hidden"
                  >
                    {comment.author.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={comment.author.displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      comment.author.displayName[0]?.toUpperCase()
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <Link
                        to={`/u/${comment.author.username}`}
                        className="text-sm font-semibold text-neutral-200 hover:text-white transition-colors hover:underline"
                      >
                        {comment.author.displayName}
                      </Link>
                      <span className="text-xs text-neutral-500">
                        @{comment.author.username}
                      </span>
                      <span className="text-[10px] text-neutral-600">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                      {showHiddenLabel && (
                        <span className="bg-red-950 border border-red-900 text-red-300 text-[10px] px-1.5 py-0.5 rounded font-semibold">
                          Скрыт автором
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-neutral-300 whitespace-pre-line break-words">
                      {comment.text}
                    </p>

                    {/* Inline Actions */}
                    <div className="flex items-center gap-3 mt-3">
                      {/* Hide/Show Toggle */}
                      {isPublicationAuthor && (
                        <button
                          type="button"
                          onClick={() => handleHideComment(comment.id, comment.isHidden)}
                          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                          {comment.isHidden ? "Показать" : "Скрыть"}
                        </button>
                      )}

                      {/* Block User Button */}
                      {isPublicationAuthor && comment.author.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleBlockUser(comment.author.username)}
                          className="text-xs text-red-500/80 hover:text-red-400 transition-colors"
                        >
                          Заблокировать
                        </button>
                      )}

                      {/* Report Action */}
                      {user && comment.author.id !== user.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setReportingCommentId(
                              reportingCommentId === comment.id ? null : comment.id
                            );
                            setReportSuccess(null);
                            setReportError(null);
                          }}
                          className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                        >
                          Пожаловаться
                        </button>
                      )}
                    </div>

                    {/* Report Form */}
                    {reportingCommentId === comment.id && (
                      <form
                        onSubmit={handleReportSubmit}
                        className="mt-3 bg-neutral-900 p-3 rounded-lg border border-neutral-800 max-w-md"
                      >
                        <p className="text-xs text-neutral-400 mb-2">
                          Укажите причину жалобы:
                        </p>
                        {reportSuccess ? (
                          <p className="text-xs text-emerald-400 font-semibold">
                            {reportSuccess}
                          </p>
                        ) : (
                          <>
                            {reportError && (
                              <p className="text-xs text-red-400 mb-2">
                                {reportError}
                              </p>
                            )}
                            <textarea
                              rows={2}
                              value={reportReason}
                              onChange={(e) => setReportReason(e.target.value)}
                              placeholder="Например: Спам, оскорбления..."
                              className="w-full text-xs bg-neutral-850 border border-neutral-750 rounded p-2 text-neutral-200 placeholder-neutral-500 focus:outline-none"
                              required
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => setReportingCommentId(null)}
                                className="text-[10px] text-neutral-400 hover:text-neutral-200 px-2 py-1"
                              >
                                Отмена
                              </button>
                              <button
                                type="submit"
                                className="text-[10px] bg-red-950 border border-red-800 text-red-300 px-2.5 py-1 rounded hover:bg-red-900 transition-colors"
                              >
                                Отправить
                              </button>
                            </div>
                          </>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
