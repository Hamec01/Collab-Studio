export const PRIVATE_APP_ROOT = "/app";

export const TRACK_TABS = ["lyrics", "audio", "team", "versions"] as const;

export type TrackTab = (typeof TRACK_TABS)[number];

export type ParsedPrivatePath = {
  projectId: string | null;
  trackId: string | null;
  tab: TrackTab;
  isCanonical: boolean;
};

function isTrackTab(value: string): value is TrackTab {
  return TRACK_TABS.includes(value as TrackTab);
}

function normalizeSegment(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parsePrivatePath(pathname: string): ParsedPrivatePath {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments[0] !== "app") {
    return {
      projectId: null,
      trackId: null,
      tab: "lyrics",
      isCanonical: pathname === PRIVATE_APP_ROOT,
    };
  }

  if (segments.length === 1) {
    return { projectId: null, trackId: null, tab: "lyrics", isCanonical: pathname === PRIVATE_APP_ROOT };
  }

  if (segments[1] !== "projects") {
    return {
      projectId: null,
      trackId: null,
      tab: "lyrics",
      isCanonical: false,
    };
  }

  if (segments.length === 2) {
    return { projectId: null, trackId: null, tab: "lyrics", isCanonical: pathname === "/app/projects" };
  }

  const projectId = normalizeSegment(segments[2]);
  if (!projectId) {
    return { projectId: null, trackId: null, tab: "lyrics", isCanonical: false };
  }

  if (segments.length === 3) {
    return { projectId, trackId: null, tab: "lyrics", isCanonical: pathname === `/app/projects/${projectId}` };
  }

  if (segments[3] !== "tracks") {
    return { projectId, trackId: null, tab: "lyrics", isCanonical: false };
  }

  const trackId = normalizeSegment(segments[4]);
  if (!trackId) {
    return { projectId, trackId: null, tab: "lyrics", isCanonical: false };
  }

  if (segments.length === 5) {
    return {
      projectId,
      trackId,
      tab: "lyrics",
      isCanonical: pathname === `/app/projects/${projectId}/tracks/${trackId}`,
    };
  }

  const rawTab = segments[5];
  const tab = isTrackTab(rawTab) ? rawTab : "lyrics";
  const isCanonical = isTrackTab(rawTab)
    ? pathname === `/app/projects/${projectId}/tracks/${trackId}/${rawTab}`
    : false;

  return {
    projectId,
    trackId,
    tab,
    isCanonical,
  };
}

export function buildPrivatePath(params: { projectId: string | null; trackId: string | null; tab?: TrackTab }): string {
  const { projectId, trackId, tab = "lyrics" } = params;

  if (!projectId) return PRIVATE_APP_ROOT;
  if (!trackId) return `/app/projects/${projectId}`;
  if (tab === "lyrics") return `/app/projects/${projectId}/tracks/${trackId}`;

  return `/app/projects/${projectId}/tracks/${trackId}/${tab}`;
}

export function tabFromMobileState(mobileTab: "projects" | "editor" | "rightPanel"): TrackTab {
  if (mobileTab === "rightPanel") return "team";
  return "lyrics";
}

export function mobileStateFromTab(tab: TrackTab): "projects" | "editor" | "rightPanel" {
  if (tab === "team") return "rightPanel";
  return "editor";
}
