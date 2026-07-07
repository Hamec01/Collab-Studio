import { buildPrivatePath } from "../../app/routeContract";
import type { ActivityEvent, Project } from "../../types";
import type { TrackSidebar } from "../track-workspace/TrackContextPanel";
import type { ProjectSidebar } from "../project-workspace/ProjectContextPanel";

export type WorkspaceActivityItem = ActivityEvent & {
  projectName: string;
  trackId: string | null;
  trackName: string | null;
};

export type ActivityTarget = {
  href: string;
  trackSidebar: TrackSidebar | null;
  projectSidebar: ProjectSidebar | null;
};

function withHash(path: string, hash: string | null) {
  return hash ? `${path}${hash}` : path;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildWorkspaceActivity(projects: Project[]) {
  return projects
    .flatMap((project) =>
      (project.activity ?? []).map<WorkspaceActivityItem>((event) => ({
        ...event,
        projectName: project.title,
        trackId: payloadString(event.payload, "trackId"),
        trackName: payloadString(event.payload, "trackTitle"),
      })),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

export function resolveActivityTarget(event: WorkspaceActivityItem): ActivityTarget {
  if (event.trackId) {
    if (event.type === "audio_uploaded") {
      return {
        href: buildPrivatePath({ projectId: event.projectId, trackId: event.trackId, tab: "audio" }),
        trackSidebar: null,
        projectSidebar: null,
      };
    }

    const trackSidebar: TrackSidebar =
      event.type.startsWith("track_task_") ? "tasks"
        : event.type === "comment_created" || event.type === "comment_resolved" ? "comments"
          : event.type === "track_chat_message_created" ? "chat"
            : "comments";

    return {
      href: withHash(buildPrivatePath({ projectId: event.projectId, trackId: event.trackId, tab: "team" }), `#${trackSidebar}`),
      trackSidebar,
      projectSidebar: null,
    };
  }

  const projectSidebar: ProjectSidebar =
    event.type === "project_chat_message_created" ? "chat"
      : event.type.startsWith("project_task_") ? "tasks"
        : "activity";

  return {
    href: withHash(buildPrivatePath({ projectId: event.projectId, trackId: null }), `#project-${projectSidebar}`),
    trackSidebar: null,
    projectSidebar,
  };
}
