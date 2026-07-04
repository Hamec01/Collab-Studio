import { useMemo, useState, type FormEvent } from "react";
import { Check, CornerDownRight, Link2, MessageSquare, RotateCcw } from "lucide-react";
import type { LyricsDiscussionSelection } from "./lyricsDiscussions";
import type { LyricsDiscussionThread } from "../../../types";

type LyricsDiscussionsPanelProps = {
  threads: LyricsDiscussionThread[];
  selection: LyricsDiscussionSelection | null;
  availableAnchors: LyricsDiscussionSelection[];
  canWrite: boolean;
  canResolve: boolean;
  onCreateThread: (body: string, selection: LyricsDiscussionSelection | null) => void;
  onReply: (threadId: string, body: string) => void;
  onResolveThread: (threadId: string, resolved: boolean) => void;
  onReanchorThread: (threadId: string, selection: LyricsDiscussionSelection) => void;
  onClearSelection: () => void;
};

const statusTone: Record<string, string> = {
  exact: "bg-emerald-950/30 text-emerald-300 border-emerald-900/40",
  relocated: "bg-amber-950/30 text-amber-300 border-amber-900/40",
  ambiguous: "bg-orange-950/30 text-orange-300 border-orange-900/40",
  orphaned: "bg-rose-950/30 text-rose-300 border-rose-900/40",
};

const statusLabel: Record<string, string> = {
  exact: "Exact",
  relocated: "Relocated",
  ambiguous: "Ambiguous",
  orphaned: "Orphaned",
};

export function LyricsDiscussionsPanel({
  threads,
  selection,
  availableAnchors,
  canWrite,
  canResolve,
  onCreateThread,
  onReply,
  onResolveThread,
  onReanchorThread,
  onClearSelection,
}: LyricsDiscussionsPanelProps) {
  const [composer, setComposer] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const [reanchorByThread, setReanchorByThread] = useState<Record<string, string>>({});

  const filteredThreads = useMemo(() => (
    showResolved ? threads : threads.filter((thread) => !thread.resolved)
  ), [showResolved, threads]);

  const anchorOptions = useMemo(() => {
    const seen = new Set<string>();
    return availableAnchors.filter((item) => {
      if (seen.has(item.blockId)) return false;
      seen.add(item.blockId);
      return true;
    });
  }, [availableAnchors]);

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!composer.trim()) return;
    onCreateThread(composer.trim(), selection);
    setComposer("");
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-2 mb-3">
        <div>
          <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">DISCUSSIONS</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Lyrics-only threads with stable anchors</p>
        </div>
        <button
          type="button"
          onClick={() => setShowResolved((value) => !value)}
          className={`px-2 py-1 rounded text-[10px] font-semibold ${showResolved ? "bg-indigo-600 text-white" : "bg-neutral-900 text-neutral-400"}`}
        >
          {showResolved ? "Скрыть resolved" : "Показать resolved"}
        </button>
      </div>

      {selection && (
        <div className="bg-indigo-950/30 border border-indigo-900/30 p-2.5 rounded-lg mb-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-indigo-400 font-mono">
            <span>Выбран lyrics anchor</span>
            <button type="button" onClick={onClearSelection} className="hover:text-indigo-200 transition-colors">сбросить</button>
          </div>
          <p className="text-xs text-neutral-200 italic border-l-2 border-l-indigo-500 pl-2 break-words">
            "{(selection.quote ?? selection.displayText ?? "Блок")}"
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder={selection ? "Новый тред к выбранному anchor..." : "Общий тред по lyrics..."}
            className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2 text-xs text-white focus:outline-none"
            disabled={!canWrite}
          />
          <button
            type="submit"
            disabled={!canWrite || !composer.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white p-2 px-3 rounded-lg text-xs font-semibold"
          >
            Тред
          </button>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredThreads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <MessageSquare className="w-8 h-8 text-neutral-800 mb-1" />
            <p className="text-[11px] text-neutral-500 italic max-w-[200px]">Пока нет discussions для этого текста.</p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const lastMessage = thread.messages[thread.messages.length - 1];
            const needsManualReanchor = thread.anchor.state === "ambiguous" || thread.anchor.state === "orphaned";
            const selectedReanchor = anchorOptions.find((item) => item.blockId === reanchorByThread[thread.id]) ?? selection ?? anchorOptions[0] ?? null;
            return (
              <div key={thread.id} className={`p-3 rounded-xl border ${thread.resolved ? "bg-neutral-900/40 border-neutral-900/60 opacity-70" : "bg-neutral-900 border-neutral-800/80"}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-left min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-semibold text-white">{thread.createdBy?.displayName ?? "Deleted user"}</span>
                      {thread.kind === "legacy_comment" && <span className="text-[9px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400">Legacy</span>}
                      {thread.anchor.isGeneral ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300">General</span>
                      ) : thread.anchor.state ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${statusTone[thread.anchor.state]}`}>
                          {statusLabel[thread.anchor.state]}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[9px] text-neutral-500 font-mono">
                      {new Date(thread.timestamp).toLocaleDateString("ru-RU")} в {new Date(thread.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!canResolve}
                    onClick={() => onResolveThread(thread.id, !thread.resolved)}
                    className={`p-1 rounded-md border ${thread.resolved ? "bg-neutral-800 border-neutral-700 text-amber-400" : "bg-emerald-950/30 border-emerald-900/30 text-emerald-400"}`}
                    title={thread.resolved ? "Reopen thread" : "Resolve thread"}
                  >
                    {thread.resolved ? <RotateCcw className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  </button>
                </div>

                {!thread.anchor.isGeneral && (
                  <div className="flex items-start gap-1.5 text-[10px] text-indigo-300 font-mono mb-2 bg-indigo-950/10 p-1.5 rounded border border-indigo-900/10">
                    <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold">{thread.anchor.quote ?? thread.anchor.blockPreview ?? "Lyrics block"}</div>
                      {thread.anchor.blockPreview && <div className="text-neutral-400 truncate">{thread.anchor.blockPreview}</div>}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {thread.messages.map((message) => (
                    <div key={message.id} className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-2 text-left">
                      <div className="text-[10px] text-neutral-500 mb-1">{message.author}</div>
                      <p className="text-xs text-neutral-200 break-words whitespace-pre-wrap">{message.body}</p>
                    </div>
                  ))}
                </div>

                {needsManualReanchor && canWrite && thread.kind === "discussion" && (
                  <div className="mt-3 rounded-lg border border-rose-900/30 bg-rose-950/20 p-2.5 space-y-2">
                    <div className="text-[10px] text-rose-300 font-mono uppercase">Manual re-anchor required</div>
                    <div className="flex gap-2">
                      <select
                        value={selectedReanchor?.blockId ?? ""}
                        onChange={(event) => setReanchorByThread((current) => ({ ...current, [thread.id]: event.target.value }))}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs text-white"
                      >
                        {anchorOptions.map((anchor) => (
                          <option key={anchor.blockId} value={anchor.blockId}>
                            {(anchor.quote ?? anchor.displayText ?? "Блок").slice(0, 48)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedReanchor}
                        onClick={() => selectedReanchor && onReanchorThread(thread.id, selectedReanchor)}
                        className="px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:bg-neutral-800"
                      >
                        <span className="inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> Перепривязать</span>
                      </button>
                    </div>
                  </div>
                )}

                {thread.canReply && canWrite && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = replyByThread[thread.id]?.trim();
                      if (!value) return;
                      onReply(thread.id, value);
                      setReplyByThread((current) => ({ ...current, [thread.id]: "" }));
                    }}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      type="text"
                      value={replyByThread[thread.id] ?? ""}
                      onChange={(event) => setReplyByThread((current) => ({ ...current, [thread.id]: event.target.value }))}
                      placeholder={`Ответить в тред (${lastMessage?.author ?? "thread"})...`}
                      className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!(replyByThread[thread.id] ?? "").trim()}
                      className="px-3 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white disabled:bg-neutral-900 disabled:text-neutral-600"
                    >
                      Reply
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
