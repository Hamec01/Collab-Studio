import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProjectList from "./ProjectList";
import type { AuthUser, Project } from "../types";
import { ApiError } from "../api/client";

const currentUser: AuthUser = {
  id: "user-1",
  username: "owner",
  displayName: "Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "user",
  emailVerifiedAt: "2026-07-04T08:00:00.000Z",
  ageAcknowledgedAt: "2026-07-04T08:00:00.000Z",
  createdAt: "2026-07-04T08:00:00.000Z",
  updatedAt: "2026-07-04T08:00:00.000Z",
};

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Album Project",
    type: "album",
    coverUrl: null,
    tags: [],
    currentUserRole: "owner",
    owner: {
      userId: "user-1",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
    },
    participants: [{
      userId: "user-1",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
      role: "owner",
      createdAt: "2026-07-04T08:00:00.000Z",
    }],
    members: [{
      userId: "user-1",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
      role: "owner",
      createdAt: "2026-07-04T08:00:00.000Z",
    }],
    tracks: [],
    createdAt: "2026-07-04T08:00:00.000Z",
    updatedAt: "2026-07-04T08:00:00.000Z",
    ...overrides,
  };
}

function renderProjectList(overrides: Partial<React.ComponentProps<typeof ProjectList>> = {}) {
  const project = buildProject();
  render(
    <ProjectList
      projects={[project]}
      activeProject={project}
      activeTrack={null}
      onSelectProject={vi.fn()}
      onSelectTrack={vi.fn()}
      onCreateProject={vi.fn(async () => {})}
      onAddTrack={vi.fn(async () => {})}
      onAddMember={vi.fn(async () => {})}
      onUpdateMemberRole={vi.fn(async () => {})}
      onRemoveMember={vi.fn(async () => {})}
      onDeleteProject={vi.fn(async () => {})}
      currentUser={currentUser}
      {...overrides}
    />,
  );
}

describe("ProjectList project and track submit UX", () => {
  it("shows verification denial and keeps the project form open after a failed submit", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn(async () => {
      throw new ApiError("Email verification is required for this action", 403, "EMAIL_VERIFICATION_REQUIRED");
    });

    renderProjectList({ projects: [], activeProject: null, onCreateProject });

    await user.click(screen.getByRole("button", { name: "Создать" }));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ПРОЕКТА"), "Single Project");
    await user.clear(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"), "Main Track");
    await user.click(screen.getByRole("button", { name: "Создать проект" }));

    expect(await screen.findByText("Подтвердите email, чтобы создавать проекты и треки.")).toBeInTheDocument();
    expect(screen.getByLabelText("НАЗВАНИЕ ПРОЕКТА")).toHaveValue("Single Project");
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it("closes and resets the project form after a successful submit", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn(async () => {});

    renderProjectList({ projects: [], activeProject: null, onCreateProject });

    await user.click(screen.getByRole("button", { name: "Создать" }));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ПРОЕКТА"), "Single Project");
    await user.clear(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"), "Main Track");
    await user.click(screen.getByRole("button", { name: "Создать проект" }));

    await waitFor(() => expect(screen.queryByLabelText("НАЗВАНИЕ ПРОЕКТА")).not.toBeInTheDocument());
    expect(onCreateProject).toHaveBeenCalledWith("Single Project", "single", "Main Track", [], undefined);
  });

  it("prevents duplicate project creation on double submit while pending", async () => {
    const user = userEvent.setup();
    let resolvePromise: (() => void) | null = null;
    const onCreateProject = vi.fn(() => new Promise<void>((resolve) => { resolvePromise = resolve; }));

    renderProjectList({ projects: [], activeProject: null, onCreateProject });

    await user.click(screen.getByRole("button", { name: "Создать" }));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ПРОЕКТА"), "Single Project");
    await user.clear(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ОСНОВНОГО ТРЕКА"), "Main Track");
    await user.dblClick(screen.getByRole("button", { name: "Создать проект" }));

    expect(onCreateProject).toHaveBeenCalledTimes(1);
    resolvePromise?.();
  });

  it("keeps the add-track form open on failure and closes it on success", async () => {
    const user = userEvent.setup();
    const onAddTrack = vi.fn()
      .mockRejectedValueOnce(new ApiError("18+ acknowledgement is required for this action", 403, "AGE_ACKNOWLEDGEMENT_REQUIRED"))
      .mockResolvedValueOnce(undefined);

    renderProjectList({ onAddTrack });

    await user.click(screen.getByRole("button", { name: /Добавить трек/i }));
    await user.type(screen.getByPlaceholderText("Название трека..."), "Track A");
    await user.click(screen.getByRole("button", { name: "ОК" }));

    expect(await screen.findByText("Подтвердите 18+, чтобы создавать проекты и треки.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Название трека...")).toHaveValue("Track A");

    await user.click(screen.getByRole("button", { name: "ОК" }));

    await waitFor(() => expect(screen.queryByPlaceholderText("Название трека...")).not.toBeInTheDocument());
    expect(onAddTrack).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate track creation on double submit while pending", async () => {
    const user = userEvent.setup();
    let resolvePromise: (() => void) | null = null;
    const onAddTrack = vi.fn(() => new Promise<void>((resolve) => { resolvePromise = resolve; }));

    renderProjectList({ onAddTrack });

    await user.click(screen.getByRole("button", { name: /Добавить трек/i }));
    await user.type(screen.getByLabelText("НАЗВАНИЕ ТРЕКА"), "Track B");
    await user.dblClick(screen.getByRole("button", { name: "ОК" }));

    expect(onAddTrack).toHaveBeenCalledTimes(1);
    resolvePromise?.();
  });
});
