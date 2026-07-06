import React, { useState } from "react";
import { Plus, CheckCircle2, Circle, Clock, CheckSquare } from "lucide-react";
import { ProjectMember, Task } from "../types";
import { ApiError } from "../api/client";

const isTaskStatus = (value: string): value is Task["status"] =>
  value === "todo" || value === "in-progress" || value === "done";

interface TaskBoardProps {
  tasks: Task[];
  onAddTask: (title: string, assignedToId?: string) => Promise<void> | void;
  onUpdateTaskStatus: (taskId: string, status: "todo" | "in-progress" | "done") => Promise<void> | void;
  participants: ProjectMember[];
  canEdit: boolean;
}

export default function TaskBoard({ tasks, onAddTask, onUpdateTaskStatus, participants, canEdit }: TaskBoardProps) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !canEdit || isSubmitting) return;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onAddTask(title.trim(), assignedTo || undefined);
      setTitle("");
      setAssignedTo("");
      setShowAdd(false);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Не удалось создать задачу.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId: string, value: string) => {
    if (!canEdit || updatingTaskId) return;
    if (!isTaskStatus(value)) return;
    setErrorMessage("");
    setUpdatingTaskId(taskId);
    try {
      await onUpdateTaskStatus(taskId, value);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Не удалось обновить статус задачи.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const progressTasks = tasks.filter((t) => t.status === "in-progress");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const renderTaskCard = (task: Task) => (
    <div
      key={task.id}
      className="bg-neutral-900 border border-neutral-800 p-2.5 rounded-lg text-xs flex flex-col gap-1.5 hover:border-neutral-700 transition-colors"
    >
      <div className="text-white font-medium break-words leading-normal">{task.title}</div>
        <div className="flex items-center justify-between mt-1">
        {task.assignedTo ? (
          <span className="text-[10px] bg-indigo-950/40 text-indigo-300 border border-indigo-900/30 px-1.5 py-0.5 rounded">
            {task.assignedTo}
          </span>
        ) : (
          <span className="text-[10px] text-neutral-500 italic">Без исполнителя</span>
        )}

        {/* Change status action */}
        <select
          value={task.status}
          onChange={(e) => void handleStatusChange(task.id, e.target.value)}
          disabled={!canEdit || updatingTaskId === task.id}
          className="bg-neutral-950 border border-neutral-800 rounded p-0.5 text-[9px] text-neutral-400 focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="todo">Ждёт</option>
          <option value="in-progress">В работе</option>
          <option value="done">Готово</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-2 mb-3">
        <div>
          <h3 className="text-xs font-mono text-neutral-400 font-semibold uppercase tracking-wider">ЗАДАЧИ И СТАТУСЫ</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Трекинг процесса работы над треком</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          disabled={!canEdit}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white p-1 px-2 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Добавить
        </button>
      </div>

      {errorMessage && (
        <div className="mb-3 rounded-lg border border-red-900/30 bg-red-950/40 p-2 text-xs text-red-300" role="alert">
          {errorMessage}
        </div>
      )}

      {showAdd && canEdit && (
        <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg mb-4 space-y-2 text-xs">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">ЧТО НУЖНО СДЕЛАТЬ</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Переписать бэк-вокал припева"
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">ОТВЕТСТВЕННЫЙ</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              <option value="">Не назначен</option>
              {participants.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              disabled={isSubmitting}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded font-medium"
            >
              Создать
            </button>
          </div>
        </form>
      )}

      {!canEdit && (
        <p className="mb-3 text-[11px] text-neutral-500">
          У вас нет прав создавать задачи и менять их статусы.
        </p>
      )}

      {/* Columns */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {/* TO DO COLUMN */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-900 pb-1">
            <Circle className="w-3 h-3 text-red-500" />
            НУЖНО СДЕЛАТЬ ({todoTasks.length})
          </div>
          <div className="space-y-2">
            {todoTasks.length === 0 ? (
              <p className="text-[10px] text-neutral-500 italic px-1">Задач нет</p>
            ) : (
              todoTasks.map(renderTaskCard)
            )}
          </div>
        </div>

        {/* IN PROGRESS COLUMN */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-900 pb-1">
            <Clock className="w-3 h-3 text-amber-500" />
            В РАБОТЕ ({progressTasks.length})
          </div>
          <div className="space-y-2">
            {progressTasks.length === 0 ? (
              <p className="text-[10px] text-neutral-500 italic px-1">Нет текущих задач</p>
            ) : (
              progressTasks.map(renderTaskCard)
            )}
          </div>
        </div>

        {/* DONE COLUMN */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-900 pb-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ЗАВЕРШЕНО ({doneTasks.length})
          </div>
          <div className="space-y-2">
            {doneTasks.length === 0 ? (
              <p className="text-[10px] text-neutral-500 italic px-1">Нет готовых задач</p>
            ) : (
              doneTasks.map(renderTaskCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
