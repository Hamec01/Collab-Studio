import { describe, expect, it } from "vitest";
import { resolveNotificationTarget } from "./notificationTargets";

describe("resolveNotificationTarget", () => {
  it("maps comment notifications to track team comments context", () => {
    expect(resolveNotificationTarget({
      projectId: "p1",
      trackId: "t1",
      type: "comment_created",
    })).toEqual({
      href: "/app/projects/p1/tracks/t1/team#comments",
      trackSidebar: "comments",
      projectSidebar: null,
    });
  });

  it("maps audio notifications to audio tab", () => {
    expect(resolveNotificationTarget({
      projectId: "p1",
      trackId: "t1",
      type: "audio_uploaded",
    })).toEqual({
      href: "/app/projects/p1/tracks/t1/audio",
      trackSidebar: null,
      projectSidebar: null,
    });
  });

  it("maps project chat notifications to project chat context", () => {
    expect(resolveNotificationTarget({
      projectId: "p1",
      trackId: null,
      type: "project_chat_message_created",
    })).toEqual({
      href: "/app/projects/p1#project-chat",
      trackSidebar: null,
      projectSidebar: "chat",
    });
  });

  it("maps project task notifications to project task context", () => {
    expect(resolveNotificationTarget({
      projectId: "p1",
      trackId: null,
      type: "project_task_created",
    })).toEqual({
      href: "/app/projects/p1#project-tasks",
      trackSidebar: null,
      projectSidebar: "tasks",
    });
  });
});
