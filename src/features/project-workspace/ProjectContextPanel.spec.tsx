import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextPanel } from "./ProjectContextPanel";
import type { AuthUser, Project, Task } from "../../types";

const currentUser: AuthUser = {
  id: "user-1",
  username: "owner",
  displayName: "Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "user",
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:00.000Z",
};

const project: Project = {
  id: "project-1",
  title: "Album Project",
  type: "album",
  coverUrl: null,
  tags: [],
  currentUserRole: "editor",
  owner: null,
  participants: [{
    userId: "user-1",
    username: "owner",
    displayName: "Owner",
    avatarUrl: null,
    role: "editor",
    createdAt: "2026-07-07T00:00:00.000Z",
  }],
  members: [{
    userId: "user-1",
    username: "owner",
    displayName: "Owner",
    avatarUrl: null,
    role: "editor",
    createdAt: "2026-07-07T00:00:00.000Z",
  }],
  chat: [],
  tasks: [{
    id: "task-1",
    title: "Sequence track list",
    description: null,
    status: "todo",
    createdById: "user-1",
    createdBy: null,
    assignedToId: "user-1",
    assignedTo: "Owner",
    assignedToUser: null,
    timestamp: "2026-07-07T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  }],
  tracks: [],
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:00.000Z",
};

describe("ProjectContextPanel", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("shows project chat by default and switches to project tasks", async () => {
    const user = userEvent.setup();

    render(
      <ProjectContextPanel
        project={project}
        currentUser={currentUser}
        canSend
        canEdit
        onSendMessage={vi.fn()}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
      />,
    );

    expect(screen.getByText("ЧАТ ПРОЕКТА")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Задачи" }));

    expect(screen.getByText("ЗАДАЧИ ПРОЕКТА")).toBeInTheDocument();
    expect(screen.getByText("Sequence track list")).toBeInTheDocument();
  });

  it("passes read-only task state for viewers", async () => {
    const user = userEvent.setup();

    render(
      <ProjectContextPanel
        project={project}
        currentUser={currentUser}
        canSend={false}
        canEdit={false}
        onSendMessage={vi.fn()}
        onAddTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Задачи" }));

    expect(screen.getByText("У вас нет прав создавать проектные задачи и менять их статусы.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeDisabled();
  });
});
