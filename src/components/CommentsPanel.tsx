import React, { useState } from "react";
import { MessageSquare, Check, CornerDownRight, RotateCcw } from "lucide-react";
import { Comment } from "../types";
import { ApiError } from "../api/client";

interface CommentsPanelProps {
  comments: Comment[];
  onAddComment: (text: string, lineIndex?: number) => Promise<void> | void;
  onResolveComment: (commentId: string) => Promise<void> | void;
  canWrite?: boolean;
  canResolve: boolean;
  selectedLineIndex: number | null;
  onClearSelectedLine: () => void;
  lyricsLines: string[];
}

export default function CommentsPanel({
  comments,
  onAddComment,
  onResolveComment,
  canWrite = true,
  canResolve,
  selectedLineIndex,
  onClearSelectedLine,
  lyricsLines,
}: CommentsPanelProps) {
  const [text, setText] = useState("");
  const [filterResolved, setFilterResolved] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !canWrite || isSubmitting) return;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onAddComment(text.trim(), selectedLineIndex !== null ? selectedLineIndex : undefined);
      setText("");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Не удалось сохранить комментарий.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    if (!canResolve || resolvingCommentId) return;
    setErrorMessage("");
    setResolvingCommentId(commentId);
    try {
      await onResolveComment(commentId);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Не удалось обновить комментарий.");
    } finally {
      setResolvingCommentId(null);
    }
  };

  const filteredComments = comments.filter((c) => {
    // First filter by line selection if one is active
    if (selectedLineIndex !== null && c.lineIndex !== selectedLineIndex) {
      return false;
    }
    // Then filter by resolved status
    if (filterResolved === "unresolved") return !c.resolved;
    if (filterResolved === "resolved") return c.resolved;
    return true;
  });

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-2 mb-3">
        <div>
          <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ПРАВКИ И ОБСУЖДЕНИЕ</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Точечные комментарии к тексту песни</p>
        </div>

        <div className="flex gap-1.5 text-[9px]">
          <button
            onClick={() => setFilterResolved("unresolved")}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              filterResolved === "unresolved" ? "bg-indigo-600 text-white" : "bg-neutral-900 text-neutral-400"
            }`}
          >
            Активные
          </button>
          <button
            onClick={() => setFilterResolved("all")}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              filterResolved === "all" ? "bg-indigo-600 text-white" : "bg-neutral-900 text-neutral-400"
            }`}
          >
            Все
          </button>
        </div>
      </div>

      {selectedLineIndex !== null && (
        <div className="bg-indigo-950/30 border border-indigo-900/30 p-2.5 rounded-lg mb-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-indigo-400 font-mono">
            <span>Выбрана строка {selectedLineIndex + 1}</span>
            <button
              onClick={onClearSelectedLine}
              className="hover:text-indigo-200 transition-colors cursor-pointer"
            >
              сбросить
            </button>
          </div>
          <p className="text-xs text-neutral-300 italic line-clamp-1 border-l-2 border-l-indigo-500 pl-2">
            "{lyricsLines[selectedLineIndex] || "Пустая строка"}"
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 rounded-lg border border-red-900/30 bg-red-950/40 p-2 text-xs text-red-300" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Form to leave comments */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              !canWrite
                ? "Комментирование недоступно"
                : selectedLineIndex !== null
                ? `Комментарий к строке ${selectedLineIndex + 1}...`
                : "Общий комментарий к тексту..."
            }
            className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2 text-xs text-white focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!canWrite || isSubmitting}
          />
          <button
            type="submit"
            disabled={!text.trim() || !canWrite || isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white p-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Сохраняем..." : "Оставить"}
          </button>
        </div>
        {!canWrite && (
          <p className="mt-2 text-[11px] text-neutral-500">
            У вас нет прав на создание комментариев.
          </p>
        )}
      </form>

      {/* List of comments */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredComments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <MessageSquare className="w-8 h-8 text-neutral-800 mb-1" />
            <p className="text-[11px] text-neutral-500 italic max-w-[180px]">
              {selectedLineIndex !== null
                ? "Пока нет замечаний к этой строке. Напишите первое!"
                : "Нет активных правок. Всё согласовано!"}
            </p>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment.id}
              className={`p-3 rounded-xl border transition-all ${
                comment.resolved
                  ? "bg-neutral-900/40 border-neutral-900/60 opacity-60"
                  : "bg-neutral-900 border-neutral-800/80 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="text-left">
                  <span className="text-[11px] font-semibold text-white block">
                    {comment.author}
                  </span>
                  <span className="text-[9px] text-neutral-500 font-mono">
                    {new Date(comment.timestamp).toLocaleDateString("ru-RU")} в{" "}
                    {new Date(comment.timestamp).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <button
                  onClick={() => { void handleResolve(comment.id); }}
                  disabled={!canResolve || resolvingCommentId !== null}
                  className={`p-1 rounded-md border transition-all cursor-pointer ${
                    comment.resolved
                      ? "bg-neutral-800 border-neutral-700 text-amber-500 hover:bg-neutral-700"
                      : "bg-emerald-950/30 border-emerald-900/30 text-emerald-400 hover:bg-emerald-900/40"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={comment.resolved ? "Вернуть в активные" : "Отметить как исправленное"}
                >
                  {comment.resolved ? (
                    <RotateCcw className="w-3 h-3" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Connected Line context (if general view and comment is line-linked) */}
              {comment.lineIndex !== undefined && selectedLineIndex === null && (
                <div className="flex items-center gap-1.5 text-[9px] text-indigo-400 font-mono mb-1.5 bg-indigo-950/10 p-1.5 rounded border border-indigo-900/10">
                  <CornerDownRight className="w-2.5 h-2.5" />
                  <span className="font-semibold">Строка {comment.lineIndex + 1}:</span>
                  <span className="italic line-clamp-1">
                    "{lyricsLines[comment.lineIndex] || "---"}"
                  </span>
                </div>
              )}

              <p className="text-xs text-neutral-300 leading-relaxed font-sans select-text break-words">
                {comment.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
