import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Eye, Save, History, MessageSquare, Maximize2, Minimize2, ArrowRight } from "lucide-react";
import { LyricVersion } from "../types";
import { useI18n } from "../app/i18n/I18nProvider";
import type { LyricsEditState } from "../features/track-workspace/lyrics/useLyricsEditLease";
import type { LyricsDiscussionSelection, LyricsLineAnchor } from "../features/track-workspace/lyrics/lyricsDiscussions";
import { selectionFromLineAnchor, selectionFromRange } from "../features/track-workspace/lyrics/lyricsDiscussions";
import type { LyricsDocument } from "../features/track-workspace/lyrics/lyricsDocument";

const StructuredLyricsEditor = React.lazy(async () => {
  const adapter = await import("../features/track-workspace/lyrics/StructuredLyricsEditor");
  return { default: adapter.StructuredLyricsEditor };
});

export type LyricsSaveStatus = "idle" | "dirty" | "saving" | "saved" | "local" | "error" | "conflict";

export type RestoreDraftSnapshot = {
  localSavedAt: string;
  serverUpdatedAt: string;
  localPreview: string;
  serverPreview: string;
};

interface LyricsEditorProps {
  draftLyrics: string;
  draftDocument?: LyricsDocument;
  structuredEditorEnabled?: boolean;
  onChangeDraftLyrics: (newLyrics: string) => void;
  onChangeDraftDocument?: (document: LyricsDocument) => void;
  onCreateVersion: (label: string) => Promise<void>;
  onRestoreVersion: (version: LyricVersion) => Promise<boolean>;
  onExportTxt: (version: LyricVersion | null) => void;
  onPinVersion?: (versionId: string) => void;
  versionHistory: LyricVersion[];
  selectedLineIndex: number | null;
  onSelectLine: (index: number | null) => void;
  lineAnchors?: LyricsLineAnchor[];
  onChangeDiscussionSelection?: (selection: LyricsDiscussionSelection | null) => void;
  trackCommentsCount: (lineIdx: number) => number;
  canEdit: boolean;
  isEditing: boolean;
  editState: LyricsEditState;
  onStartEdit: () => Promise<boolean>;
  onStopEdit: () => void;
  saveStatus: LyricsSaveStatus;
  savedAt?: string | null;
  statusMessage?: string;
  restoreDraft: RestoreDraftSnapshot | null;
  onRestoreLocalDraft: () => void;
  onUseServerDraft: () => void;
  onDownloadLocalDraft: () => void;
  onJumpToDiscussion: () => void;
}

export default function LyricsEditor({
  draftLyrics,
  draftDocument,
  structuredEditorEnabled = false,
  onChangeDraftLyrics,
  onChangeDraftDocument,
  onCreateVersion,
  onRestoreVersion,
  onExportTxt,
  onPinVersion,
  versionHistory = [],
  isEditing,
  editState,
  onStartEdit,
  onStopEdit,
  selectedLineIndex,
  onSelectLine,
  lineAnchors,
  onChangeDiscussionSelection,
  trackCommentsCount,
  canEdit,
  saveStatus,
  savedAt,
  statusMessage,
  restoreDraft,
  onRestoreLocalDraft,
  onUseServerDraft,
  onDownloadLocalDraft,
  onJumpToDiscussion,
}: LyricsEditorProps) {
  const { t } = useI18n();
  const [versionLabel, setVersionLabel] = useState("");
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("current");
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const activeVersion = versionHistory.find((v) => v.id === selectedVersionId);
  const displayedLyrics = activeVersion ? activeVersion.lyrics : draftLyrics;
  const lines = displayedLyrics.split("\n");
  const renderedLines: LyricsLineAnchor[] = structuredEditorEnabled && lineAnchors?.length
    ? lineAnchors
    : lines.map((lineText, lineIndex) => ({
        lineIndex,
        blockId: null,
        blockText: null,
        lineText,
        lineStartOffset: null,
        lineEndOffset: null,
        separator: false,
      }));

  const saveStatusLabel = useMemo(() => {
    if (!canEdit) return "Только чтение";
    if (saveStatus === "saving") return "Сохранение...";
    if (saveStatus === "saved") {
      if (!savedAt) return "Сохранено";
      const dt = new Date(savedAt);
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      return `Сохранено в ${hh}:${mm}`;
    }
    if (saveStatus === "local") return "Нет соединения - сохранено локально";
    if (saveStatus === "error") return "Ошибка сохранения";
    if (saveStatus === "conflict") return "Конфликт черновика";
    if (saveStatus === "dirty") return "Есть несохраненные изменения";
    return "";
  }, [canEdit, saveStatus, savedAt]);

  const saveStatusTone = useMemo(() => {
    if (!canEdit) return "text-neutral-500";
    if (saveStatus === "saved") return "text-emerald-400";
    if (saveStatus === "saving") return "text-indigo-300";
    if (saveStatus === "local") return "text-amber-400";
    if (saveStatus === "error" || saveStatus === "conflict") return "text-red-400";
    if (saveStatus === "dirty") return "text-neutral-300";
    return "text-neutral-500";
  }, [canEdit, saveStatus]);

  const handleCreateVersion = async () => {
    if (!canEdit || isCreatingVersion) return;
    const label = versionLabel.trim() || "Ручная версия";
    setIsCreatingVersion(true);
    try {
      await onCreateVersion(label);
      setVersionLabel("");
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleStartEdit = async () => {
    if (!canEdit) return false;
    const acquired = await onStartEdit();
    if (acquired) setSelectedVersionId("current");
    return acquired;
  };

  const handleRestoreVersion = async (version: LyricVersion) => {
    if (!canEdit || restoringVersionId) return;
    setRestoringVersionId(version.id);
    try {
      const restored = await onRestoreVersion(version);
      if (restored) setSelectedVersionId("current");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const lyricAuthor = (authorId: string | null) => (authorId ? authorId.slice(0, 8) : "Deleted user");

  const handleDiscussionSelection = (entry: LyricsLineAnchor, target: HTMLElement) => {
    if (!onChangeDiscussionSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) {
      onChangeDiscussionSelection(selectionFromLineAnchor(entry));
      return;
    }
    if (!target.contains(selection.anchorNode) || !target.contains(selection.focusNode)) {
      onChangeDiscussionSelection(selectionFromLineAnchor(entry));
      return;
    }
    const start = Math.min(selection.anchorOffset, selection.focusOffset);
    const end = Math.max(selection.anchorOffset, selection.focusOffset);
    onChangeDiscussionSelection(selectionFromRange(entry, start, end) ?? selectionFromLineAnchor(entry));
  };

  const originalVersion = versionHistory.find((v) => v.isOriginal);

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-neutral-950 p-4 sm:p-8 flex flex-col h-screen w-screen overflow-hidden animate-fade-in"
      : "bg-neutral-950 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col h-full min-h-[480px]"
    }>
      {/* Editor Header */}
      <div className="flex flex-col gap-3.5 border-b border-neutral-900 pb-3.5 mb-4">
        {/* Row 1: Title & Accessory controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 shrink-0">
              <Edit3 className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-white tracking-wide">Текст песни</h3>
              <p className="text-[10px] text-neutral-400 hidden xs:block">Нажмите на строку для комментирования</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {versionHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  showHistory ? "bg-indigo-950 text-indigo-400 border border-indigo-900/40" : "text-neutral-400 hover:text-white bg-neutral-900/50"
                }`}
                title="История версий текста"
              >
                <History className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onExportTxt(activeVersion ?? null)}
              className="px-2.5 py-2 rounded-lg text-[11px] font-semibold text-neutral-300 hover:text-white bg-neutral-900/50"
              title="Экспорт TXT"
            >
              TXT
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isFullscreen ? "bg-rose-950 text-rose-400 border border-rose-900/40" : "text-neutral-400 hover:text-white bg-neutral-900/50"
              }`}
              title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Row 2: Tactile Segmented Toggle (Reading vs Editing Mode) */}
        {!showHistory && (
          <div className="grid grid-cols-2 bg-neutral-900 p-1 rounded-xl w-full">
            <button
              onClick={onStopEdit}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !isEditing
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/25"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Чтение и Обсуждение</span>
            </button>
            <button
              onClick={() => void handleStartEdit()}
              disabled={!canEdit || editState === "acquiring"}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isEditing
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/25"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{editState === "acquiring" ? t("lyrics.edit.acquiring") : "Редактирование"}</span>
            </button>
          </div>
        )}

        <div className={`text-[11px] ${saveStatusTone} text-left px-1`}>
          {saveStatusLabel}
          {statusMessage ? <span className="ml-1 text-neutral-500">{statusMessage}</span> : null}
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col relative min-h-[300px] ${isFullscreen ? "max-w-3xl mx-auto w-full pt-2" : ""}`}>
        
        {/* Version Selector for Reading Mode */}
        {!showHistory && !isEditing && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-900/40 border border-neutral-900/80 rounded-xl p-2 mb-3.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider ml-1">Версия:</span>
              {originalVersion && (
                <button
                  onClick={() => setSelectedVersionId(selectedVersionId === originalVersion.id ? "current" : originalVersion.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer border ${
                    selectedVersionId === originalVersion.id
                      ? "bg-amber-500 text-neutral-950 border-amber-400 shadow-md shadow-amber-500/10"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                  }`}
                  title="Показать оригинальную Master-версию"
                >
                  👑 Оригинал
                </button>
              )}
            </div>
            
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-[11px] text-neutral-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer max-w-[200px]"
            >
              <option value="current">📝 Текущая (Редактируемая)</option>
              {versionHistory.map((ver) => (
                <option key={ver.id} value={ver.id}>
                  {ver.isOriginal ? "👑 " : "📄 "}
                  {ver.label.length > 20 ? `${ver.label.substring(0, 20)}...` : ver.label} ({lyricAuthor(ver.authorId)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Version Banner for Previewing Historical Version */}
        {!showHistory && !isEditing && activeVersion && (
          <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 mb-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                {activeVersion.isOriginal ? (
                  <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    👑 Оригинал (Master)
                  </span>
                ) : (
                  <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    ⏳ Архивный черновик
                  </span>
                )}
                <span className="text-white font-bold text-xs">
                  Автор: {lyricAuthor(activeVersion.authorId)}
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 leading-normal">
                {new Date(activeVersion.timestamp).toLocaleString("ru-RU")} — "{activeVersion.label}"
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {onPinVersion && (
                <button
                  onClick={() => onPinVersion(activeVersion.id)}
                  disabled={!canEdit}
                  className={`text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all cursor-pointer border ${
                    activeVersion.isOriginal
                      ? "bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-white border-neutral-800"
                      : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/25"
                  }`}
                  title={activeVersion.isOriginal ? "Убрать статус оригинала" : "Закрепить эту версию как оригинальный мастер"}
                >
                  {activeVersion.isOriginal ? "Снять 👑" : "Закрепить как Оригинал"}
                </button>
              )}
                    <button
                      onClick={() => void handleRestoreVersion(activeVersion)}
                disabled={!canEdit || restoringVersionId !== null}
                className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-md shrink-0"
              >
                {restoringVersionId === activeVersion.id ? "Восстанавливаем..." : "Восстановить"}
              </button>
            </div>
          </div>
        )}

        {showHistory ? (
          /* History logs panel */
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 border-b border-neutral-900 pb-2 mb-2">
              <span>ИСТОРИЯ ИЗМЕНЕНИЙ ТЕКСТА</span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-indigo-400 hover:text-indigo-300 font-bold px-2 py-1 bg-neutral-900 rounded-md"
              >
                назад
              </button>
            </div>
            {versionHistory
              .slice()
              .reverse()
              .map((ver) => (
                <div
                  key={ver.id}
                  className="bg-neutral-900/50 border border-neutral-900 hover:border-neutral-800 p-3.5 rounded-xl text-xs text-left flex justify-between items-start gap-4 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-750">
                        {ver.label}
                      </span>
                      {ver.isOriginal && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/25 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          👑 Оригинал
                        </span>
                      )}
                    </div>
                    <div className="text-white font-semibold mt-1">Автор: {lyricAuthor(ver.authorId)}</div>
                    <div className="text-[10px] text-neutral-500">
                      {new Date(ver.timestamp).toLocaleString("ru-RU")}
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-400 font-serif italic line-clamp-2 leading-relaxed">
                      "{ver.lyrics.substring(0, 100)}..."
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => void handleRestoreVersion(ver)}
                      disabled={!canEdit || restoringVersionId !== null}
                      className="text-[10px] bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/30 hover:border-indigo-500 text-indigo-400 hover:text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer font-bold shrink-0 text-center"
                    >
                      {restoringVersionId === ver.id ? "Восстанавливаем..." : "Восстановить"}
                    </button>
                    {onPinVersion && (
                      <button
                        onClick={() => onPinVersion(ver.id)}
                        disabled={!canEdit}
                        className={`text-[9px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer text-center border ${
                          ver.isOriginal
                            ? "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                            : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:border-amber-500/40"
                        }`}
                      >
                        {ver.isOriginal ? "Снять 👑" : "Сделать 👑"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : isEditing ? (
          <div className="flex-1 flex flex-col gap-3">
            {structuredEditorEnabled && draftDocument && onChangeDraftDocument ? (
              <React.Suspense fallback={<div className="min-h-[260px] rounded-xl border border-neutral-800 bg-neutral-900/40" aria-label="Загрузка редактора" />}>
                <StructuredLyricsEditor
                  document={draftDocument}
                  onChange={onChangeDraftDocument}
                  readOnly={!canEdit}
                  fullscreen={isFullscreen}
                />
              </React.Suspense>
            ) : (
              <textarea
                value={draftLyrics}
                onChange={(e) => onChangeDraftLyrics(e.target.value)}
                placeholder="Вставьте или напишите текст песни..."
                readOnly={!canEdit}
                className={`flex-1 bg-neutral-900/40 border border-neutral-800 focus:border-indigo-500 rounded-xl p-3 text-sm text-neutral-200 focus:outline-none font-serif leading-relaxed resize-none ${
                  isFullscreen ? "min-h-[400px] text-base p-5" : "min-h-[260px]"
                }`}
              />
            )}

            <div className="flex flex-col gap-2 pt-1">
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="Название версии (например: Куплет 2 финал)"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-neutral-500"
                disabled={!canEdit || isCreatingVersion}
              />
              <button
                onClick={handleCreateVersion}
                disabled={!canEdit || isCreatingVersion}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-900/20"
              >
                <Save className="w-4 h-4" />
                <span>{isCreatingVersion ? "Создаём версию..." : "Создать версию"}</span>
              </button>
            </div>
          </div>
        ) : (
          /* READ & ANNOTATE MODE (LINE-BY-LINE HIGHLIGHTING) */
          <div className="flex-1 flex flex-col min-h-0">
            <div className={`flex-1 overflow-y-auto pr-1 pb-16 text-left space-y-1 ${
              isFullscreen ? "max-h-[calc(100vh-220px)] p-2" : "max-h-[460px]"
            }`}>
              {renderedLines.map((entry) => {
                const line = entry.lineText;
                const idx = entry.lineIndex;
                const isSelected = selectedLineIndex === idx;
                const commentsCount = trackCommentsCount(idx);
                const isSectionHeader = line.startsWith("[") && line.endsWith("]");

                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectLine(isSelected ? null : idx);
                        if (onChangeDiscussionSelection) onChangeDiscussionSelection(isSelected ? null : selectionFromLineAnchor(entry));
                      }
                    }}
                    onClick={() => {
                      onSelectLine(isSelected ? null : idx);
                      if (onChangeDiscussionSelection) onChangeDiscussionSelection(isSelected ? null : selectionFromLineAnchor(entry));
                    }}
                    className={`group flex w-full items-center justify-between gap-3 p-1.5 px-3 rounded-lg transition-all cursor-pointer border text-left ${
                      isSectionHeader
                        ? "border-transparent bg-transparent mt-2 first:mt-0"
                        : isSelected
                        ? "bg-indigo-600/10 border-indigo-500/40 shadow-inner"
                        : "border-transparent bg-transparent hover:bg-neutral-900/30"
                    }`}
                  >
                    <div className="flex items-start flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        {isSectionHeader ? (
                          <span className="font-mono font-bold tracking-wide text-indigo-400 text-[11px] sm:text-xs uppercase">
                            {line}
                          </span>
                        ) : (
                          <p
                            className={`leading-relaxed font-serif ${
                              line.trim() === "" ? "h-3" : "text-neutral-200"
                            } text-xs sm:text-sm whitespace-pre-wrap`}
                            onMouseUp={(event) => handleDiscussionSelection(entry, event.currentTarget)}
                            onTouchEnd={(event) => handleDiscussionSelection(entry, event.currentTarget)}
                          >
                            {line}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Simple badge indicating comments count */}
                    {commentsCount > 0 && (
                      <span className="flex items-center gap-1 text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-900/50 p-0.5 px-1.5 rounded-md font-mono shrink-0">
                        <MessageSquare className="w-2.5 h-2.5 fill-indigo-300" />
                        {commentsCount}
                      </span>
                    )}

                    {/* Quick indicator circle for selected line on mobile */}
                    {isSelected && !isSectionHeader && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* CONTEXTUAL DISCUSSION OVERLAY FOR SELECTED LINE (Mobile & Desktop optimized) */}
            {selectedLineIndex !== null && renderedLines[selectedLineIndex] && !renderedLines[selectedLineIndex].separator && !renderedLines[selectedLineIndex].lineText.startsWith("[") && (
              <div className="absolute bottom-1 left-0 right-0 z-30 animate-slide-up px-1">
                <div className="bg-indigo-950 border border-indigo-900/80 shadow-2xl rounded-xl p-3 flex items-center justify-between gap-3 backdrop-blur-md">
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-[10px] font-mono text-indigo-300 font-bold uppercase tracking-wider block">
                      Выбрана строка {selectedLineIndex + 1}
                    </span>
                    <p className="text-white text-xs truncate font-serif mt-0.5 italic">
                      "{renderedLines[selectedLineIndex].lineText}"
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onSelectLine(null);
                        onChangeDiscussionSelection?.(null);
                      }}
                      className="text-[11px] font-semibold text-neutral-400 hover:text-white px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Сбросить
                    </button>
                    <button
                      onClick={onJumpToDiscussion}
                      className="flex items-center gap-1 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-all shadow-md cursor-pointer"
                    >
                      <span>Обсудить</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {restoreDraft && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="text-left">
              <h4 className="text-white font-semibold">Найден несохраненный черновик</h4>
              <p className="text-xs text-neutral-400 mt-1">Выберите, какую версию использовать для текущего трека.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 text-left">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">Локальный черновик</div>
                <div className="text-[11px] text-neutral-500 mt-1">{new Date(restoreDraft.localSavedAt).toLocaleString("ru-RU")}</div>
                <p className="mt-2 text-xs text-neutral-200 whitespace-pre-wrap break-words line-clamp-6">{restoreDraft.localPreview || "(пусто)"}</p>
              </div>
              <div className="bg-neutral-900/20 border border-neutral-800 rounded-xl p-3 text-left">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">Серверный черновик</div>
                <div className="text-[11px] text-neutral-500 mt-1">{new Date(restoreDraft.serverUpdatedAt).toLocaleString("ru-RU")}</div>
                <p className="mt-2 text-xs text-neutral-300 whitespace-pre-wrap break-words line-clamp-6">{restoreDraft.serverPreview || "(пусто)"}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onDownloadLocalDraft}
                className="px-3 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-100"
              >
                Сохранить локальную копию
              </button>
              <button
                type="button"
                onClick={onUseServerDraft}
                className="px-3 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-100"
              >
                Использовать серверный
              </button>
              <button
                type="button"
                onClick={onRestoreLocalDraft}
                className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                Восстановить локальный
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
