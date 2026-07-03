import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LyricsCommentsSheet } from "./LyricsCommentsSheet";
import { I18nProvider } from "../../../app/i18n/I18nProvider";

function renderWithI18n(ui: ReactNode) {
  window.localStorage.setItem("collabstudio.locale", "ru");
  return render(<I18nProvider>{ui}</I18nProvider>);
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
});
