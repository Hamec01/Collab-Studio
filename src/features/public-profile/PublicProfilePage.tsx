import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicProfile } from "../../api/profile";
import type { PublicProfile } from "../../types";
import Avatar from "../../shared/ui/Avatar";
import StateView from "../../shared/ui/StateView";

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
                </div>
              </div>
              {isSafePublicWebsite(profile.website) && (
                <button
                  type="button"
                  onClick={() => window.open(profile.website!, "_blank", "noopener,noreferrer")}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-700 sm:self-start"
                >
                  Открыть сайт
                </button>
              )}
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
                <p className="text-sm text-neutral-400">Публичный профиль активен. Публикации и discover появятся на следующих slices.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
