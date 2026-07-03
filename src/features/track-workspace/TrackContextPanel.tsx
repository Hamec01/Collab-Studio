import type React from "react";
import ChatRoom from "../../components/ChatRoom";
import CommentsPanel from "../../components/CommentsPanel";
import RhymeFinder from "../../components/RhymeFinder";
import TaskBoard from "../../components/TaskBoard";
import type { AuthUser, Project, Task, Track } from "../../types";

export type TrackSidebar = "comments" | "chat" | "tasks" | "rhymes";

type TrackContextPanelProps = {
  track: Track;
  project: Project | null;
  currentUser: AuthUser;
  activeSidebar: TrackSidebar;
  canResolve: boolean;
  canEdit: boolean;
  canSend: boolean;
  draftLyrics: string;
  selectedLineIndex: number | null;
  onSelectSidebar: React.Dispatch<React.SetStateAction<TrackSidebar>>;
  onClearSelectedLine: () => void;
  onAddComment: (text: string, lineIndex?: number) => void;
  onResolveComment: (commentId: string) => void;
  onSendMessage: (text: string) => void;
  onAddTask: (title: string, assignedToId?: string) => void;
  onUpdateTaskStatus: (taskId: string, status: Task["status"]) => void;
  onUnauthorized: () => void;
};

const tabs: Array<{ key: TrackSidebar; label: string }> = [
  { key: "comments", label: "Правки" },
  { key: "chat", label: "Чат" },
  { key: "tasks", label: "Задачи" },
  { key: "rhymes", label: "AI" },
];

export function TrackContextPanel({
  track,
  project,
  currentUser,
  activeSidebar,
  canResolve,
  canEdit,
  canSend,
  draftLyrics,
  selectedLineIndex,
  onSelectSidebar,
  onClearSelectedLine,
  onAddComment,
  onResolveComment,
  onSendMessage,
  onAddTask,
  onUpdateTaskStatus,
  onUnauthorized,
}: TrackContextPanelProps) {
  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 p-1">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => onSelectSidebar(tab.key)}
            className={`flex-1 rounded-lg p-2 text-[10px] font-bold ${activeSidebar === tab.key ? "bg-indigo-600 text-white" : "text-neutral-400"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[360px] flex-1">
        {activeSidebar === "comments" && (
          <CommentsPanel
            comments={track.comments}
            onAddComment={onAddComment}
            onResolveComment={onResolveComment}
            canResolve={canResolve}
            selectedLineIndex={selectedLineIndex}
            onClearSelectedLine={onClearSelectedLine}
            lyricsLines={draftLyrics.split("\n")}
          />
        )}
        {activeSidebar === "chat" && (
          <ChatRoom chat={track.chat} onSendMessage={onSendMessage} currentUser={currentUser} canSend={canSend} />
        )}
        {activeSidebar === "tasks" && (
          <TaskBoard
            tasks={track.tasks}
            onAddTask={onAddTask}
            onUpdateTaskStatus={onUpdateTaskStatus}
            participants={project?.participants ?? []}
            canEdit={canEdit}
          />
        )}
        {activeSidebar === "rhymes" && <RhymeFinder onUnauthorized={onUnauthorized} />}
      </div>
    </div>
  );
}
