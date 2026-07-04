import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "../../../app/i18n/I18nProvider";
import { LyricsDiscussionsSheet } from "./LyricsDiscussionsSheet";

function renderWithI18n(ui: ReactNode) {
  window.localStorage.setItem("collabstudio.locale", "ru");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("LyricsDiscussionsSheet", () => {
  it("renders a mobile-safe discussion sheet and closes accessibly", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithI18n(
      <LyricsDiscussionsSheet
        open
        threads={[]}
        selection={null}
        availableAnchors={[]}
        canWrite={false}
        canResolve={false}
        onClose={onClose}
        onClearSelection={vi.fn()}
        onCreateThread={vi.fn()}
        onReply={vi.fn()}
        onResolveThread={vi.fn()}
        onReanchorThread={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Контекстные комментарии к тексту" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Закрыть комментарии" })[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
