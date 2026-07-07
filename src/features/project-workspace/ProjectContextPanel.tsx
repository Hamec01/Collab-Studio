import type { AuthUser, Project, Task } from "../../types";
import { ProjectActivityPanel } from "./ProjectActivityPanel";
import { ProjectChatPanel } from "./ProjectChatPanel";
import { ProjectTasksPanel } from "./ProjectTasksPanel";

export type ProjectSidebar = "chat" | "tasks" | "activity";

type ProjectContextPanelProps = {
  project: Project;
  currentUser: AuthUser | null;
  activeSidebar: ProjectSidebar;
  canSend: boolean;
  canEdit: boolean;
  onSelectSidebar: (sidebar: ProjectSidebar) => void;
  onSendMessage: (text: string) => Promise<void> | void;
  onAddTask: (title: string, assignedToId?: string) => Promise<void> | void;
  onUpdateTaskStatus: (taskId: string, status: Task["status"]) => Promise<void> | void;
};

const tabs: Array<{ key: ProjectSidebar; label: string }> = [
  { key: "chat", label: "Чат" },
  { key: "tasks", label: "Задачи" },
  { key: "activity", label: "Активность" },
];

export function ProjectContextPanel({
  project,
  currentUser,
  activeSidebar,
  canSend,
  canEdit,
  onSelectSidebar,
  onSendMessage,
  onAddTask,
  onUpdateTaskStatus,
}: ProjectContextPanelProps) {
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
        {activeSidebar === "chat" ? (
          <ProjectChatPanel
            project={project}
            currentUser={currentUser}
            canSend={canSend}
            onSendMessage={onSendMessage}
          />
        ) : activeSidebar === "tasks" ? (
          <ProjectTasksPanel
            project={project}
            canEdit={canEdit}
            onAddTask={onAddTask}
            onUpdateTaskStatus={onUpdateTaskStatus}
          />
        ) : (
          <ProjectActivityPanel project={project} />
        )}
      </div>
    </div>
  );
}
