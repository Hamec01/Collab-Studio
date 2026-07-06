import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackContextPanel } from "./TrackContextPanel";
import type { AuthUser, Project, Track } from "../../types";
import type { LyricsDiscussionSelection } from "./lyrics/lyricsDiscussions";

const currentUser: AuthUser = {
  id: "user-1",
  username: "writer",
  displayName: "Writer",
  avatarUrl: null,
  email: null,
  role: "user",
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

const project: Project = {
  id: "project-1",
  title: "Project",
  type: "single",
  coverUrl: null,
  tags: [],
  currentUserRole: "editor",
  owner: null,
  participants: [],
  members: [],
  tracks: [],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

const track: Track = {
  id: "track-1",
  title: "Track",
  lyrics: "Intro\n\nFirst line",
  lyricsRevision: 1,
  tags: [],
  versionHistory: [],
  lyricVersions: [],
  audioVersions: [],
  comments: [],
  lyricsDiscussions: [{
    id: "thread-1",
    kind: "discussion",
    projectId: "project-1",
    trackId: "track-1",
    targetType: "lyrics",
    createdById: "user-1",
    createdBy: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
    resolved: false,
    resolvedById: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-07-04T12:00:00.000Z",
    updatedAt: "2026-07-04T12:00:00.000Z",
    timestamp: "2026-07-04T12:00:00.000Z",
    anchor: {
      blockId: "block_verse",
      matchedBlockId: "block_verse",
      state: "orphaned",
      quote: "First line",
      matchedText: "First line",
      prefix: null,
      suffix: null,
      startOffsetHint: 0,
      endOffsetHint: 10,
      blockPreview: "First line",
      isGeneral: false,
    },
    messages: [{
      id: "message-1",
      threadId: "thread-1",
      authorId: "user-1",
      author: "Writer",
      authorUser: { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
      body: "Anchored note",
      editedAt: null,
      deletedAt: null,
      createdAt: "2026-07-04T12:00:00.000Z",
      updatedAt: "2026-07-04T12:00:00.000Z",
      timestamp: "2026-07-04T12:00:00.000Z",
      legacy: false,
    }],
    canReply: true,
    legacyCommentId: null,
  }],
  chat: [],
  tasks: [],
  annotations: [],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

const selection: LyricsDiscussionSelection = {
  blockId: "block_verse",
  blockText: "First line",
  displayText: "First line",
  lineIndex: 2,
  quote: "First line",
  prefix: null,
  suffix: null,
  startOffsetHint: 0,
  endOffsetHint: 10,
};

function renderPanel(useLyricsDiscussions: boolean, canEdit: boolean) {
  return render(
    <TrackContextPanel
      track={track}
      project={project}
      currentUser={currentUser}
      activeSidebar="comments"
      canResolve={canEdit}
      canEdit={canEdit}
      canSend
      draftLyrics={track.lyrics}
      selectedLineIndex={2}
      discussionSelection={selection}
      discussionAnchors={[selection]}
      discussionThreads={track.lyricsDiscussions ?? []}
      useLyricsDiscussions={useLyricsDiscussions}
      onSelectSidebar={vi.fn()}
      onClearSelectedLine={vi.fn()}
      onClearDiscussionSelection={vi.fn()}
      onAddComment={vi.fn()}
      onResolveComment={vi.fn()}
      onCreateDiscussionThread={vi.fn()}
      onReplyDiscussionThread={vi.fn()}
      onResolveDiscussionThread={vi.fn()}
      onReanchorDiscussionThread={vi.fn()}
      onSendMessage={vi.fn()}
      onAddTask={vi.fn()}
      onUpdateTaskStatus={vi.fn()}
      onUnauthorized={vi.fn()}
    />,
  );
}

describe("TrackContextPanel discussions switch", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("keeps legacy comments UI when the feature flag path is off", () => {
    renderPanel(false, true);
    expect(screen.getByText("ПРАВКИ И ОБСУЖДЕНИЕ")).toBeInTheDocument();
  });

  it("renders the discussions UI read-only for viewers and writable for editors", () => {
    const { rerender } = renderPanel(true, false);
    expect(screen.getByPlaceholderText("Новый тред к выбранному anchor...")).toBeDisabled();

    rerender(
      <TrackContextPanel
        track={track}
        project={project}
        currentUser={currentUser}
        activeSidebar="comments"
        canResolve
        canEdit
        canSend
        draftLyrics={track.lyrics}
        selectedLineIndex={2}
        discussionSelection={selection}
        discussionAnchors={[selection]}
        discussionThreads={track.lyricsDiscussions ?? []}
        useLyricsDiscussions
        onSelectSidebar={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onClearDiscussionSelection={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onCreateDiscussionThread={vi.fn()}
        onReplyDiscussionThread={vi.fn()}
        onResolveDiscussionThread={vi.fn()}
        onReanchorDiscussionThread={vi.fn()}
        onSendMessage={vi.fn()}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Новый тред к выбранному anchor...")).toBeEnabled();
  });

  it("supports manual re-anchor from the discussions panel", async () => {
    const user = userEvent.setup();
    const onReanchorDiscussionThread = vi.fn();
    render(
      <TrackContextPanel
        track={track}
        project={project}
        currentUser={currentUser}
        activeSidebar="comments"
        canResolve
        canEdit
        canSend
        draftLyrics={track.lyrics}
        selectedLineIndex={2}
        discussionSelection={selection}
        discussionAnchors={[selection]}
        discussionThreads={track.lyricsDiscussions ?? []}
        useLyricsDiscussions
        onSelectSidebar={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onClearDiscussionSelection={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onCreateDiscussionThread={vi.fn()}
        onReplyDiscussionThread={vi.fn()}
        onResolveDiscussionThread={vi.fn()}
        onReanchorDiscussionThread={onReanchorDiscussionThread}
        onSendMessage={vi.fn()}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Перепривязать/i }));
    expect(onReanchorDiscussionThread).toHaveBeenCalledWith("thread-1", selection);
  });

  it("disables track chat input for viewers", async () => {
    render(
      <TrackContextPanel
        track={track}
        project={project}
        currentUser={currentUser}
        activeSidebar="chat"
        canResolve={false}
        canEdit={false}
        canSend={false}
        draftLyrics={track.lyrics}
        selectedLineIndex={null}
        discussionSelection={null}
        discussionAnchors={[]}
        discussionThreads={track.lyricsDiscussions ?? []}
        useLyricsDiscussions={false}
        onSelectSidebar={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onClearDiscussionSelection={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onCreateDiscussionThread={vi.fn()}
        onReplyDiscussionThread={vi.fn()}
        onResolveDiscussionThread={vi.fn()}
        onReanchorDiscussionThread={vi.fn()}
        onSendMessage={vi.fn()}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Чат доступен только редакторам")).toBeDisabled();
  });
});
