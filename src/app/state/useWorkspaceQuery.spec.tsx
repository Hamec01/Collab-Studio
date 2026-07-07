import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceQuery } from "./useWorkspaceQuery";

vi.mock("../../api/projects", () => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
  getTrack: vi.fn(),
}));

vi.mock("../../api/notifications", () => ({
  listNotifications: vi.fn(),
}));

import { getProject, getTrack, listProjects } from "../../api/projects";
import { listNotifications } from "../../api/notifications";

const listProjectsMock = vi.mocked(listProjects);
const listNotificationsMock = vi.mocked(listNotifications);
const getProjectMock = vi.mocked(getProject);
const getTrackMock = vi.mocked(getTrack);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useWorkspaceQuery abort behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("aborts stale workspace requests on auth transition", async () => {
    const firstProjects = deferred<never>();
    const firstNotifications = deferred<never>();
    let firstProjectSignal: AbortSignal | undefined;

    listProjectsMock.mockImplementation((signal?: AbortSignal) => {
      if (!firstProjectSignal) {
        firstProjectSignal = signal;
        return firstProjects.promise;
      }
      return Promise.resolve([]);
    });

    listNotificationsMock.mockImplementation((signal?: AbortSignal) => {
      if (signal === firstProjectSignal) {
        return firstNotifications.promise;
      }
      return Promise.resolve([]);
    });

    const withAuth = async <T,>(op: () => Promise<T>) => op();

    const { rerender } = renderHook(
      ({ authPhase, currentUserId }: { authPhase: "loading" | "authenticated" | "unauthenticated"; currentUserId: string | null }) =>
        useWorkspaceQuery({
          authPhase,
          currentUserId,
          withAuth,
        }),
      {
        initialProps: { authPhase: "authenticated" as const, currentUserId: "u1" },
      },
    );

    await waitFor(() => expect(listProjectsMock).toHaveBeenCalledTimes(1));
    expect(firstProjectSignal?.aborted).toBe(false);

    rerender({ authPhase: "unauthenticated", currentUserId: null });

    await waitFor(() => expect(firstProjectSignal?.aborted).toBe(true));

    firstProjects.reject(new DOMException("Aborted", "AbortError"));
    firstNotifications.reject(new DOMException("Aborted", "AbortError"));
  });

  it("aborts previous track refresh request when a new one starts", async () => {
    const firstTrack = deferred<never>();
    let firstSignal: AbortSignal | undefined;

    getTrackMock.mockImplementation((projectId: string, trackId: string, signal?: AbortSignal) => {
      if (projectId === "p1" && trackId === "t1") {
        firstSignal = signal;
        return firstTrack.promise;
      }
      return Promise.resolve({
        id: "t2",
        title: "Track 2",
        lyrics: "",
        lyricsRevision: 0,
        tags: [],
        versionHistory: [],
        lyricVersions: [],
        audioVersions: [],
        comments: [],
        chat: [],
        tasks: [],
        annotations: [],
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      });
    });

    listProjectsMock.mockResolvedValue([]);
    listNotificationsMock.mockResolvedValue([]);

    const withAuth = async <T,>(op: () => Promise<T>) => op();

    const { result } = renderHook(() =>
      useWorkspaceQuery({
        authPhase: "authenticated",
        currentUserId: "u1",
        withAuth,
      }),
    );

    await act(async () => {
      void result.current.refreshActiveTrack("p1", "t1");
    });

    await waitFor(() => expect(getTrackMock).toHaveBeenCalledWith("p1", "t1", expect.any(AbortSignal)));

    await act(async () => {
      void result.current.refreshActiveTrack("p1", "t2");
    });

    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    firstTrack.reject(new DOMException("Aborted", "AbortError"));
  });

  it("aborts previous project refresh request when a new one starts", async () => {
    const firstProject = deferred<never>();
    let firstSignal: AbortSignal | undefined;

    getProjectMock.mockImplementation((projectId: string, signal?: AbortSignal) => {
      if (projectId === "p1") {
        firstSignal = signal;
        return firstProject.promise;
      }
      return Promise.resolve({
        id: "p2",
        title: "Project 2",
        type: "album",
        coverUrl: null,
        tags: [],
        currentUserRole: "editor",
        owner: null,
        participants: [],
        members: [],
        chat: [],
        tracks: [],
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      });
    });

    listProjectsMock.mockResolvedValue([]);
    listNotificationsMock.mockResolvedValue([]);

    const withAuth = async <T,>(op: () => Promise<T>) => op();

    const { result } = renderHook(() =>
      useWorkspaceQuery({
        authPhase: "authenticated",
        currentUserId: "u1",
        withAuth,
      }),
    );

    await act(async () => {
      void result.current.refreshActiveProject("p1");
    });

    await waitFor(() => expect(getProjectMock).toHaveBeenCalledWith("p1", expect.any(AbortSignal)));

    await act(async () => {
      void result.current.refreshActiveProject("p2");
    });

    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    firstProject.reject(new DOMException("Aborted", "AbortError"));
  });

  it("polls notifications on interval and focus when workspace is ready", async () => {
    vi.useFakeTimers();
    listProjectsMock.mockResolvedValue([]);
    listNotificationsMock.mockResolvedValue([]);

    const withAuth = async <T,>(op: () => Promise<T>) => op();

    renderHook(() =>
      useWorkspaceQuery({
        authPhase: "authenticated",
        currentUserId: "u1",
        withAuth,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(listNotificationsMock).toHaveBeenCalledTimes(1);
    listNotificationsMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
    });

    expect(listNotificationsMock).toHaveBeenCalledTimes(1);

    listNotificationsMock.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(listNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it("skips polling while hidden or offline", async () => {
    vi.useFakeTimers();
    listProjectsMock.mockResolvedValue([]);
    listNotificationsMock.mockResolvedValue([]);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    const withAuth = async <T,>(op: () => Promise<T>) => op();

    renderHook(() =>
      useWorkspaceQuery({
        authPhase: "authenticated",
        currentUserId: "u1",
        withAuth,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(listNotificationsMock).toHaveBeenCalledTimes(1);
    listNotificationsMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(listNotificationsMock).not.toHaveBeenCalled();
  });
});
