import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { updateProfileMe } from "../../api/profile";
import { isApiError } from "../../api/client";
import { useAuth } from "../../app/auth/AuthProvider";
import AppShell from "../../app/shell/AppShell";
import Button from "../../shared/ui/Button";
import StateView from "../../shared/ui/StateView";

function mapProfileError(error: unknown) {
  if (!isApiError(error)) return "Не удалось сохранить профиль.";
  if (error.status === 400) return "Проверьте поля профиля.";
  if (error.status === 401) return "Нужно заново войти в аккаунт.";
  if (error.status === 409) return "Профиль конфликтует с текущим состоянием.";
  return "Не удалось сохранить профиль.";
}

export default function ProfileSettingsPage() {
  const { authPhase, currentUser, isCheckingSession, setCurrentUserProfile, withAuth } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    setDisplayName(currentUser.displayName);
    setBio(currentUser.bio ?? "");
    setLocation(currentUser.location ?? "");
    setWebsite(currentUser.website ?? "");
    setIsPublicProfile(currentUser.isPublicProfile);
  }, [currentUser]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await withAuth(() => updateProfileMe({
        displayName: displayName.trim(),
        isPublicProfile,
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
      }));
      setCurrentUserProfile(response.user);
      setMessage("Профиль сохранён.");
    } catch (nextError) {
      setError(mapProfileError(nextError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Профиль"
      headerRight={
        <Link to="/app" className="text-sm text-indigo-300 hover:text-indigo-200">
          К проектам
        </Link>
      }
      showMobileNav={false}
      mobileNavItems={[]}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        {isCheckingSession || authPhase === "loading" ? (
          <StateView kind="loading" message="Загружаем профиль..." />
        ) : authPhase !== "authenticated" || !currentUser ? (
          <StateView kind="readOnly" message="Сначала войдите в аккаунт, затем откройте /app/profile." />
        ) : (
          <>
            {message && <StateView kind="empty" message={message} compact />}
            {error && <StateView kind="error" message={error} compact />}

            <form onSubmit={handleSubmit} className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-2xl">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Публичный профиль</h1>
                <p className="mt-2 text-sm text-neutral-400">
                  В этом slice включается только opt-in профиль. Публикации и discover будут добавлены позже.
                </p>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-300">Display name</span>
                  <input
                    aria-label="Display name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={120}
                    required
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-300">Bio</span>
                  <textarea
                    aria-label="Bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={500}
                    rows={5}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-300">Location</span>
                  <input
                    aria-label="Location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    maxLength={120}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-300">Website</span>
                  <input
                    aria-label="Website"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    inputMode="url"
                    placeholder="https://example.com"
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-white outline-none focus:border-indigo-500"
                  />
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={isPublicProfile}
                    onChange={(event) => setIsPublicProfile(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
                  />
                  <span>
                    Включить публичный профиль по адресу <span className="font-mono text-indigo-300">/u/{currentUser.username}</span>.
                  </span>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Сохраняем..." : "Сохранить профиль"}
                </Button>
                {currentUser.isPublicProfile && (
                  <a
                    href={`/u/${encodeURIComponent(currentUser.username)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-700"
                  >
                    Открыть публичную страницу
                  </a>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
