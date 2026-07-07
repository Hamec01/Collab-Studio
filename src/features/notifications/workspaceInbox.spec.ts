import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { buildWorkspaceActivity, resolveActivityTarget } from "./workspaceInbox";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Project One",
    type: "album",
    coverUrl: null,
    tags: [],
    currentUserRole: "owner",
    owner: null,
    participants: [],
    members: [],
    tracks: [],
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildWorkspaceActivity", () => {
  it("flattens and sorts project activity latest-first", () => {
    const items = buildWorkspaceActivity([
      makeProject({
        id: "p1",
        title: "P1",
        activity: [{
          id: "a1",
          projectId: "p1",
          actorId: "u1",
          actor: null,
          type: "project_chat_message_created",
          payload: {},
          createdAt: "2026-07-07T10:00:00.000Z",
          timestamp: "2026-07-07T10:00:00.000Z",
        }],
      }),
      makeProject({
        id: "p2",
        title: "P2",
        activity: [{
          id: "a2",
          projectId: "p2",
          actorId: "u2",
          actor: null,
          type: "audio_uploaded",
          payload: { trackId: "t2", trackTitle: "Track 2" },
          createdAt: "2026-07-07T11:00:00.000Z",
          timestamp: "2026-07-07T11:00:00.000Z",
        }],
      }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["a2", "a1"]);
    expect(items[0].projectName).toBe("P2");
    expect(items[0].trackName).toBe("Track 2");
  });
});

describe("resolveActivityTarget", () => {
  it("maps audio upload to track audio tab", () => {
    expect(resolveActivityTarget({
      id: "a1",
      projectId: "p1",
      projectName: "P1",
      trackId: "t1",
      trackName: "Track 1",
      actorId: "u1",
      actor: null,
      type: "audio_uploaded",
      payload: { trackId: "t1", trackTitle: "Track 1" },
      createdAt: "2026-07-07T10:00:00.000Z",
      timestamp: "2026-07-07T10:00:00.000Z",
    })).toEqual({
      href: "/app/projects/p1/tracks/t1/audio",
      trackSidebar: null,
      projectSidebar: null,
    });
  });

  it("maps track tasks to team tasks", () => {
    expect(resolveActivityTarget({
      id: "a2",
      projectId: "p1",
      projectName: "P1",
      trackId: "t1",
      trackName: "Track 1",
      actorId: "u1",
      actor: null,
      type: "track_task_updated",
      payload: { trackId: "t1", trackTitle: "Track 1" },
      createdAt: "2026-07-07T10:00:00.000Z",
      timestamp: "2026-07-07T10:00:00.000Z",
    })).toEqual({
      href: "/app/projects/p1/tracks/t1/team#tasks",
      trackSidebar: "tasks",
      projectSidebar: null,
    });
  });

  it("falls back to project activity tab for project-level events without exact context", () => {
    expect(resolveActivityTarget({
      id: "a3",
      projectId: "p1",
      projectName: "P1",
      trackId: null,
      trackName: null,
      actorId: "u1",
      actor: null,
      type: "invite_created",
      payload: {},
      createdAt: "2026-07-07T10:00:00.000Z",
      timestamp: "2026-07-07T10:00:00.000Z",
    })).toEqual({
      href: "/app/projects/p1#project-activity",
      trackSidebar: null,
      projectSidebar: "activity",
    });
  });
});
