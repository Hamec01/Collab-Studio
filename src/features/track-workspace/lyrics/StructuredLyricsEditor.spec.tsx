import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { HeadingNode } from "@lexical/rich-text";
import { render, screen } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { describe, expect, it, vi } from "vitest";
import {
  $setSelectedLyricsBlockType,
  $insertSanitizedLyricsPaste,
  type LyricsBlockIdMap,
  StructuredLyricsEditor,
  isSupportedLyricsTextFormat,
  loadLyricsDocument,
  readEditorLyricsDocument,
  shouldPublishLyricsChange,
} from "./StructuredLyricsEditor";
import {
  type LyricsDocument,
  lyricsDocumentToPlainText,
  serializeLyricsDocument,
} from "./lyricsDocument";

const initialDocument: LyricsDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: "heading_001",
      type: "heading",
      children: [{ text: "Title", marks: ["bold"] }],
    },
    {
      id: "paragraph_001",
      type: "paragraph",
      children: [{ text: "First line", marks: ["italic"] }],
    },
  ],
};

function createLyricsEditor(document: LyricsDocument = initialDocument) {
  const blockIds: LyricsBlockIdMap = new Map();
  const editor = createEditor({
    namespace: "CollabStudioLyricsTest",
    nodes: [HeadingNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.update(() => loadLyricsDocument(document, blockIds), { discrete: true });
  return { editor, blockIds };
}

describe("StructuredLyricsEditor adapter", () => {
  it("renders only the limited toolbar and stays width-safe for mobile keyboards", () => {
    const { rerender } = render(
      <StructuredLyricsEditor document={initialDocument} onChange={vi.fn()} />,
    );

    const editor = screen.getByRole("textbox", { name: "Структурированный текст песни" });
    expect(editor).toHaveClass("max-w-full", "overflow-y-auto", "break-words");
    expect(editor.querySelector("h2 strong")).toHaveTextContent("Title");
    expect(editor.querySelector("p em")).toHaveTextContent("First line");
    expect(screen.getByRole("toolbar", { name: "Форматирование текста" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeDisabled();

    rerender(<StructuredLyricsEditor document={initialDocument} onChange={vi.fn()} readOnly />);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("round-trips heading, bold and italic while preserving block IDs", () => {
    const { editor, blockIds } = createLyricsEditor();
    expect(readEditorLyricsDocument(editor, blockIds)).toEqual(initialDocument);
    editor.update(() => {
      $getRoot().getChildAtIndex(1)?.selectStart();
      expect($setSelectedLyricsBlockType("heading", blockIds)).toBe(true);
    }, { discrete: true });
    expect(readEditorLyricsDocument(editor, blockIds).blocks[1]).toMatchObject({
      id: "paragraph_001",
      type: "heading",
    });

    editor.update(() => {
      const secondBlock = $getRoot().getChildAtIndex(1);
      if (!$isElementNode(secondBlock)) throw new Error("Expected paragraph");
      const text = secondBlock.getFirstChild();
      if (!$isTextNode(text)) throw new Error("Expected text");
      text.setTextContent("Changed");
      text.toggleFormat("bold");
    }, { discrete: true });

    const saved = readEditorLyricsDocument(editor, blockIds);
    expect(saved.blocks.map((block) => block.id)).toEqual(["heading_001", "paragraph_001"]);
    expect(saved.blocks[1]).toEqual({
      id: "paragraph_001",
      type: "heading",
      children: [{ text: "Changed", marks: ["bold", "italic"] }],
    });
  });

  it("supports undo and redo through Lexical history", async () => {
    const empty: LyricsDocument = {
      schemaVersion: 1,
      blocks: [{ id: "paragraph_empty", type: "paragraph", children: [{ text: "" }] }],
    };
    const { editor, blockIds } = createLyricsEditor(empty);
    const historyState = createEmptyHistoryState();
    historyState.current = { editor, editorState: editor.getEditorState() };
    const unregister = registerHistory(editor, historyState, 0);

    editor.update(() => {
      const block = $getRoot().getFirstChild();
      if (!$isElementNode(block)) throw new Error("Expected paragraph");
      block.clear();
      block.append($createTextNode("Verse"));
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    await Promise.resolve();
    expect(lyricsDocumentToPlainText(readEditorLyricsDocument(editor, blockIds))).toBe("Verse");

    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(lyricsDocumentToPlainText(readEditorLyricsDocument(editor, blockIds))).toBe("");

    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(lyricsDocumentToPlainText(readEditorLyricsDocument(editor, blockIds))).toBe("Verse");
    unregister();
  });

  it("sanitizes plain and rich paste and rejects unsupported formatting", () => {
    const { editor, blockIds } = createLyricsEditor();
    editor.update(() => {
      $getRoot().getFirstChildOrThrow().selectEnd();
      expect($insertSanitizedLyricsPaste({
        plainText: "safe\r\ntext\r\n\r\nsecond\u0000",
        html: "<img src=x onerror=alert(1)><u>unsafe</u>",
      })).toBe(true);
    }, { discrete: true });

    const saved = readEditorLyricsDocument(editor, blockIds);
    const serialized = serializeLyricsDocument(saved);
    expect(serialized).toContain("safe\\ntext");
    expect(saved.blocks.some((block) => block.children.map((child) => child.text).join("").endsWith("safe\ntext"))).toBe(true);
    expect(saved.blocks.some((block) => block.children.map((child) => child.text).join("") === "second")).toBe(true);
    expect(serialized).not.toMatch(/img|onerror|underline|unsafe/);
    expect(isSupportedLyricsTextFormat("bold")).toBe(true);
    expect(isSupportedLyricsTextFormat("italic")).toBe(true);
    expect(isSupportedLyricsTextFormat("underline")).toBe(false);
  });

  it("suppresses changes throughout IME composition", () => {
    expect(shouldPublishLyricsChange(false, false)).toBe(true);
    expect(shouldPublishLyricsChange(true, false)).toBe(false);
    expect(shouldPublishLyricsChange(false, true)).toBe(false);
  });
});
