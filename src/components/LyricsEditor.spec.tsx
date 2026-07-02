import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import LyricsEditor from "./LyricsEditor";

function buildProps(overrides: Partial<React.ComponentProps<typeof LyricsEditor>> = {}): React.ComponentProps<typeof LyricsEditor> {
  return {
    draftLyrics: "line one\nline two",
    onChangeDraftLyrics: vi.fn(),
    onCreateVersion: vi.fn(async () => {}),
    onPinVersion: vi.fn(),
    versionHistory: [],
    selectedLineIndex: 0,
    onSelectLine: vi.fn(),
    trackCommentsCount: () => 1,
    canEdit: true,
    saveStatus: "idle",
    savedAt: null,
    statusMessage: "",
    restoreDraft: null,
    onRestoreLocalDraft: vi.fn(),
    onUseServerDraft: vi.fn(),
    onDownloadLocalDraft: vi.fn(),
    onJumpToDiscussion: vi.fn(),
    ...overrides,
  };
}

describe("LyricsEditor discussion flow", () => {
  it("calls onJumpToDiscussion when the Обсудить button is clicked", async () => {
    const user = userEvent.setup();
    const onJumpToDiscussion = vi.fn();
    const getByIdSpy = vi.spyOn(document, "getElementById");

    render(<LyricsEditor {...buildProps({ onJumpToDiscussion })} />);

    await user.click(screen.getByRole("button", { name: "Обсудить" }));

    expect(onJumpToDiscussion).toHaveBeenCalledTimes(1);
    expect(getByIdSpy).not.toHaveBeenCalled();
  });

  it("keeps viewer mode stable when editing is not allowed", async () => {
    const user = userEvent.setup();

    render(<LyricsEditor {...buildProps({ canEdit: false, saveStatus: "saved", selectedLineIndex: null })} />);

    expect(screen.getByText("Только чтение")).toBeInTheDocument();

    const editButtons = screen.getAllByRole("button", { name: "Редактирование" });
    await user.click(editButtons[0]);

    expect(screen.queryByPlaceholderText("Вставьте или напишите текст песни...")).not.toBeInTheDocument();
  });
});

describe("LyricsEditor recovery states", () => {
  it("shows conflict state and allows restoring local draft", async () => {
    const user = userEvent.setup();
    const onRestoreLocalDraft = vi.fn();

    render(
      <LyricsEditor
        {...buildProps({
          saveStatus: "conflict",
          restoreDraft: {
            localSavedAt: "2026-07-02T10:00:00.000Z",
            serverUpdatedAt: "2026-07-02T09:59:00.000Z",
            localPreview: "локальный",
            serverPreview: "серверный",
          },
          onRestoreLocalDraft,
          selectedLineIndex: null,
        })}
      />,
    );

    expect(screen.getByText("Конфликт черновика")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Восстановить локальный" }));

    expect(onRestoreLocalDraft).toHaveBeenCalledTimes(1);
  });
});
