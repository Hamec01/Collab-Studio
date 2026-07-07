import type { AppNotification } from "../../types";
import { buildPrivatePath } from "../../app/routeContract";
import type { TrackSidebar } from "../track-workspace/TrackContextPanel";
import type { ProjectSidebar } from "../project-workspace/ProjectContextPanel";

export type NotificationTarget = {
  href: string;
  trackSidebar: TrackSidebar | null;
  projectSidebar: ProjectSidebar | null;
};

function withHash(path: string, hash: string | null) {
  return hash ? `${path}${hash}` : path;
}

export function resolveNotificationTarget(notification: Pick<AppNotification, "projectId" | "trackId" | "type">): NotificationTarget {
  if (notification.trackId) {
    if (notification.type === "audio_uploaded") {
      return {
        href: buildPrivatePath({ projectId: notification.projectId, trackId: notification.trackId, tab: "audio" }),
        trackSidebar: null,
        projectSidebar: null,
      };
    }

    const trackSidebar: TrackSidebar =
      notification.type === "comment_created" ? "comments"
        : notification.type.includes("task") ? "tasks"
          : notification.type.includes("chat") ? "chat"
            : "comments";

    return {
      href: withHash(buildPrivatePath({ projectId: notification.projectId, trackId: notification.trackId, tab: "team" }), `#${trackSidebar}`),
      trackSidebar,
      projectSidebar: null,
    };
  }

  const projectSidebar: ProjectSidebar =
    notification.type.includes("task") ? "tasks" : "chat";

  return {
    href: withHash(buildPrivatePath({ projectId: notification.projectId, trackId: null }), `#project-${projectSidebar}`),
    trackSidebar: null,
    projectSidebar,
  };
}
