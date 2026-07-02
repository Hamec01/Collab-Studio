import type { Project } from "../types";
import { buildPrivatePath, type ParsedPrivatePath, type TrackTab } from "./routeContract";

export type ResolvedRouteSelection = {
  projectId: string | null;
  trackId: string | null;
  tab: TrackTab;
  canonicalPath: string;
  didFallbackProject: boolean;
  didFallbackTrack: boolean;
};

export function resolveRouteSelection(projects: Project[], route: ParsedPrivatePath): ResolvedRouteSelection {
  if (projects.length === 0) {
    return {
      projectId: null,
      trackId: null,
      tab: "lyrics",
      canonicalPath: "/app",
      didFallbackProject: route.projectId !== null,
      didFallbackTrack: route.trackId !== null,
    };
  }

  const projectFromRoute = route.projectId ? projects.find((project) => project.id === route.projectId) ?? null : null;
  const selectedProject = projectFromRoute ?? projects[0];
  const didFallbackProject = Boolean(route.projectId && !projectFromRoute);

  const trackFromRoute = route.trackId
    ? selectedProject.tracks.find((track) => track.id === route.trackId) ?? null
    : null;

  const selectedTrack = trackFromRoute ?? selectedProject.tracks[0] ?? null;
  const didFallbackTrack = Boolean(route.trackId && !trackFromRoute);

  const tab: TrackTab = selectedTrack ? route.tab : "lyrics";

  const canonicalPath = buildPrivatePath({
    projectId: selectedProject.id,
    trackId: selectedTrack?.id ?? null,
    tab,
  });

  return {
    projectId: selectedProject.id,
    trackId: selectedTrack?.id ?? null,
    tab,
    canonicalPath,
    didFallbackProject,
    didFallbackTrack,
  };
}

export function shouldNavigateToCanonicalPath(currentPath: string, canonicalPath: string) {
  return currentPath !== canonicalPath;
}
