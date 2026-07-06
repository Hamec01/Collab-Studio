import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatPanel } from "./ProjectChatPanel";
import type { AuthUser, Project } from "../../types";

const currentUser: AuthUser = {
  id: "user-1",
  username: "owner",
  displayName: "Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "user",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const project: Project = {
  id: "project-1",
  title: "Album Project",
  type: "album",
  coverUrl: null,
  tags: [],
  currentUserRole: "editor",
  owner: null,
  participants: [],
  members: [],
  chat: [],
  tracks: [],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

describe("ProjectChatPanel", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders project-specific chat copy", () => {
    render(
      <ProjectChatPanel
        project={project}
        currentUser={currentUser}
        canSend
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("ЧАТ ПРОЕКТА")).toBeInTheDocument();
    expect(screen.getByText("Общие сообщения по проекту без привязки к конкретному треку")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Напишите участникам проекта...")).toBeInTheDocument();
  });

  it("shows project read-only guidance for viewers", () => {
    render(
      <ProjectChatPanel
        project={project}
        currentUser={currentUser}
        canSend={false}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Чат проекта доступен только редакторам")).toBeDisabled();
    expect(screen.getByText("У вас нет прав на отправку сообщений в чат проекта.")).toBeInTheDocument();
  });
});
