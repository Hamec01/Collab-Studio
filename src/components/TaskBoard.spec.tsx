import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TaskBoard from "./TaskBoard";
import type { ProjectMember, Task } from "../types";

const participants: ProjectMember[] = [{
  userId: "user-1",
  username: "writer",
  displayName: "Writer",
  avatarUrl: null,
  role: "editor",
  createdAt: "2026-07-06T00:00:00.000Z",
}];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Fix chorus",
    description: overrides.description ?? null,
    status: overrides.status ?? "todo",
    createdById: overrides.createdById ?? "user-1",
    createdBy: overrides.createdBy ?? null,
    assignedToId: overrides.assignedToId ?? "user-1",
    assignedTo: overrides.assignedTo ?? "Writer",
    assignedToUser: overrides.assignedToUser ?? null,
    timestamp: overrides.timestamp ?? "2026-07-06T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-06T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-06T00:00:00.000Z",
  };
}

describe("TaskBoard", () => {
  it("creates a task once and closes the form on success", async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn(async () => {});

    render(
      <TaskBoard
        tasks={[]}
        onAddTask={onAddTask}
        onUpdateTaskStatus={vi.fn()}
        participants={participants}
        canEdit
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить" }));
    await user.type(screen.getByPlaceholderText("Например: Переписать бэк-вокал припева"), "New task");
    await user.click(screen.getByRole("button", { name: "Создать" }));

    expect(onAddTask).toHaveBeenCalledTimes(1);
    expect(onAddTask).toHaveBeenCalledWith("New task", undefined);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Например: Переписать бэк-вокал припева")).not.toBeInTheDocument();
    });
  });

  it("keeps the form open and shows an error when create fails", async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn(async () => {
      throw new Error("boom");
    });

    render(
      <TaskBoard
        tasks={[]}
        onAddTask={onAddTask}
        onUpdateTaskStatus={vi.fn()}
        participants={participants}
        canEdit
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить" }));
    await user.type(screen.getByPlaceholderText("Например: Переписать бэк-вокал припева"), "Will fail");
    await user.click(screen.getByRole("button", { name: "Создать" }));

    expect(onAddTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось создать задачу.");
    expect(screen.getByDisplayValue("Will fail")).toBeInTheDocument();
  });

  it("shows read-only task state for viewers", () => {
    render(
      <TaskBoard
        tasks={[makeTask()]}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
        participants={participants}
        canEdit={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Добавить" })).toBeDisabled();
    expect(screen.getByText("У вас нет прав создавать задачи и менять их статусы.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows an error when status update fails", async () => {
    const user = userEvent.setup();
    const onUpdateTaskStatus = vi.fn(async () => {
      throw new Error("boom");
    });

    render(
      <TaskBoard
        tasks={[makeTask()]}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={onUpdateTaskStatus}
        participants={participants}
        canEdit
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "done");

    expect(onUpdateTaskStatus).toHaveBeenCalledTimes(1);
    expect(onUpdateTaskStatus).toHaveBeenCalledWith("task-1", "done");
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось обновить статус задачи.");
  });
});
