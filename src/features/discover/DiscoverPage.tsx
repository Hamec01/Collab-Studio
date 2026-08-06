import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchDiscoverPublications } from "../../api/discover";
import type { PrivatePublication } from "../../types";
import Avatar from "../../shared/ui/Avatar";
import AppShell from "../../app/shell/AppShell";
import { useAuth } from "../../app/auth/AuthProvider";

export default function DiscoverPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publications, setPublications] = useState<PrivatePublication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const q = searchParams.get("q") || "";
  const kind = (searchParams.get("kind") as "WORK" | "COLLAB" | null) || "";
  const isFeatured = searchParams.get("isFeatured") === "true";

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    searchDiscoverPublications({
      q: q || undefined,
      kind: kind || undefined,
      isFeatured: isFeatured ? "true" : undefined,
    })
      .then((res) => {
        if (active) {
          setPublications(res.publications);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load publications:", err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [q, kind, isFeatured]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newParams = new URLSearchParams(searchParams);
    if (e.target.value) {
      newParams.set("q", e.target.value);
    } else {
      newParams.delete("q");
    }
    setSearchParams(newParams);
  };

  const setKind = (newKind: "" | "WORK" | "COLLAB") => {
    const newParams = new URLSearchParams(searchParams);
    if (newKind) {
      newParams.set("kind", newKind);
    } else {
      newParams.delete("kind");
    }
    setSearchParams(newParams);
  };

  const toggleFeatured = () => {
    const newParams = new URLSearchParams(searchParams);
    if (isFeatured) {
      newParams.delete("isFeatured");
    } else {
      newParams.set("isFeatured", "true");
    }
    setSearchParams(newParams);
  };

  return (
    <AppShell
      title="Главная"
      headerRight={!currentUser ? (
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-neutral-300 hover:text-white transition-colors">
            Вход
          </Link>
          <Link to="/register" className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-800 transition-colors">
            Регистрация
          </Link>
        </div>
      ) : undefined}
      currentUser={currentUser}
    >
      <div className="studio-page">
        <div className="studio-page__header">
          <div>
            <span className="studio-page__eyebrow">Discover</span>
            <h1 className="studio-page__title">Главная</h1>
            <p className="studio-page__subtitle">Публичные работы, коллабы и свежие релизы в едином Studio-стиле.</p>
          </div>
        </div>

        <div className="studio-surface studio-surface--section mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-800/70 bg-neutral-900/40 px-4 focus-within:border-indigo-500/50">
            <span className="text-neutral-500">🔍</span>
            <input
              type="text"
              placeholder="Search works & collabs..."
              value={q}
              onChange={handleSearchChange}
              className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-600"
            />
          </div>

          <div className="studio-toolbar overflow-x-auto pb-2 sm:pb-0">
            <button
              onClick={() => setKind("")}
              className={`studio-chip transition-colors ${
                !kind ? "is-active" : "hover:bg-neutral-800/70"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setKind("WORK")}
              className={`studio-chip transition-colors ${
                kind === "WORK" ? "is-active" : "hover:bg-neutral-800/70"
              }`}
            >
              Works
            </button>
            <button
              onClick={() => setKind("COLLAB")}
              className={`studio-chip transition-colors ${
                kind === "COLLAB" ? "is-active" : "hover:bg-neutral-800/70"
              }`}
            >
              Collabs
            </button>
            <div className="h-4 w-px bg-neutral-700 mx-2" />
            <button
              onClick={toggleFeatured}
              className={`studio-chip transition-colors ${
                isFeatured ? "is-active" : "hover:bg-neutral-800/70"
              }`}
            >
              ⭐ Featured
            </button>
          </div>
        </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="studio-surface studio-empty">Loading...</div>
        ) : publications.length === 0 ? (
          <div className="studio-surface studio-empty">
            <p className="text-lg font-semibold text-neutral-300">No results found</p>
            <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {publications.map((pub) => {
              const url = pub.kind === "COLLAB" ? `/collabs/${pub.slug}` : `/works/${pub.slug}`;
              return (
                <Link
                  key={pub.id}
                  to={url}
                  className="studio-surface studio-surface--soft group flex flex-col overflow-hidden rounded-2xl transition-all hover:border-neutral-700 hover:bg-neutral-900/90"
                >
                  <div className="aspect-video w-full bg-neutral-800 relative">
                    {pub.coverImageUrl ? (
                      <img src={pub.coverImageUrl} alt={pub.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl text-neutral-700">
                        🎵
                      </div>
                    )}
                    {pub.kind === "COLLAB" && (
                      <div className="absolute top-2 right-2 rounded bg-indigo-500/90 px-2 py-1 text-xs font-bold text-white backdrop-blur">
                        COLLAB
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-1 font-bold text-neutral-200 group-hover:text-white">{pub.title}</h3>
                    <p className="mt-1 line-clamp-2 flex-1 text-sm text-neutral-500">{pub.description || "No description"}</p>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar src={pub.author.avatarUrl} name={pub.author.displayName} className="h-6 w-6 text-xs" />
                        <span className="truncate text-xs font-medium text-neutral-400">
                          {pub.author.displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                        <span className="flex items-center gap-1">▶ {pub.playCount}</span>
                        <span className="flex items-center gap-1">❤ {pub.likeCount}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
