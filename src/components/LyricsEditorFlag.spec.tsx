import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../app/i18n/I18nProvider";
import type { LyricsDocument } from "../features/track-workspace/lyrics/lyricsDocument";
import LyricsEditor from "./LyricsEditor";

const document: LyricsDocument = {
  schemaVersion: 1,
  blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "structured" }] }],
};

function renderEditor(
  structuredEditorEnabled: boolean,
  overrides: Partial<React.ComponentProps<typeof LyricsEditor>> = {},
) {
  render(
    <I18nProvider>
      <LyricsEditor
        draftLyrics="plain fallback"
        draftDocument={document}
        structuredEditorEnabled={structuredEditorEnabled}
        onChangeDraftLyrics={vi.fn()}
        onChangeDraftDocument={vi.fn()}
        onCreateVersion={vi.fn(async () => {})}
        onPinVersion={vi.fn()}
        versionHistory={[]}
        selectedLineIndex={null}
        onSelectLine={vi.fn()}
        trackCommentsCount={() => 0}
        canEdit
        isEditing
        editState="editing"
        onStartEdit={vi.fn(async () => true)}
        onStopEdit={vi.fn()}
        saveStatus="idle"
        restoreDraft={null}
        onRestoreLocalDraft={vi.fn()}
        onUseServerDraft={vi.fn()}
        onDownloadLocalDraft={vi.fn()}
        onJumpToDiscussion={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe("LyricsEditor structured feature flag", () => {
  it("keeps the Stage 4A textarea fallback when disabled", () => {
    renderEditor(false);
    expect(screen.getByPlaceholderText("Вставьте или напишите текст песни...")).toHaveValue("plain fallback");
    expect(screen.queryByRole("textbox", { name: "Структурированный текст песни" })).not.toBeInTheDocument();
  });

  it("uses the structured adapter only when enabled", async () => {
    renderEditor(true);
    expect(await screen.findByRole("textbox", { name: "Структурированный текст песни" })).toHaveTextContent("structured");
    expect(screen.queryByPlaceholderText("Вставьте или напишите текст песни...")).not.toBeInTheDocument();
  });
});

  it("leaves the structured surface on lease loss and keeps the local status visible", () => {
    renderEditor(true, {
      isEditing: false,
      editState: "lost",
      saveStatus: "local",
      statusMessage: "Сеанс редактирования истёк — черновик сохранён локально",
    });
    expect(screen.queryByRole("textbox", { name: "Структурированный текст песни" })).not.toBeInTheDocument();
    expect(screen.getByText(/черновик сохранён локально/)).toBeInTheDocument();
  });
