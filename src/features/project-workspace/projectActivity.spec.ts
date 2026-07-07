import { describe, expect, it } from "vitest";
import { formatActivityEventSummary } from "./projectActivity";
import type { ActivityEvent } from "../../types";

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "event-1",
    projectId: "project-1",
    actorId: "user-1",
    actor: {
      id: "user-1",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
    },
    type: "project_chat_message_created",
    payload: {},
    createdAt: "2026-07-07T10:00:00.000Z",
    timestamp: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

describe("formatActivityEventSummary", () => {
  it("formats comment events with track title", () => {
    expect(formatActivityEventSummary(makeEvent({
      type: "comment_created",
      payload: { trackTitle: "Track A" },
    }))).toContain("треке «Track A»");
  });

  it("formats audio uploads with version number and filename", () => {
    expect(formatActivityEventSummary(makeEvent({
      type: "audio_uploaded",
      payload: {
        trackTitle: "Track B",
        versionNumber: 2,
        originalFilename: "mix.wav",
      },
    }))).toContain("v2: mix.wav");
  });

  it("falls back for unknown event types", () => {
    expect(formatActivityEventSummary(makeEvent({ type: "custom_event" }))).toContain("custom_event");
  });
});
