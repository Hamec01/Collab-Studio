import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchDiscoverPublications } from "../../api/discover";
import type { PrivatePublication } from "../../types";
import Avatar from "../../shared/ui/Avatar";

export default function DiscoverPage() {
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
    <div className="min-h-dvh bg-[var(--cs-color-bg)] text-[var(--cs-color-text)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <h1 className="text-xl font-bold tracking-tight">Discover</h1>
          <div className="flex items-center gap-4">
            <Link to="/app" className="text-sm font-semibold text-neutral-400 hover:text-white">
              Studio
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        {/* Filters & Search */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 focus-within:border-neutral-700">
            <span className="text-neutral-500">🔍</span>
            <input
              type="text"
              placeholder="Search works & collabs..."
              value={q}
              onChange={handleSearchChange}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-neutral-600"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            <button
              onClick={() => setKind("")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                !kind ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setKind("WORK")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                kind === "WORK" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              Works
            </button>
            <button
              onClick={() => setKind("COLLAB")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                kind === "COLLAB" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              Collabs
            </button>
            <div className="h-4 w-px bg-neutral-700 mx-2" />
            <button
              onClick={toggleFeatured}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isFeatured ? "bg-pink-900/40 text-pink-300" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              ⭐ Featured
            </button>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-neutral-500">Loading...</div>
        ) : publications.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
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
                  className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 transition-all hover:border-neutral-700 hover:bg-neutral-900"
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
      </main>
    </div>
  );
}
