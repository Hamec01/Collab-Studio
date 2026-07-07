import TaskBoard from "../../components/TaskBoard";
import type { Project, Task } from "../../types";

type ProjectTasksPanelProps = {
  project: Project;
  canEdit: boolean;
  onAddTask: (title: string, assignedToId?: string) => Promise<void> | void;
  onUpdateTaskStatus: (taskId: string, status: Task["status"]) => Promise<void> | void;
};

export function ProjectTasksPanel({ project, canEdit, onAddTask, onUpdateTaskStatus }: ProjectTasksPanelProps) {
  return (
    <TaskBoard
      tasks={project.tasks ?? []}
      onAddTask={onAddTask}
      onUpdateTaskStatus={onUpdateTaskStatus}
      participants={project.participants}
      canEdit={canEdit}
      boardTitle="ЗАДАЧИ ПРОЕКТА"
      description="Общие задачи по проекту без привязки к конкретному треку"
      emptyTodoLabel="В проекте пока нет открытых задач"
      emptyProgressLabel="Нет проектных задач в работе"
      emptyDoneLabel="Нет завершённых проектных задач"
      taskPlaceholder="Например: Согласовать финальный список треков"
      readOnlyMessage="У вас нет прав создавать проектные задачи и менять их статусы."
    />
  );
}
