import React, { useState, useEffect } from "react";
import { Edit3, Eye, Save, History, MessageSquare, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { TrackVersion } from "../types";

interface LyricsEditorProps {
  lyrics: string;
  onUpdateLyrics: (newLyrics: string, versionLabel?: string) => void;
  versionHistory: TrackVersion[];
  selectedLineIndex: number | null;
  onSelectLine: (index: number | null) => void;
  currentUser: any;
  trackCommentsCount: (lineIdx: number) => number;
}

export default function LyricsEditor({
  lyrics,
  onUpdateLyrics,
  versionHistory,
  selectedLineIndex,
  onSelectLine,
  currentUser,
  trackCommentsCount,
}: LyricsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(lyrics);
  const [versionLabel, setVersionLabel] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Split lyrics by line to render line-by-line
  const lines = lyrics.split("\n");

  const handleSave = () => {
    onUpdateLyrics(editedText, versionLabel.trim() || undefined);
    setIsEditing(false);
    setVersionLabel("");
  };

  const handleStartEdit = () => {
    setEditedText(lyrics);
    setIsEditing(true);
  };

  const restoreVersion = (ver: TrackVersion) => {
    if (confirm(`Вы уверены, что хотите восстановить версию от ${ver.author} (${ver.label})?`)) {
      onUpdateLyrics(ver.lyrics, `Восстановлено из истории: ${ver.label}`);
      setEditedText(ver.lyrics);
      setIsEditing(false);
    }
  };

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-neutral-950 p-6 sm:p-10 flex flex-col h-screen w-screen overflow-hidden animate-fade-in"
      : "bg-neutral-950 border border-neutral-800 rounded-xl p-5 flex flex-col h-full min-h-[480px]"
    }>
      {/* Editor Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-950/40 text-indigo-400 border border-indigo-900/30">
            <Edit3 className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">Текст Песни</h3>
            <p className="text-[11px] text-neutral-400">Пишите стихи, разметку аккордов и обсуждайте строфы</p>
          </div>
        </div>

        {/* View / Edit Mode Toggles */}
        <div className="flex items-center gap-1.5 bg-neutral-900 p-1 rounded-lg">
          <button
            onClick={() => setIsEditing(false)}
            className={`flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              !isEditing ? "bg-indigo-600 text-white font-medium" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Просмотр & Комменты
          </button>
          <button
            onClick={handleStartEdit}
            className={`flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              isEditing ? "bg-indigo-600 text-white font-medium" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Редактировать
          </button>
          {versionHistory.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                showHistory ? "bg-indigo-950 text-indigo-400 border border-indigo-900/30" : "text-neutral-400 hover:text-white"
              }`}
              title="История версий текста"
            >
              <History className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isFullscreen ? "bg-rose-950 text-rose-400 border border-rose-900/30" : "text-neutral-400 hover:text-white hover:bg-neutral-800"
            }`}
            title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col relative min-h-[300px] ${isFullscreen ? "max-w-3xl mx-auto w-full pt-4" : ""}`}>
        {showHistory ? (
          /* History logs panel */
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 border-b border-neutral-900 pb-1 mb-2">
              <span>ИСТОРИЯ ИЗМЕНЕНИЙ ТЕКСТА</span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-indigo-400 hover:text-indigo-300"
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
                    <span className="text-[10px] font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-750">
                      {ver.label}
                    </span>
                    <div className="text-white font-medium mt-1">Автор: {ver.author}</div>
                    <div className="text-[10px] text-neutral-500">
                      {new Date(ver.timestamp).toLocaleString("ru-RU")}
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-400 font-serif italic line-clamp-2">
                      "{ver.lyrics.substring(0, 100)}..."
                    </div>
                  </div>
                  <button
                    onClick={() => restoreVersion(ver)}
                    className="text-[10px] bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/30 hover:border-indigo-500 text-indigo-400 hover:text-white px-2.5 py-1 rounded transition-colors cursor-pointer"
                  >
                    Восстановить
                  </button>
                </div>
              ))}
          </div>
        ) : isEditing ? (
          /* TEXTAREA EDIT MODE */
          <div className="flex-1 flex flex-col gap-3">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              placeholder="Вставьте или напишите текст песни..."
              className={`flex-1 bg-neutral-900/40 border border-neutral-800 focus:border-indigo-500 rounded-xl p-3.5 text-sm sm:text-base text-neutral-200 focus:outline-none font-serif leading-relaxed resize-none ${
                isFullscreen ? "min-h-[400px] text-lg p-5" : "min-h-[260px]"
              }`}
            />
            {/* Version label input before saving */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="Название версии (например: Добавлен мост / правка Марии)"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:outline-none"
              />
              <button
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold p-2 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Сохранить черновик
              </button>
            </div>
          </div>
        ) : (
          /* READ & ANNOTATE MODE (LINE-BY-LINE HIGHLIGHTING) */
          <div className={`flex-1 overflow-y-auto pr-1 py-1 text-left ${
            isFullscreen ? "max-h-[calc(100vh-180px)] space-y-3 p-2" : "max-h-[460px] space-y-1.5"
          }`}>
            {lines.map((line, idx) => {
              const isSelected = selectedLineIndex === idx;
              const commentsCount = trackCommentsCount(idx);
              const isSectionHeader = line.startsWith("[") && line.endsWith("]");

              return (
                <div
                  key={idx}
                  onClick={() => onSelectLine(isSelected ? null : idx)}
                  className={`group flex items-start gap-3 p-1 px-2.5 rounded-lg transition-all cursor-pointer select-none ${
                    isSectionHeader
                      ? "hover:bg-neutral-900/30"
                      : isSelected
                      ? "bg-indigo-950/30 border border-indigo-900/40 shadow-inner"
                      : "hover:bg-neutral-900/40"
                  } ${isFullscreen ? "p-2 sm:p-3" : ""}`}
                >
                  {/* Line Number */}
                  <span className="font-mono text-[10px] sm:text-xs text-neutral-500 w-5 text-right mt-1 select-none">
                    {idx + 1}
                  </span>

                  {/* Line Content */}
                  <div className="flex-1">
                    {isSectionHeader ? (
                      <span className={`font-mono font-bold tracking-wide text-indigo-400 mt-1.5 block ${
                        isFullscreen ? "text-sm sm:text-base" : "text-xs"
                      }`}>
                        {line}
                      </span>
                    ) : (
                      <p className={`leading-relaxed font-serif ${
                        line.trim() === "" ? "h-3" : "text-neutral-200"
                      } ${isFullscreen ? "text-base sm:text-xl" : "text-sm"}`}>
                        {line}
                      </p>
                    )}
                  </div>

                  {/* Comment trigger badge / indicators */}
                  <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                    {commentsCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-900/50 p-0.5 px-1.5 rounded-md font-mono">
                        <MessageSquare className="w-2.5 h-2.5 fill-indigo-300" />
                        {commentsCount}
                      </span>
                    )}
                    {!isSectionHeader && line.trim() !== "" && (
                      <span className="text-[9px] bg-neutral-900 text-neutral-500 border border-neutral-800 p-0.5 px-1 rounded hover:bg-indigo-950 hover:text-indigo-400 transition-colors">
                        комментировать
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
