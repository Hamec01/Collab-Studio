import React, { useState, useRef, useEffect } from "react";
import { Send, Clock } from "lucide-react";
import { AuthUser, ChatMessage } from "../types";

interface ChatRoomProps {
  chat: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUser: AuthUser | null;
  canSend: boolean;
}

export default function ChatRoom({ chat, onSendMessage, currentUser, canSend }: ChatRoomProps) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText("");
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-full flex flex-col">
      <div className="border-b border-neutral-900 pb-2 mb-3">
        <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ЧАТ ОБСУЖДЕНИЯ ПРАВОК</h3>
        <p className="text-[10px] text-neutral-500 mt-0.5">Быстрые сообщения соавторам по текущему треку</p>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {chat.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-[11px] text-neutral-500 italic">История сообщений пуста. Начните обсуждение!</p>
          </div>
        ) : (
          chat.map((msg) => {
            const isMe = msg.authorUser?.id === currentUser?.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                {/* Author tag */}
                {!isMe && (
                  <span className="text-[9px] text-neutral-400 font-medium mb-0.5 px-1">
                    {msg.author}
                  </span>
                )}
                {/* Message Bubble */}
                <div
                  className={`p-2.5 rounded-xl text-xs leading-relaxed ${
                    isMe
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-tl-none"
                  }`}
                >
                  {msg.text}
                </div>
                {/* Timestamp */}
                <span className="text-[8px] text-neutral-500 mt-1 flex items-center gap-0.5 px-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Form */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Напишите соавторам..."
          className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2 text-xs text-white focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim() || !canSend}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white p-2 px-3 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
