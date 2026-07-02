import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceQuery } from "./useWorkspaceQuery";

vi.mock("../../api/projects", () => ({
  listProjects: vi.fn(),
  getTrack: vi.fn(),
}));

vi.mock("../../api/notifications", () => ({
  listNotifications: vi.fn(),
}));

import { getTrack, listProjects } from "../../api/projects";
import { listNotifications } from "../../api/notifications";

const listProjectsMock = vi.mocked(listProjects);
const listNotificationsMock = vi.mocked(listNotifications);
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
});
