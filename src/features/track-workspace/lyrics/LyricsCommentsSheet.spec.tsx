import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LyricsCommentsSheet } from "./LyricsCommentsSheet";
import { I18nProvider } from "../../../app/i18n/I18nProvider";
import type { Comment } from "../../../types";

function renderWithI18n(ui: ReactNode) {
  window.localStorage.setItem("collabstudio.locale", "ru");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: overrides.id ?? "comment-1",
    authorId: overrides.authorId ?? "user-1",
    author: overrides.author ?? "Writer",
    authorUser: overrides.authorUser ?? { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
    lineIndex: overrides.lineIndex,
    text: overrides.text ?? "Comment",
    resolved: overrides.resolved ?? false,
    resolvedById: overrides.resolvedById ?? null,
    resolvedBy: overrides.resolvedBy ?? null,
    resolvedAt: overrides.resolvedAt ?? null,
    timestamp: overrides.timestamp ?? "2026-07-06T10:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-06T10:00:00.000Z",
  };
}

describe("LyricsCommentsSheet", () => {
  it("keeps the selected lyric context when adding a mobile comment", async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();

    renderWithI18n(
      <LyricsCommentsSheet
        open
        comments={[]}
        selectedLineIndex={1}
        lyricsLines={["first", "selected lyric"]}
        canWrite
        canResolve={false}
        onClose={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onAddComment={onAddComment}
        onResolveComment={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Контекстные комментарии к тексту" })).toBeInTheDocument();
    expect(screen.getByText(/selected lyric/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Комментарий к строке 2..."), "mobile note");
    await user.click(screen.getByRole("button", { name: "Оставить" }));

    expect(onAddComment).toHaveBeenCalledWith("mobile note", 1);
  });

  it("closes from the accessible close action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithI18n(
      <LyricsCommentsSheet
        open
        comments={[]}
        selectedLineIndex={null}
        lyricsLines={[]}
        canWrite
        canResolve={false}
        onClose={onClose}
        onClearSelectedLine={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Закрыть комментарии" })[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters comments by selected line and allows resolving under existing rights", async () => {
    const user = userEvent.setup();
    const onResolveComment = vi.fn();

    renderWithI18n(
      <LyricsCommentsSheet
        open
        comments={[
          makeComment({ id: "c1", lineIndex: 1, text: "Selected line comment" }),
          makeComment({ id: "c2", lineIndex: 2, text: "Other line comment" }),
          makeComment({ id: "c3", lineIndex: undefined, text: "General comment" }),
        ]}
        selectedLineIndex={1}
        lyricsLines={["first", "selected lyric", "other lyric"]}
        canWrite
        canResolve
        onClose={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={onResolveComment}
      />,
    );

    expect(screen.getByText("Selected line comment")).toBeInTheDocument();
    expect(screen.queryByText("Other line comment")).not.toBeInTheDocument();
    expect(screen.queryByText("General comment")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Отметить как исправленное"));
    expect(onResolveComment).toHaveBeenCalledWith("c1");
  });

  it("shows read-only state when user cannot comment", () => {
    renderWithI18n(
      <LyricsCommentsSheet
        open
        comments={[]}
        selectedLineIndex={1}
        lyricsLines={["first", "selected lyric"]}
        canWrite={false}
        canResolve={false}
        onClose={vi.fn()}
        onClearSelectedLine={vi.fn()}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Комментирование недоступно")).toBeDisabled();
    expect(screen.getByText("У вас нет прав на создание комментариев.")).toBeInTheDocument();
  });

  it("closes from browser back without leaving sibling player mounted", () => {
    const onClose = vi.fn();

    renderWithI18n(
      <div>
        <div data-testid="player-mounted">player</div>
        <LyricsCommentsSheet
          open
          comments={[]}
          selectedLineIndex={1}
          lyricsLines={["first", "selected lyric"]}
          canWrite
          canResolve={false}
          onClose={onClose}
          onClearSelectedLine={vi.fn()}
          onAddComment={vi.fn()}
          onResolveComment={vi.fn()}
        />
      </div>,
    );

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("player-mounted")).toBeInTheDocument();
  });
});
