import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicProfile, followUser, unfollowUser } from "../../api/profile";
import type { PublicProfile } from "../../types";
import Avatar from "../../shared/ui/Avatar";
import StateView from "../../shared/ui/StateView";
import { useAuth } from "../../app/auth/AuthProvider";
import { useI18n } from "../../app/i18n/I18nProvider";
import { featureFlags } from "../../app/featureFlags";
import { sendDmRequest } from "../../api/dm";

function isSafePublicWebsite(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function PublicProfilePage() {
  const { handle = "" } = useParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const { currentUser } = useAuth();
  const { t } = useI18n();
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [dmText, setDmText] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmSent, setDmSent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setProfile(null);

    void getPublicProfile(handle, controller.signal)
      .then((response) => setProfile(response.profile))
      .catch(() => setError("Публичный профиль не найден или скрыт."))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [handle]);

  const handleFollowToggle = async () => {
    if (!profile || actionPending) return;

    setActionPending(true);
    const originalFollowing = profile.isFollowing;
    const originalFollowersCount = profile.followersCount;

    // Optimistic Update
    setProfile((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isFollowing: !originalFollowing,
        followersCount: originalFollowing
          ? originalFollowersCount - 1
          : originalFollowersCount + 1,
      };
    });

    try {
      if (originalFollowing) {
        await unfollowUser(profile.username);
      } else {
        await followUser(profile.username);
      }
    } catch (err) {
      // Revert on error
      setProfile((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isFollowing: originalFollowing,
          followersCount: originalFollowersCount,
        };
      });
    } finally {
      setActionPending(false);
    }
  };

  const handleSendDm = async () => {
    if (!profile || !dmText.trim() || dmSending) return;
    setDmSending(true);
    setDmError(null);
    try {
      await sendDmRequest(profile.username, dmText.trim());
      setDmSent(true);
      setDmText("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка отправки";
      setDmError(msg);
    } finally {
      setDmSending(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--cs-color-bg)] text-[var(--cs-color-text)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/app" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← Вернуться в CollabStudio
          </Link>
          <img src="/logo.png" alt="CollabStudio" className="h-10 w-auto object-contain" />
        </div>

        {loading && <StateView kind="loading" message="Загружаем публичный профиль..." />}
        {!loading && error && <StateView kind="empty" message={error} />}

        {!loading && profile && (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar src={profile.avatarUrl} name={profile.displayName} className="h-16 w-16 text-base" />
                <div>
                  <h1 className="text-2xl font-semibold text-white">{profile.displayName}</h1>
                  <p className="text-sm text-neutral-400">@{profile.username}</p>
                  
                  {/* Followers / Following counts */}
                  <div className="mt-2 flex gap-4 text-xs text-neutral-500 font-medium">
                    <span>
                      <strong className="text-neutral-300">{profile.followersCount}</strong> {t("profile.followers")}
                    </span>
                    <span>
                      <strong className="text-neutral-300">{profile.followingCount}</strong> {t("profile.following")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 sm:self-start">
                {currentUser ? (
                  currentUser.username.toLowerCase() !== profile.username.toLowerCase() && (
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={handleFollowToggle}
                      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                        profile.isFollowing
                          ? "border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                          : "bg-indigo-600 text-white hover:bg-indigo-500"
                      }`}
                    >
                      {profile.isFollowing ? t("profile.unfollow") : t("profile.follow")}
                    </button>
                  )
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-neutral-850 border border-neutral-750 px-4 py-2.5 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-850 hover:text-white"
                  >
                    {t("profile.loginToFollow")}
                  </Link>
                )}

                {/* DM Button — feature flagged */}
                {featureFlags.directMessages && currentUser && profile &&
                  currentUser.username.toLowerCase() !== profile.username.toLowerCase() && (
                    <button
                      type="button"
                      onClick={() => { setDmModalOpen(true); setDmSent(false); setDmError(null); }}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-700/40 bg-indigo-950/30 px-4 py-2.5 text-sm font-semibold text-indigo-300 transition-colors hover:bg-indigo-900/40 hover:text-indigo-200"
                    >
                      ✉ Написать
                    </button>
                  )}

                {isSafePublicWebsite(profile.website) && (
                  <button
                    type="button"
                    onClick={() => window.open(profile.website!, "_blank", "noopener,noreferrer")}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-750 bg-neutral-850 px-4 py-2.5 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                  >
                    Открыть сайт
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {profile.bio && (
                <div>
                  <h2 className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">О себе</h2>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">{profile.bio}</p>
                </div>
              )}

              {profile.location && (
                <div>
                  <h2 className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Локация</h2>
                  <p className="text-sm text-neutral-200">{profile.location}</p>
                </div>
              )}

              <div>
                <h2 className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">Статус</h2>
                <p className="text-sm text-neutral-400">Публичный профиль активен. Public works уже можно открывать по прямому slug, discover появится на следующих slices.</p>
              </div>
            </div>
          </section>
        )}

        {/* DM Request Modal */}
        {dmModalOpen && profile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Написать {profile.displayName}
              </h3>
              {dmSent ? (
                <div className="py-4 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-sm text-neutral-300">Запрос на переписку отправлен!</p>
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
                    onChange={(e) => setDmText(e.target.value)}
                    placeholder="Представьтесь и напишите зачем вы пишете…"
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
                      onClick={() => { setDmModalOpen(false); setDmText(""); }}
                      className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => void handleSendDm()}
                      disabled={!dmText.trim() || dmSending}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition-colors"
                    >
                      {dmSending ? "Отправка…" : "Отправить запрос"}
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
