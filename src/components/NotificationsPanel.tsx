import React from "react";
import { Bell, Check, Clock, Sparkles } from "lucide-react";
import { AppNotification } from "../types";

interface NotificationsPanelProps {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onReadAll: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  isRefreshing?: boolean;
  pendingNotificationId?: string | null;
  readAllPending?: boolean;
}

export default function NotificationsPanel({
  notifications,
  onMarkAsRead,
  onReadAll,
  onOpenNotification,
  isRefreshing = false,
  pendingNotificationId = null,
  readAllPending = false,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col h-full text-left">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="w-4 h-4 text-neutral-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ЛЕНТА ИЗМЕНЕНИЙ</h3>
            <p className="text-[10px] text-neutral-500 mt-0.5">Новые события и правки соавторов</p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={onReadAll}
            disabled={readAllPending}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Check className="w-3 h-3" />
            {readAllPending ? "Обновление…" : "Прочесть все"}
          </button>
        )}
      </div>

      {isRefreshing && (
        <div className="mb-2 text-[10px] text-neutral-500 font-mono">Синхронизация уведомлений…</div>
      )}

      {/* List of Notifications */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[360px]">
        {notifications.length === 0 ? (
          <div className="text-center py-6 italic text-neutral-500 text-xs">Нет новых уведомлений</div>
        ) : (
          notifications.map((not) => (
            <div
              key={not.id}
              className={`p-2.5 rounded-lg border transition-all relative ${
                not.read
                  ? "bg-neutral-900/20 border-neutral-950 opacity-60"
                  : "bg-neutral-900 border-neutral-800/80 hover:border-neutral-700 shadow-sm"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenNotification(not)}
                disabled={readAllPending || pendingNotificationId === not.id}
                className="block w-full text-left pr-16"
              >
                {/* Author Name */}
                <span className="font-semibold text-xs text-white mr-1.5">{not.author}</span>
                <span className="text-neutral-300 text-xs">{not.message}</span>

                {/* Scope: Project & Track names */}
                <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-mono">
                  <span className="bg-neutral-800 text-neutral-400 border border-neutral-750 p-0.5 px-1.5 rounded">
                    Проект: {not.projectName}
                  </span>
                  {not.trackName && (
                    <span className="bg-indigo-950/20 text-indigo-300 border border-indigo-900/20 p-0.5 px-1.5 rounded">
                      Трек: {not.trackName}
                    </span>
                  )}
                </div>

                {/* Time Indicator */}
                <span className="text-[8px] text-neutral-500 mt-1 flex items-center gap-0.5 font-mono">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(not.timestamp)}
                </span>
              </button>

              {/* Individual read toggle button */}
              {!not.read && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkAsRead(not.id);
                  }}
                  disabled={readAllPending || pendingNotificationId === not.id}
                  className="absolute right-2 top-2.5 p-1 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-indigo-400 hover:text-white rounded-md transition-all cursor-pointer"
                  title="Отметить как прочитанное"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
