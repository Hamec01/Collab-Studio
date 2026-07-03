import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { parsePrivatePath } from "./routeContract";
import { resolveRouteSelection, shouldNavigateToCanonicalPath } from "./routeSelection";

function makeProjects(): Project[] {
  const baseTrack = {
    lyrics: "",
    lyricsRevision: 0,
    tags: [],
    versionHistory: [],
    lyricVersions: [],
    audioVersions: [],
    comments: [],
    chat: [],
    tasks: [],
    annotations: [],
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };

  return [
    {
      id: "p1",
      title: "Project 1",
      type: "single",
      coverUrl: null,
      tags: [],
      currentUserRole: "owner",
      owner: null,
      participants: [],
      members: [],
      tracks: [
        { id: "t1", title: "Track 1", ...baseTrack },
        { id: "t2", title: "Track 2", ...baseTrack },
      ],
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    {
      id: "p2",
      title: "Project 2",
      type: "single",
      coverUrl: null,
      tags: [],
      currentUserRole: "owner",
      owner: null,
      participants: [],
      members: [],
      tracks: [{ id: "t3", title: "Track 3", ...baseTrack }],
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
  ];
}

describe("route selection boundary", () => {
  it("selects project/track from URL", () => {
    const projects = makeProjects();
    const parsed = parsePrivatePath("/app/projects/p1/tracks/t2/audio");
    const resolved = resolveRouteSelection(projects, parsed);

    expect(resolved.projectId).toBe("p1");
    expect(resolved.trackId).toBe("t2");
    expect(resolved.tab).toBe("audio");
    expect(resolved.canonicalPath).toBe("/app/projects/p1/tracks/t2/audio");
  });

  it("handles invalid project/track safely with fallback", () => {
    const projects = makeProjects();
    const parsed = parsePrivatePath("/app/projects/missing/tracks/unknown/versions");
    const resolved = resolveRouteSelection(projects, parsed);

    expect(resolved.projectId).toBe("p1");
    expect(resolved.trackId).toBe("t1");
    expect(resolved.tab).toBe("versions");
    expect(resolved.didFallbackProject).toBe(true);
    expect(resolved.didFallbackTrack).toBe(true);
    expect(resolved.canonicalPath).toBe("/app/projects/p1/tracks/t1/versions");
  });

  it("keeps fallback tab behavior from parser", () => {
    const projects = makeProjects();
    const parsed = parsePrivatePath("/app/projects/p2/tracks/t3/not-tab");
    const resolved = resolveRouteSelection(projects, parsed);

    expect(resolved.tab).toBe("lyrics");
    expect(resolved.canonicalPath).toBe("/app/projects/p2/tracks/t3");
  });

  it("supports back/forward without forced canonical redirects", () => {
    const projects = makeProjects();
    const backPath = "/app/projects/p1/tracks/t1";
    const forwardPath = "/app/projects/p1/tracks/t2/team";

    const backResolved = resolveRouteSelection(projects, parsePrivatePath(backPath));
    const forwardResolved = resolveRouteSelection(projects, parsePrivatePath(forwardPath));

    expect(shouldNavigateToCanonicalPath(backPath, backResolved.canonicalPath)).toBe(false);
    expect(shouldNavigateToCanonicalPath(forwardPath, forwardResolved.canonicalPath)).toBe(false);
    expect(backResolved.trackId).toBe("t1");
    expect(forwardResolved.trackId).toBe("t2");
  });

  it("avoids URL-state sync loop when canonical path already matches", () => {
    const projects = makeProjects();
    const path = "/app/projects/p1/tracks/t2/team";
    const resolved = resolveRouteSelection(projects, parsePrivatePath(path));

    expect(shouldNavigateToCanonicalPath(path, resolved.canonicalPath)).toBe(false);
  });
});
