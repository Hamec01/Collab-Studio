import { describe, expect, it } from "vitest";
import { serializeLegacyCommentAsDiscussion, serializeLyricsDiscussionThread } from "./discussions";
import type { LyricsDocument } from "../../features/track-workspace/lyrics/lyricsDocument";

const document: LyricsDocument = {
  schemaVersion: 1,
  blocks: [
    { id: "block_intro", type: "heading", children: [{ text: "Intro" }] },
    { id: "block_verse", type: "paragraph", children: [{ text: "First line\nSecond line" }] },
  ],
};

describe("discussion serializers", () => {
  it("serializes a general lyrics thread with one message", () => {
    const thread = serializeLyricsDiscussionThread({
      id: "thread-general",
      projectId: "project-1",
      trackId: "track-1",
      targetType: "lyrics" as const,
      createdById: "user-1",
      resolvedById: null,
      sourceLyricVersionId: null,
      sourceLyricsRevision: 7,
      anchorBlockId: null,
      anchorStartOffsetHint: null,
      anchorEndOffsetHint: null,
      anchorQuote: null,
      anchorPrefix: null,
      anchorSuffix: null,
      resolvedAt: null,
      createdAt: new Date("2026-07-04T12:00:00.000Z"),
      updatedAt: new Date("2026-07-04T12:00:00.000Z"),
      createdBy: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
      resolvedBy: null,
      messages: [{
        id: "message-1",
        threadId: "thread-general",
        authorId: "user-1",
        body: "General note",
        editedAt: null,
        deletedAt: null,
        createdAt: new Date("2026-07-04T12:00:00.000Z"),
        updatedAt: new Date("2026-07-04T12:00:00.000Z"),
        author: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
      }],
    }, document);

    expect(thread.anchor.isGeneral).toBe(true);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].body).toBe("General note");
  });

  it("serializes an anchored thread with replies and resolve/reopen states", () => {
    const base = {
      id: "thread-anchored",
      projectId: "project-1",
      trackId: "track-1",
      targetType: "lyrics" as const,
      createdById: "user-1",
      sourceLyricVersionId: null,
      sourceLyricsRevision: 7,
      anchorBlockId: "block_verse",
      anchorStartOffsetHint: 0,
      anchorEndOffsetHint: 10,
      anchorQuote: "First line",
      anchorPrefix: null,
      anchorSuffix: null,
      createdAt: new Date("2026-07-04T12:00:00.000Z"),
      updatedAt: new Date("2026-07-04T12:01:00.000Z"),
      createdBy: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
      messages: [
        {
          id: "message-1",
          threadId: "thread-anchored",
          authorId: "user-1",
          body: "Anchored note",
          editedAt: null,
          deletedAt: null,
          createdAt: new Date("2026-07-04T12:00:00.000Z"),
          updatedAt: new Date("2026-07-04T12:00:00.000Z"),
          author: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
        },
        {
          id: "message-2",
          threadId: "thread-anchored",
          authorId: "user-2",
          body: "Reply note",
          editedAt: null,
          deletedAt: null,
          createdAt: new Date("2026-07-04T12:01:00.000Z"),
          updatedAt: new Date("2026-07-04T12:01:00.000Z"),
          author: { id: "user-2", username: "editor", displayName: "Editor", avatarUrl: null },
        },
      ],
    };

    const resolved = serializeLyricsDiscussionThread({
      ...base,
      resolvedById: "user-2",
      resolvedAt: new Date("2026-07-04T12:02:00.000Z"),
      resolvedBy: { id: "user-2", username: "editor", displayName: "Editor", avatarUrl: null },
    }, document);
    expect(resolved.resolved).toBe(true);
    expect(resolved.messages).toHaveLength(2);
    expect(resolved.anchor.state).toBe("exact");

    const reopened = serializeLyricsDiscussionThread({
      ...base,
      resolvedById: null,
      resolvedAt: null,
      resolvedBy: null,
    }, document);
    expect(reopened.resolved).toBe(false);
  });

  it("bridges legacy comments by line index and keeps deleted authors safe", () => {
    const legacy = serializeLegacyCommentAsDiscussion({
      id: "comment-1",
      trackId: "track-1",
      authorId: null,
      resolvedById: null,
      lineIndex: 2,
      text: "Legacy comment",
      resolved: false,
      resolvedAt: null,
      createdAt: new Date("2026-07-04T11:00:00.000Z"),
      updatedAt: new Date("2026-07-04T11:00:00.000Z"),
      author: null,
      resolvedBy: null,
    }, document);

    expect(legacy.kind).toBe("legacy_comment");
    expect(legacy.anchor.legacyLineIndex).toBe(2);
    expect(legacy.anchor.blockId).toBe("block_verse");
    expect(legacy.messages[0].author).toBe("Deleted user");
  });
});
