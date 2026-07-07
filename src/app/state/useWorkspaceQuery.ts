import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "../../api/client";
import { listNotifications } from "../../api/notifications";
import { getProject, getTrack, listProjects } from "../../api/projects";
import type { AppNotification, Project, Track } from "../../types";

type UseWorkspaceQueryArgs = {
  authPhase: "loading" | "authenticated" | "unauthenticated";
  currentUserId: string | null;
  withAuth: <T>(operation: () => Promise<T>) => Promise<T>;
};

const NOTIFICATIONS_POLL_INTERVAL_MS = 60_000;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useWorkspaceQuery({
  authPhase,
  currentUserId,
  withAuth,
}: UseWorkspaceQueryArgs) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [notificationsSyncing, setNotificationsSyncing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const workspaceControllerRef = useRef<AbortController | null>(null);
  const trackControllerRef = useRef<AbortController | null>(null);
  const notificationsControllerRef = useRef<AbortController | null>(null);
  const notificationsPollTimerRef = useRef<number | null>(null);
  const notificationsSyncInFlightRef = useRef(false);

  const abortAll = useCallback(() => {
    workspaceControllerRef.current?.abort();
    trackControllerRef.current?.abort();
    notificationsControllerRef.current?.abort();
    if (notificationsPollTimerRef.current !== null) {
      window.clearInterval(notificationsPollTimerRef.current);
      notificationsPollTimerRef.current = null;
    }
    workspaceControllerRef.current = null;
    trackControllerRef.current = null;
    notificationsControllerRef.current = null;
    notificationsSyncInFlightRef.current = false;
  }, []);

  const resetWorkspaceQuery = useCallback(() => {
    abortAll();
    setProjects([]);
    setNotifications([]);
    setWorkspaceReady(false);
    setWorkspaceLoading(false);
    setWorkspaceError("");
    setNotificationsSyncing(false);
  }, [abortAll]);

  const loadWorkspace = useCallback(async () => {
    workspaceControllerRef.current?.abort();
    const controller = new AbortController();
    workspaceControllerRef.current = controller;

    setWorkspaceLoading(true);
    setWorkspaceError("");

    try {
      const [projectList, notificationList] = await withAuth(() =>
        Promise.all([listProjects(controller.signal), listNotifications(controller.signal)]),
      );

      if (controller.signal.aborted) return;
      setProjects(projectList);
      setNotifications(notificationList);
      setWorkspaceReady(true);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (isApiError(error) && error.status === 401) return;
      setWorkspaceError(error instanceof Error ? error.message : "Не удалось загрузить рабочее пространство");
    } finally {
      if (!controller.signal.aborted) {
        setWorkspaceLoading(false);
      }
    }
  }, [withAuth]);

  const refreshActiveTrack = useCallback(async (projectId: string, trackId: string) => {
    if (!projectId || !trackId) return;

    trackControllerRef.current?.abort();
    const controller = new AbortController();
    trackControllerRef.current = controller;

    try {
      const track = await withAuth(() => getTrack(projectId, trackId, controller.signal));
      if (controller.signal.aborted) return;

      setProjects((prev) =>
        prev.map((project) =>
          project.id !== projectId
            ? project
            : {
                ...project,
                tracks: project.tracks.map((existing) => (existing.id === track.id ? track : existing)),
              },
        ),
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (isApiError(error) && error.status === 401) return;
      throw error;
    }
  }, [withAuth]);

  const refreshActiveProject = useCallback(async (projectId: string) => {
    if (!projectId) return;

    workspaceControllerRef.current?.abort();
    const controller = new AbortController();
    workspaceControllerRef.current = controller;

    try {
      const project = await withAuth(() => getProject(projectId, controller.signal));
      if (controller.signal.aborted) return;

      setProjects((prev) =>
        prev.map((existing) => (existing.id === projectId ? project : existing)),
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (isApiError(error) && error.status === 401) return;
      throw error;
    }
  }, [withAuth]);

  const refreshNotifications = useCallback(async (options?: { suppressErrors?: boolean }) => {
    if (notificationsSyncInFlightRef.current) return;
    notificationsControllerRef.current?.abort();
    const controller = new AbortController();
    notificationsControllerRef.current = controller;
    notificationsSyncInFlightRef.current = true;
    setNotificationsSyncing(true);

    try {
      const list = await withAuth(() => listNotifications(controller.signal));
      if (controller.signal.aborted) return;
      setNotifications(list);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (isApiError(error) && error.status === 401) return;
      if (options?.suppressErrors) return;
      throw error;
    } finally {
      if (!controller.signal.aborted) {
        setNotificationsSyncing(false);
      }
      notificationsSyncInFlightRef.current = false;
    }
  }, [withAuth]);

  const invalidateWorkspace = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const updateTrackInProjects = useCallback((projectId: string, trackId: string, updater: (track: Track) => Track) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id !== projectId
          ? project
          : {
              ...project,
              tracks: project.tracks.map((track) => (track.id !== trackId ? track : updater(track))),
            },
      ),
    );
  }, []);

  useEffect(() => {
    if (authPhase !== "authenticated" || !currentUserId) return;
    void loadWorkspace();
  }, [authPhase, currentUserId, reloadToken, loadWorkspace]);

  useEffect(() => {
    if (authPhase !== "authenticated" || !currentUserId || !workspaceReady) return;

    const canSync = () =>
      document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine !== false);

    const syncNotifications = () => {
      if (!canSync()) return;
      void refreshNotifications({ suppressErrors: true });
    };

    notificationsPollTimerRef.current = window.setInterval(syncNotifications, NOTIFICATIONS_POLL_INTERVAL_MS);

    const handleFocus = () => {
      syncNotifications();
    };
    const handleVisibilityChange = () => {
      syncNotifications();
    };
    const handleOnline = () => {
      syncNotifications();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (notificationsPollTimerRef.current !== null) {
        window.clearInterval(notificationsPollTimerRef.current);
        notificationsPollTimerRef.current = null;
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authPhase, currentUserId, workspaceReady, refreshNotifications]);

  useEffect(() => {
    if (authPhase === "unauthenticated") {
      resetWorkspaceQuery();
    }
  }, [authPhase, resetWorkspaceQuery]);

  useEffect(() => {
    return () => {
      abortAll();
    };
  }, [abortAll]);

  return {
    projects,
    setProjects,
    notifications,
    setNotifications,
    notificationsSyncing,
    workspaceReady,
    workspaceLoading,
    workspaceError,
    refreshActiveProject,
    refreshActiveTrack,
    refreshNotifications,
    invalidateWorkspace,
    updateTrackInProjects,
    resetWorkspaceQuery,
  };
}
