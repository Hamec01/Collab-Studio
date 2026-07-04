import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode, $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  type TextFormatType,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LyricsBlock,
  type LyricsDocument,
  type LyricsMark,
  normalizeLyricsDocument,
  sanitizePastedLyrics,
  serializeLyricsDocument,
} from "./lyricsDocument";

export type LyricsBlockIdMap = Map<NodeKey, string>;

type StructuredLyricsEditorProps = {
  document: LyricsDocument;
  onChange: (document: LyricsDocument) => void;
  readOnly?: boolean;
  fullscreen?: boolean;
};

let blockIdSequence = 0;

function newBlockId() {
  blockIdSequence += 1;
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 16);
  return `ui_${random || `${Date.now().toString(36)}_${blockIdSequence.toString(36)}`}`;
}

export function isSupportedLyricsTextFormat(format: TextFormatType) {
  return format === "bold" || format === "italic";
}

export function shouldPublishLyricsChange(eventIsComposing: boolean, editorIsComposing: boolean) {
  return !eventIsComposing && !editorIsComposing;
}

export function $insertSanitizedLyricsPaste(payload: { plainText: string; html?: string }) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const document = sanitizePastedLyrics(payload);
  const nodes = document.blocks.map((block) => {
    const node = $createParagraphNode();
    block.children.forEach((child) => appendTextWithSoftBreaks(node, child.text, undefined));
    if (node.getChildrenSize() === 0) node.append($createTextNode(""));
    return node;
  });
  selection.insertNodes(nodes);
  return true;
}

function appendTextWithSoftBreaks(
  parent: ReturnType<typeof $createParagraphNode> | ReturnType<typeof $createHeadingNode>,
  text: string,
  marks: LyricsMark[] | undefined,
) {
  text.split("\n").forEach((part, index) => {
    if (index > 0) parent.append($createLineBreakNode());
    if (part || text === "") {
      const node = $createTextNode(part);
      marks?.forEach((mark) => node.toggleFormat(mark));
      parent.append(node);
    }
  });
}

export function loadLyricsDocument(document: LyricsDocument, blockIds: LyricsBlockIdMap) {
  const normalized = normalizeLyricsDocument(document);
  const root = $getRoot();
  root.clear();
  blockIds.clear();

  normalized.blocks.forEach((block) => {
    const node = block.type === "heading" ? $createHeadingNode("h2") : $createParagraphNode();
    block.children.forEach((child) => appendTextWithSoftBreaks(node, child.text, child.marks));
    if (node.getChildrenSize() === 0) node.append($createTextNode(""));
    root.append(node);
    blockIds.set(node.getKey(), block.id);
  });
}

function collectChildren(node: LexicalNode, target: LyricsBlock["children"]) {
  if ($isTextNode(node)) {
    const marks: LyricsMark[] = [];
    if (node.hasFormat("bold")) marks.push("bold");
    if (node.hasFormat("italic")) marks.push("italic");
    target.push(marks.length ? { text: node.getTextContent(), marks } : { text: node.getTextContent() });
    return;
  }
  if ($isLineBreakNode(node)) {
    target.push({ text: "\n" });
    return;
  }
  if ($isElementNode(node)) {
    node.getChildren().forEach((child) => collectChildren(child, target));
    return;
  }
  target.push({ text: node.getTextContent() });
}

export function readLyricsDocument(blockIds: LyricsBlockIdMap): LyricsDocument {
  const blocks = $getRoot().getChildren().map((node): LyricsBlock => {
    const children: LyricsBlock["children"] = [];
    collectChildren(node, children);
    const id = blockIds.get(node.getKey()) || newBlockId();
    blockIds.set(node.getKey(), id);
    return {
      id,
      type: $isHeadingNode(node) ? "heading" : "paragraph",
      children: children.length ? children : [{ text: "" }],
    };
  });

  return normalizeLyricsDocument({
    schemaVersion: 1,
    blocks: blocks.length ? blocks : [{ id: newBlockId(), type: "paragraph", children: [{ text: "" }] }],
  });
}

export function readEditorLyricsDocument(editor: LexicalEditor, blockIds: LyricsBlockIdMap) {
  return editor.getEditorState().read(() => readLyricsDocument(blockIds));
}

function Toolbar({ blockIds }: { blockIds: LyricsBlockIdMap }) {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const unregisterUndo = editor.registerCommand(CAN_UNDO_COMMAND, (value) => {
      setCanUndo(value);
      return false;
    }, COMMAND_PRIORITY_HIGH);
    const unregisterRedo = editor.registerCommand(CAN_REDO_COMMAND, (value) => {
      setCanRedo(value);
      return false;
    }, COMMAND_PRIORITY_HIGH);
    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  const format = (formatType: "bold" | "italic") => editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatType);
  const setBlockType = (type: "paragraph" | "heading") => {
    editor.update(() => { $setSelectedLyricsBlockType(type, blockIds); });
  };

  const buttonClass = "min-h-11 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex max-w-full flex-wrap gap-1.5" role="toolbar" aria-label="Форматирование текста">
      <button type="button" className={buttonClass} onClick={() => setBlockType("paragraph")}>Обычный текст</button>
      <button type="button" className={buttonClass} onClick={() => setBlockType("heading")}>Заголовок</button>
      <button type="button" className={buttonClass} onClick={() => format("bold")} aria-label="Полужирный"><strong>B</strong></button>
      <button type="button" className={buttonClass} onClick={() => format("italic")} aria-label="Курсив"><em>I</em></button>
      <button type="button" className={buttonClass} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} disabled={!canUndo}>Отменить</button>
      <button type="button" className={buttonClass} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} disabled={!canRedo}>Повторить</button>
    </div>
  );
}

function GuardedInputPlugin({ blockIds }: { blockIds: LyricsBlockIdMap }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterFormat = editor.registerCommand<TextFormatType>(
      FORMAT_TEXT_COMMAND,
      (format) => !isSupportedLyricsTextFormat(format),
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!("clipboardData" in event) || !event.clipboardData) return false;
        event.preventDefault();
        return $insertSanitizedLyricsPaste({ plainText: event.clipboardData.getData("text/plain") });
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        $getRoot().getChildren().forEach((node) => {
          if (!blockIds.has(node.getKey())) blockIds.set(node.getKey(), newBlockId());
        });
      });
    });
    return () => {
      unregisterFormat();
      unregisterPaste();
      unregisterUpdate();
    };
  }, [blockIds, editor]);

  return null;
}

function DocumentBridge({
  document,
  blockIds,
  onChange,
}: {
  document: LyricsDocument;
  blockIds: LyricsBlockIdMap;
  onChange: (document: LyricsDocument) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastPublished = useRef(serializeLyricsDocument(document));
  const incoming = serializeLyricsDocument(document);
  const isComposing = useRef(false);

  const publish = useCallback(() => {
    if (!shouldPublishLyricsChange(isComposing.current, editor.isComposing())) return;
    const next = readEditorLyricsDocument(editor, blockIds);
    const serialized = serializeLyricsDocument(next);
    if (serialized === lastPublished.current) return;
    lastPublished.current = serialized;
    onChange(next);
  }, [blockIds, editor, onChange]);

  useEffect(() => editor.registerUpdateListener(() => publish()), [editor, publish]);

  useEffect(() => {
    const start = () => { isComposing.current = true; };
    const end = () => {
      isComposing.current = false;
      queueMicrotask(publish);
    };
    return editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener("compositionstart", start);
      previousRoot?.removeEventListener("compositionend", end);
      root?.addEventListener("compositionstart", start);
      root?.addEventListener("compositionend", end);
    });
  }, [editor, publish]);

  useEffect(() => {
    const current = serializeLyricsDocument(readEditorLyricsDocument(editor, blockIds));
    if (incoming === current) {
      lastPublished.current = incoming;
      return;
    }
    editor.update(() => loadLyricsDocument(document, blockIds), { tag: "collabstudio-external", discrete: true });
    lastPublished.current = incoming;
  }, [blockIds, document, editor, incoming]);

  return null;
}

export function StructuredLyricsEditor({
  document,
  onChange,
  readOnly = false,
  fullscreen = false,
}: StructuredLyricsEditorProps) {
  const initialDocument = useRef(normalizeLyricsDocument(document));
  const blockIds = useRef<LyricsBlockIdMap>(new Map()).current;
  const initialConfig = useMemo(() => ({
    namespace: "CollabStudioLyrics",
    editable: !readOnly,
    nodes: [HeadingNode],
    editorState: () => loadLyricsDocument(initialDocument.current, blockIds),
    onError(error: Error) {
      throw error;
    },
    theme: {
      heading: { h2: "text-lg font-bold leading-relaxed text-white" },
      paragraph: "text-sm font-serif leading-relaxed text-neutral-200",
      text: { bold: "font-bold", italic: "italic" },
    },
  }), [blockIds, readOnly]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {!readOnly && <Toolbar blockIds={blockIds} />}
        <div className="relative min-h-0 flex-1 overflow-x-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 focus-within:border-indigo-500">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Структурированный текст песни"
                className={`min-h-[260px] max-w-full overflow-y-auto whitespace-pre-wrap break-words p-3 text-left outline-none [overflow-wrap:anywhere] ${
                  fullscreen ? "min-h-[400px] p-5 text-base" : ""
                }`}
              />
            }
            placeholder={<div className="pointer-events-none absolute left-3 top-3 text-sm text-neutral-500">Вставьте или напишите текст песни...</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <GuardedInputPlugin blockIds={blockIds} />
        <DocumentBridge document={document} blockIds={blockIds} onChange={onChange} />
      </div>
    </LexicalComposer>
  );
}

export function $setSelectedLyricsBlockType(type: "paragraph" | "heading", blockIds: LyricsBlockIdMap) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const root = $getRoot();
  const preserved = new Map<number, string>();
  selection.getNodes().forEach((node) => {
    const block = node.getTopLevelElementOrThrow();
    const index = block.getIndexWithinParent();
    const id = blockIds.get(block.getKey());
    if (id) preserved.set(index, id);
  });
  $setBlocksType(selection, () => type === "heading" ? $createHeadingNode("h2") : $createParagraphNode());
  preserved.forEach((id, index) => {
    const block = root.getChildAtIndex(index);
    if (block) blockIds.set(block.getKey(), id);
  });
  return true;
}
