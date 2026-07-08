import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../app/auth/AuthProvider";
import type { DmRequest, DirectMessage } from "../types";
import {
  getDmRequests,
  getDmConversations,
  respondToDmRequest,
  getConversationMessages,
  sendConversationMessage,
} from "../api/dm";

type View = "requests" | "conversation";

interface DmInboxProps {
  /** If provided, opens conversation immediately after mount (e.g. from deep-link) */
  initialRequestId?: string;
}

export function DmInbox({ initialRequestId }: DmInboxProps) {
  const { currentUser } = useAuth();
  const [view, setView] = useState<View>(initialRequestId ? "conversation" : "requests");
  const [requests, setRequests] = useState<DmRequest[]>([]);
  const [conversations, setConversations] = useState<DmRequest[]>([]);
  const [activeConversation, setActiveConversation] = useState<DmRequest | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([getDmRequests(), getDmConversations()])
      .then(([reqRes, convoRes]) => {
        setRequests(reqRes.requests);
        setConversations(convoRes.conversations);
        if (initialRequestId) {
          const found = convoRes.conversations.find((c) => c.id === initialRequestId);
          if (found) {
            setActiveConversation(found);
            setView("conversation");
          }
        }
      })
      .catch(() => setError("Не удалось загрузить сообщения"))
      .finally(() => setLoading(false));
  }, [currentUser, initialRequestId]);

  useEffect(() => {
    if (!activeConversation) return;
    getConversationMessages(activeConversation.id)
      .then((res) => setMessages(res.messages))
      .catch(() => setError("Не удалось загрузить переписку"));
  }, [activeConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRespond = async (requestId: string, action: "accept" | "reject" | "block") => {
    try {
      const res = await respondToDmRequest(requestId, action);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (action === "accept") {
        setConversations((prev) => [res.request, ...prev]);
      }
    } catch {
      setError("Не удалось ответить на запрос");
    }
  };

  const handleSend = async () => {
    if (!activeConversation || !msgText.trim() || sending) return;
    setSending(true);
    try {
      const res = await sendConversationMessage(activeConversation.id, msgText.trim());
      setMessages((prev) => [...prev, res.message]);
      setMsgText("");
    } catch {
      setError("Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  const openConversation = (conv: DmRequest) => {
    setActiveConversation(conv);
    setMessages([]);
    setError(null);
    setView("conversation");
  };

  const otherParticipant = (conv: DmRequest) => {
    if (!currentUser) return null;
    return conv.senderId === currentUser.id ? conv.recipient : conv.sender;
  };

  if (!currentUser) {
    return (
      <div className="p-6 text-center text-neutral-500 text-sm">
        Войдите, чтобы использовать сообщения
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] rounded-2xl border border-neutral-800 bg-neutral-950/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3 bg-neutral-900/60">
        {view === "conversation" && (
          <button
            onClick={() => { setView("requests"); setActiveConversation(null); }}
            className="mr-1 text-neutral-400 hover:text-white transition-colors"
          >
            ←
          </button>
        )}
        <h2 className="text-sm font-semibold text-white">
          {view === "conversation" && activeConversation
            ? otherParticipant(activeConversation)?.displayName ?? "Переписка"
            : "Сообщения"}
        </h2>
        {view === "requests" && requests.length > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full bg-indigo-600/30 border border-indigo-500/30 px-2 py-0.5 text-xs font-semibold text-indigo-300">
            {requests.length} новых
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Загрузка…
        </div>
      ) : view === "requests" ? (
        <div className="flex-1 overflow-y-auto">
          {/* Pending requests */}
          {requests.length > 0 && (
            <div className="border-b border-neutral-800">
              <div className="px-4 pt-3 pb-1 text-xs font-mono uppercase tracking-widest text-neutral-500">
                Запросы ({requests.length})
              </div>
              {requests.map((req) => (
                <div key={req.id} className="flex items-start gap-3 px-4 py-3 border-b border-neutral-800/50 last:border-0">
                  <div className="h-9 w-9 rounded-full bg-indigo-700/30 border border-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300 shrink-0">
                    {req.sender.displayName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{req.sender.displayName}</div>
                    <div className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{req.text}</div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleRespond(req.id, "accept")}
                        className="text-xs font-medium text-emerald-300 hover:text-emerald-200 border border-emerald-700/40 bg-emerald-950/30 rounded-lg px-3 py-1 transition-colors"
                      >
                        Принять
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, "reject")}
                        className="text-xs font-medium text-neutral-400 hover:text-white border border-neutral-700 bg-neutral-800 rounded-lg px-3 py-1 transition-colors"
                      >
                        Отклонить
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, "block")}
                        className="text-xs font-medium text-rose-400 hover:text-rose-300 border border-rose-900/40 bg-rose-950/20 rounded-lg px-3 py-1 transition-colors"
                      >
                        Блокировать
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Accepted conversations */}
          <div>
            {conversations.length === 0 && requests.length === 0 && (
              <div className="p-6 text-center text-neutral-500 text-sm">
                Нет сообщений
              </div>
            )}
            {conversations.map((conv) => {
              const other = otherParticipant(conv);
              const lastMsg = conv.messages?.[0];
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/40 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-sm font-bold text-neutral-300 shrink-0">
                    {other?.displayName[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{other?.displayName}</div>
                    {lastMsg && (
                      <div className="text-xs text-neutral-400 truncate mt-0.5">{lastMsg.text}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Conversation thread */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-neutral-500 text-sm py-6">Начните переписку</div>
            )}
            {messages.map((msg) => {
              const isMine = currentUser && msg.senderId === currentUser.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                      isMine
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-neutral-800 text-neutral-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-rose-400 bg-rose-950/20 border-t border-rose-900/30">
              {error}
            </div>
          )}

          {/* Message input */}
          <div className="border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 flex items-end gap-3">
            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Написать сообщение…"
              rows={1}
              maxLength={2000}
              className="flex-1 resize-none bg-neutral-800/80 text-neutral-100 text-sm rounded-xl px-4 py-2.5 border border-neutral-700 focus:border-indigo-500 focus:outline-none placeholder:text-neutral-500 transition-colors"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!msgText.trim() || sending}
              className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {sending ? "…" : "→"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
