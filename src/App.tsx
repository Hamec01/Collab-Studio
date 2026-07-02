import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Annotation,
  AppNotification,
  AuthUser,
  Project,
  Task,
  Track,
} from "./types";
import AuthModal from "./components/AuthModal";
import ProjectList from "./components/ProjectList";
import LyricsEditor, { type LyricsSaveStatus, type RestoreDraftSnapshot } from "./components/LyricsEditor";
import AudioPlayer from "./components/AudioPlayer";
import CommentsPanel from "./components/CommentsPanel";
import ChatRoom from "./components/ChatRoom";
import TaskBoard from "./components/TaskBoard";
import RhymeFinder from "./components/RhymeFinder";
import NotificationsPanel from "./components/NotificationsPanel";
import { FolderOpen, MessageSquare, Music, Sparkles } from "lucide-react";
import { ApiError, isApiError } from "./api/client";
import { getAuthProviders, getCurrentUser, login, logout, register } from "./api/auth";
import {
  addProjectMember,
  attachExternalAudio,
  createAnnotation,
  createComment,
  createLyricVersion,
  createProject,
  createTask,
  createTrack,
  getTrack,
  listProjects,
  pinLyricVersion,
  postChatMessage,
  saveLyricsDraft,
  removeProjectMember,
  resolveComment,
  updateProjectMemberRole,
  updateTask,
  uploadTrackAudio,
  deleteProject,
} from "./api/projects";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api/notifications";
import { buildLyricsDraftKey, deleteLyricsDraft, readLyricsDraft, writeLyricsDraft } from "./utils/lyricsDraftStore";
import {
  DraftScope,
  EmergencyDraftSnapshot,
  isLatestContentSynced,
  pickMostRecentDraft,
  shouldRestoreFromLocal,
} from "./utils/lyricsDraftRecovery";

type AuthPhase = "loading" | "authenticated" | "unauthenticated";
type Sidebar = "comments" | "chat" | "tasks" | "rhymes";
type MobileTab = "projects" | "editor" | "rightPanel";
type ExternalProvider = "google" | "yandex" | "telegram" | "other";

const AUDIO_LIMIT_BYTES = 25 * 1024 * 1024;
const AUDIO_ACCEPT = ".mp3,.wav,.flac,.ogg,.aac,.m4a,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/aac,audio/mp4,audio/webm";
const LYRICS_AUTOSAVE_DEBOUNCE_MS = 1500;
const LYRICS_RETRY_BASE_MS = 1200;
const LYRICS_RETRY_MAX_MS = 30000;

type DraftSyncState = "local-only" | "synced" | "conflict" | "error";

function emergencyDraftStorageKey(key: string) {
  return `lyrics-draft-emergency:${key}`;
}

function parseEmergencyDraft(raw: string | null): EmergencyDraftSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EmergencyDraftSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.key !== "string" || typeof parsed.content !== "string" || typeof parsed.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>("loading");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [selectedAudioVersionId, setSelectedAudioVersionId] = useState<string | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<Sidebar>("comments");
  const [mobileTab, setMobileTab] = useState<MobileTab>("projects");
  const [globalError, setGlobalError] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [extUrl, setExtUrl] = useState("");
  const [extLabel, setExtLabel] = useState("");
  const [extProvider, setExtProvider] = useState<ExternalProvider>("google");
  const [draftLyrics, setDraftLyrics] = useState("");
  const [draftRevision, setDraftRevision] = useState<string | null>(null);
  const [draftServerUpdatedAt, setDraftServerUpdatedAt] = useState<string | null>(null);
  const [lyricsSaveStatus, setLyricsSaveStatus] = useState<LyricsSaveStatus>("idle");
  const [lyricsSavedAt, setLyricsSavedAt] = useState<string | null>(null);
  const [lyricsStatusMessage, setLyricsStatusMessage] = useState<string>("");
  const [restoreDraftSnapshot, setRestoreDraftSnapshot] = useState<RestoreDraftSnapshot | null>(null);

  const requestSeq = useRef(0);
  const trackRequestSeq = useRef(0);
  const notificationRequestSeq = useRef(0);
  const draftGenerationRef = useRef(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedLyricsRef = useRef<string | null>(null);
  const retryAttemptRef = useRef(0);
  const persistFailureRef = useRef(false);
  const draftLyricsRef = useRef("");
  const draftRevisionRef = useRef<string | null>(null);
  const lastSyncedLyricsRef = useRef("");

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  const activeTrack = useMemo(
    () => activeProject?.tracks.find((track) => track.id === activeTrackId) || null,
    [activeProject, activeTrackId],
  );

  const projectRole = useMemo(() => {
    if (!currentUser || !activeProject) return null;
    return activeProject.currentUserRole ?? activeProject.participants.find((member) => member.userId === currentUser.id)?.role ?? null;
  }, [currentUser, activeProject]);

  const canEdit = projectRole === "owner" || projectRole === "editor";
  const canResolve = canEdit;
  const canSend = !!currentUser && !!activeProject && !!activeTrack;

  const clearDraftTimers = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const resetDraftRuntime = () => {
    draftGenerationRef.current += 1;
    clearDraftTimers();
    saveInFlightRef.current = false;
    queuedLyricsRef.current = null;
    retryAttemptRef.current = 0;
    persistFailureRef.current = false;
    setDraftLyrics("");
    setDraftRevision(null);
    setDraftServerUpdatedAt(null);
    setLyricsSaveStatus("idle");
    setLyricsSavedAt(null);
    setLyricsStatusMessage("");
    setRestoreDraftSnapshot(null);
    draftLyricsRef.current = "";
    draftRevisionRef.current = null;
    lastSyncedLyricsRef.current = "";
  };

  const currentDraftScope = () => {
    if (!currentUser || !activeProjectId || !activeTrackId) return null;
    return {
      userId: currentUser.id,
      projectId: activeProjectId,
      trackId: activeTrackId,
      key: buildLyricsDraftKey(currentUser.id, activeProjectId, activeTrackId),
    };
  };

  const readMergedLocalDraft = async (scope: DraftScope) => {
    const [indexedDbDraft, emergencyDraft] = await Promise.all([
      readLyricsDraft(scope.key).catch(() => null),
      Promise.resolve(parseEmergencyDraft(sessionStorage.getItem(emergencyDraftStorageKey(scope.key)))),
    ]);
    return pickMostRecentDraft(indexedDbDraft, emergencyDraft, scope);
  };

  const persistLocalDraft = async (syncState: DraftSyncState, contentOverride?: string) => {
    const scope = currentDraftScope();
    if (!scope) return;
    const content = contentOverride ?? draftLyricsRef.current;
    try {
      await writeLyricsDraft({
        key: scope.key,
        userId: scope.userId,
        projectId: scope.projectId,
        trackId: scope.trackId,
        content,
        baseRevision: draftRevisionRef.current ?? undefined,
        savedAt: new Date().toISOString(),
        serverUpdatedAt: draftServerUpdatedAt ?? undefined,
        syncState,
      });
      persistFailureRef.current = false;
    } catch {
      persistFailureRef.current = true;
    }
  };

  const persistEmergencyDraft = (syncState: DraftSyncState, contentOverride?: string) => {
    const scope = currentDraftScope();
    if (!scope) return;
    const content = contentOverride ?? draftLyricsRef.current;
    try {
      const payload: EmergencyDraftSnapshot = {
        key: scope.key,
        content,
        savedAt: new Date().toISOString(),
        baseRevision: draftRevisionRef.current ?? undefined,
        serverUpdatedAt: draftServerUpdatedAt ?? undefined,
        syncState,
      };
      sessionStorage.setItem(emergencyDraftStorageKey(scope.key), JSON.stringify(payload));
    } catch {
      // ignore sessionStorage errors; IndexedDB remains primary
    }
  };

  const clearEmergencyDraft = (key: string) => {
    try {
      sessionStorage.removeItem(emergencyDraftStorageKey(key));
    } catch {
      // ignore sessionStorage errors
    }
  };

  const clearWorkspace = () => {
    requestSeq.current += 1;
    trackRequestSeq.current += 1;
    notificationRequestSeq.current += 1;
    setProjects([]);
    setNotifications([]);
    setActiveProjectId(null);
    setActiveTrackId(null);
    setSelectedAudioVersionId(null);
    setSelectedLineIndex(null);
    setShowUploadModal(false);
    setUploadError("");
    setIsUploading(false);
    setExtUrl("");
    setExtLabel("");
    setExtProvider("google");
    setActiveSidebar("comments");
    setMobileTab("projects");
    resetDraftRuntime();
  };

  useEffect(() => {
    draftLyricsRef.current = draftLyrics;
  }, [draftLyrics]);

  useEffect(() => {
    draftRevisionRef.current = draftRevision;
  }, [draftRevision]);

  useEffect(() => {
    return () => {
      clearDraftTimers();
    };
  }, []);

  const handleUnauthorized = () => {
    if (authPhase === "unauthenticated" && !currentUser) return;
    clearWorkspace();
    setCurrentUser(null);
    setAuthPhase("unauthenticated");
    setSessionExpired(true);
  };

  const withAuth = async <T,>(operation: () => Promise<T>) => {
    try {
      return await operation();
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        handleUnauthorized();
      }
      throw error;
    }
  };

  const syncProjectSelection = (projectList: Project[]) => {
    if (projectList.length === 0) {
      setActiveProjectId(null);
      setActiveTrackId(null);
      setSelectedAudioVersionId(null);
      return;
    }

    const selectedProject = projectList.find((project) => project.id === activeProjectId) || projectList[0];
    setActiveProjectId(selectedProject.id);

    const selectedTrack = selectedProject.tracks.find((track) => track.id === activeTrackId) || selectedProject.tracks[0] || null;
    setActiveTrackId(selectedTrack?.id ?? null);
    setSelectedAudioVersionId((prev) => {
      if (!selectedTrack) return null;
      if (prev && selectedTrack.audioVersions.some((version) => version.id === prev)) return prev;
      return selectedTrack.audioVersions[0]?.id ?? null;
    });
  };

  const loadWorkspace = async () => {
    const seq = ++requestSeq.current;
    const [projectList, notificationList] = await Promise.all([listProjects(), listNotifications()]);
    if (seq !== requestSeq.current) return;
    setProjects(projectList);
    setNotifications(notificationList);
    syncProjectSelection(projectList);
  };

  const refreshActiveTrack = async () => {
    if (!activeProjectId || !activeTrackId) return;
    const seq = ++trackRequestSeq.current;
    const track = await withAuth(() => getTrack(activeProjectId, activeTrackId));
    if (seq !== trackRequestSeq.current) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id !== activeProjectId
          ? project
          : {
              ...project,
              tracks: project.tracks.map((existing) => (existing.id === track.id ? track : existing)),
            },
      ),
    );
    setSelectedAudioVersionId((prev) => {
      if (prev && track.audioVersions.some((version) => version.id === prev)) return prev;
      return track.audioVersions[0]?.id ?? null;
    });
  };

  const refreshNotifications = async () => {
    const seq = ++notificationRequestSeq.current;
    const list = await withAuth(() => listNotifications());
    if (seq !== notificationRequestSeq.current) return;
    setNotifications(list);
  };

  const updateTrackDraftState = (projectId: string, trackId: string, lyrics: string, updatedAt: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id !== projectId
          ? project
          : {
              ...project,
              tracks: project.tracks.map((track) =>
                track.id !== trackId
                  ? track
                  : {
                      ...track,
                      lyrics,
                      updatedAt,
                    },
              ),
            },
      ),
    );
  };

  const scheduleRetryAutosave = () => {
    if (retryTimerRef.current !== null) return;
    const waitMs = Math.min(LYRICS_RETRY_MAX_MS, LYRICS_RETRY_BASE_MS * 2 ** retryAttemptRef.current);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushLyricsAutosave(draftLyricsRef.current);
    }, waitMs);
    retryAttemptRef.current += 1;
  };

  const flushLyricsAutosave = async (contentOverride?: string) => {
    const scope = currentDraftScope();
    if (!scope || !canEdit) return false;

    const generation = draftGenerationRef.current;
    const content = contentOverride ?? draftLyricsRef.current;

    if (saveInFlightRef.current) {
      queuedLyricsRef.current = content;
      return false;
    }

    if (content === lastSyncedLyricsRef.current) {
      if (lyricsSaveStatus !== "saved") {
        setLyricsSaveStatus("saved");
      }
      return true;
    }

    saveInFlightRef.current = true;
    setLyricsSaveStatus("saving");
    setLyricsStatusMessage("");

    try {
      const response = await withAuth(() =>
        saveLyricsDraft(scope.projectId, scope.trackId, {
          content,
          ...(draftRevisionRef.current ? { baseRevision: draftRevisionRef.current } : {}),
        }),
      );

      if (generation !== draftGenerationRef.current) return false;

      setDraftRevision(response.revision);
      setDraftServerUpdatedAt(response.updatedAt);
      retryAttemptRef.current = 0;
      const latestLocalContent = draftLyricsRef.current;
      const isLatestSynced = isLatestContentSynced(response.content, latestLocalContent);

      if (isLatestSynced) {
        setLyricsSaveStatus("saved");
        setLyricsSavedAt(response.updatedAt);
        setLyricsStatusMessage("");
        lastSyncedLyricsRef.current = response.content;
        updateTrackDraftState(scope.projectId, scope.trackId, response.content, response.updatedAt);
        await deleteLyricsDraft(scope.key).catch(() => undefined);
        clearEmergencyDraft(scope.key);
      } else {
        setLyricsSaveStatus("dirty");
        setLyricsStatusMessage("");
      }

      return true;
    } catch (error) {
      if (generation !== draftGenerationRef.current) return false;
      if (isApiError(error) && error.status === 409) {
        setLyricsSaveStatus("conflict");
        setLyricsStatusMessage("Текст был изменен в другом окне или другим редактором");
        persistEmergencyDraft("conflict", content);
        await persistLocalDraft("conflict", content);
        const latest = await withAuth(() => getTrack(scope.projectId, scope.trackId)).catch(() => null);
        if (latest) {
          updateTrackDraftState(scope.projectId, scope.trackId, latest.lyrics, latest.updatedAt);
          setRestoreDraftSnapshot({
            localSavedAt: new Date().toISOString(),
            serverUpdatedAt: latest.updatedAt,
            localPreview: content.slice(0, 240),
            serverPreview: latest.lyrics.slice(0, 240),
          });
        }
        return false;
      }

      if (isApiError(error) && error.status === 401) {
        setLyricsSaveStatus("error");
        return false;
      }

      if (isApiError(error) && error.status === 403) {
        setLyricsSaveStatus("error");
        setLyricsStatusMessage("Недостаточно прав для сохранения черновика");
        persistEmergencyDraft("error", content);
        await persistLocalDraft("error", content);
        return false;
      }

      setLyricsSaveStatus("local");
      setLyricsStatusMessage("Нет соединения - сохранено локально");
      persistEmergencyDraft("local-only", content);
      await persistLocalDraft("local-only", content);
      scheduleRetryAutosave();
      return false;
    } finally {
      if (generation === draftGenerationRef.current) {
        saveInFlightRef.current = false;
      }
      const queued = queuedLyricsRef.current;
      queuedLyricsRef.current = null;
      if (queued !== null && queued !== content) {
        void flushLyricsAutosave(queued);
      }
    }
  };

  const scheduleLyricsAutosave = (nextContent: string) => {
    if (!canEdit) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushLyricsAutosave(nextContent);
    }, LYRICS_AUTOSAVE_DEBOUNCE_MS);
  };

  const forceSyncLyricsDraft = async () => {
    if (!canEdit) return true;
    clearDraftTimers();
    return flushLyricsAutosave(draftLyricsRef.current);
  };

  useEffect(() => {
    const controller = new AbortController();
    setAuthPhase("loading");
    setIsCheckingSession(true);
    (async () => {
      try {
        const [providersResult, userResult] = await Promise.allSettled([
          getAuthProviders(controller.signal),
          getCurrentUser(controller.signal),
        ]);

        if (controller.signal.aborted) return;

        setGoogleOAuthEnabled(providersResult.status === "fulfilled" ? providersResult.value.googleOAuthEnabled : false);

        if (userResult.status === "fulfilled") {
          setCurrentUser(userResult.value.user);
          setAuthPhase("authenticated");
          setSessionExpired(false);
          await loadWorkspace();
          return;
        }

        if (isApiError(userResult.reason) && userResult.reason.status === 401) {
          setCurrentUser(null);
          setAuthPhase("unauthenticated");
          return;
        }

        setCurrentUser(null);
        setAuthPhase("unauthenticated");
        setGlobalError("Не удалось загрузить сессию.");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isApiError(error) && error.status === 401) {
          setCurrentUser(null);
          setAuthPhase("unauthenticated");
          return;
        }
        setCurrentUser(null);
        setAuthPhase("unauthenticated");
        setGlobalError("Не удалось загрузить сессию.");
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingSession(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (!authError) return;

    const authMessages: Record<string, string> = {
      google_cancelled: "Вход через Google был отменен.",
      google_missing_code: "Google не вернул код авторизации.",
      google_invalid_state: "Безопасность входа не подтвердилась. Повторите попытку.",
      google_not_configured: "Вход через Google временно недоступен.",
      google_token_exchange_failed: "Не удалось завершить вход через Google.",
      google_email_not_verified: "Google не подтвердил email.",
      google_email_conflict: "Этот email уже связан с другим аккаунтом.",
      google_link_conflict: "Этот Google-аккаунт уже связан с другим пользователем.",
      google_network_error: "Сетевая ошибка при входе через Google.",
      google_auth_failed: "Не удалось выполнить вход через Google.",
    };

    const message = authMessages[authError] || "Не удалось выполнить вход через Google.";
    setAuthMessage(message);
    setGlobalError(message);
    params.delete("authError");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  useEffect(() => {
    if (!activeTrack || !activeProject || !currentUser) {
      setMobileTab("projects");
      resetDraftRuntime();
      return;
    }

    const generation = ++draftGenerationRef.current;
    clearDraftTimers();
    saveInFlightRef.current = false;
    queuedLyricsRef.current = null;
    retryAttemptRef.current = 0;

    const scopeKey = buildLyricsDraftKey(currentUser.id, activeProject.id, activeTrack.id);
    setDraftLyrics(activeTrack.lyrics);
    setDraftRevision(activeTrack.updatedAt);
    setDraftServerUpdatedAt(activeTrack.updatedAt);
    setLyricsSaveStatus("idle");
    setLyricsSavedAt(activeTrack.updatedAt);
    setLyricsStatusMessage("");
    setRestoreDraftSnapshot(null);
    draftLyricsRef.current = activeTrack.lyrics;
    draftRevisionRef.current = activeTrack.updatedAt;
    lastSyncedLyricsRef.current = activeTrack.lyrics;

    void (async () => {
      const localDraft = await readMergedLocalDraft({
        key: scopeKey,
        userId: currentUser.id,
        projectId: activeProject.id,
        trackId: activeTrack.id,
      });

      if (generation !== draftGenerationRef.current) return;

      if (!localDraft) return;

      if (!shouldRestoreFromLocal(localDraft.content, activeTrack.lyrics)) {
        await deleteLyricsDraft(scopeKey).catch(() => undefined);
        clearEmergencyDraft(scopeKey);
        return;
      }

      setDraftLyrics(localDraft.content);
      draftLyricsRef.current = localDraft.content;
      setRestoreDraftSnapshot({
        localSavedAt: localDraft.savedAt,
        serverUpdatedAt: activeTrack.updatedAt,
        localPreview: localDraft.content.slice(0, 240),
        serverPreview: activeTrack.lyrics.slice(0, 240),
      });
      setLyricsSaveStatus(localDraft.syncState === "conflict" ? "conflict" : "local");
    })();

    setSelectedAudioVersionId((prev) => {
      if (prev && activeTrack.audioVersions.some((version) => version.id === prev)) return prev;
      return activeTrack.audioVersions[0]?.id ?? null;
    });
  }, [activeTrack?.id, activeProject?.id, currentUser?.id]);

  useEffect(() => {
    if (authPhase !== "authenticated") return;
    const interval = window.setInterval(() => {
      void refreshNotifications().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [authPhase]);

  useEffect(() => {
    const onOnline = () => {
      if (lyricsSaveStatus === "local" || lyricsSaveStatus === "error") {
        void flushLyricsAutosave(draftLyricsRef.current);
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [lyricsSaveStatus]);

  useEffect(() => {
    const onPageHide = () => {
      if (!canEdit) return;
      persistEmergencyDraft("local-only");
      void persistLocalDraft("local-only");
      const scope = currentDraftScope();
      if (!scope) return;
      if (lyricsSaveStatus === "dirty" || lyricsSaveStatus === "local" || lyricsSaveStatus === "error") {
        void fetch(`/api/projects/${scope.projectId}/tracks/${scope.trackId}/lyrics/draft`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: draftLyricsRef.current,
            ...(draftRevisionRef.current ? { baseRevision: draftRevisionRef.current } : {}),
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        onPageHide();
      }
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!canEdit) return;
      persistEmergencyDraft("local-only");
      void persistLocalDraft("local-only");
      const unsynced = lyricsSaveStatus === "dirty" || lyricsSaveStatus === "local" || lyricsSaveStatus === "error" || lyricsSaveStatus === "conflict";
      if (unsynced && persistFailureRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [canEdit, lyricsSaveStatus]);

  const handleLogin = async (payload: { login: string; password: string }) => {
    const response = await login(payload);
    clearWorkspace();
    setCurrentUser(response.user);
    setAuthPhase("authenticated");
    setSessionExpired(false);
    setAuthMessage("");
    setGlobalError("");
    await loadWorkspace();
  };

  const handleRegister = async (payload: { username: string; displayName: string; password: string; email?: string }) => {
    const response = await register(payload);
    clearWorkspace();
    setCurrentUser(response.user);
    setAuthPhase("authenticated");
    setSessionExpired(false);
    setAuthMessage("");
    setGlobalError("");
    await loadWorkspace();
  };

  const handleGoogleAuth = () => {
    window.location.assign("/api/auth/google");
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setAuthPhase("unauthenticated");
      setSessionExpired(false);
      setAuthMessage("");
      clearWorkspace();
    }
  };

  const handleCreateProject = async (title: string, type: "single" | "album", tags: string[], coverUrl?: string) => {
    const project = await withAuth(() => createProject({ title, type, tags, coverUrl }));
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setActiveTrackId(project.tracks[0]?.id ?? null);
    setSelectedAudioVersionId(project.tracks[0]?.audioVersions[0]?.id ?? null);
  };

  const handleDeleteProject = async (projectId: string) => {
    await withAuth(() => deleteProject(projectId));
    const nextProjects = projects.filter((project) => project.id !== projectId);
    setProjects(nextProjects);
    syncProjectSelection(nextProjects);
  };

  const handleAddTrack = async (projectId: string, title: string) => {
    const track = await withAuth(() => createTrack(projectId, { title }));
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tracks: [track, ...project.tracks],
            }
          : project,
      ),
    );
    setActiveProjectId(projectId);
    setActiveTrackId(track.id);
    setSelectedAudioVersionId(track.audioVersions[0]?.id ?? null);
  };

  const handleAddProjectMember = async (projectId: string, payload: { login: string; role: "viewer" | "editor" }) => {
    const response = await withAuth(() => addProjectMember(projectId, payload));
    const incoming = response.member;
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const nextParticipants = project.participants.some((member) => member.userId === incoming.userId)
          ? project.participants.map((member) => (member.userId === incoming.userId ? incoming : member))
          : [...project.participants, incoming];
        return {
          ...project,
          participants: nextParticipants,
          members: nextParticipants,
        };
      }),
    );
  };

  const handleUpdateProjectMemberRole = async (projectId: string, userId: string, role: "viewer" | "editor") => {
    const response = await withAuth(() => updateProjectMemberRole(projectId, userId, { role }));
    const incoming = response.member;
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const nextParticipants = project.participants.map((member) => (member.userId === incoming.userId ? incoming : member));
        return {
          ...project,
          participants: nextParticipants,
          members: nextParticipants,
        };
      }),
    );
  };

  const handleRemoveProjectMember = async (projectId: string, userId: string) => {
    await withAuth(() => removeProjectMember(projectId, userId));
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const nextParticipants = project.participants.filter((member) => member.userId !== userId);
        return {
          ...project,
          participants: nextParticipants,
          members: nextParticipants,
        };
      }),
    );
  };

  const handleDraftLyricsChange = (newLyrics: string) => {
    draftLyricsRef.current = newLyrics;
    setDraftLyrics(newLyrics);
    if (!canEdit) return;
    setLyricsSaveStatus("dirty");
    setLyricsStatusMessage("");
    persistEmergencyDraft("local-only", newLyrics);
    void persistLocalDraft("local-only", newLyrics);
    scheduleLyricsAutosave(newLyrics);
  };

  const handleRestoreLocalDraft = async () => {
    const scope = currentDraftScope();
    if (!scope || !activeTrack) return;
    const localDraft = await readMergedLocalDraft(scope);
    if (!localDraft) {
      setRestoreDraftSnapshot(null);
      return;
    }
    setDraftLyrics(localDraft.content);
    setLyricsSaveStatus(localDraft.syncState === "conflict" ? "conflict" : "dirty");
    setLyricsStatusMessage("");
    setRestoreDraftSnapshot(null);
  };

  const handleUseServerDraft = async () => {
    const scope = currentDraftScope();
    if (!scope || !activeTrack) return;
    setDraftLyrics(activeTrack.lyrics);
    setDraftRevision(activeTrack.updatedAt);
    setDraftServerUpdatedAt(activeTrack.updatedAt);
    setLyricsSaveStatus("saved");
    setLyricsSavedAt(activeTrack.updatedAt);
    setLyricsStatusMessage("");
    setRestoreDraftSnapshot(null);
    await deleteLyricsDraft(scope.key).catch(() => undefined);
    clearEmergencyDraft(scope.key);
  };

  const handleDownloadLocalDraft = async () => {
    const scope = currentDraftScope();
    if (!scope) return;
    const localDraft = await readMergedLocalDraft(scope);
    if (!localDraft) return;
    const blob = new Blob([localDraft.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lyrics-draft-${scope.trackId}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreateLyricVersion = async (label: string) => {
    if (!activeProject || !activeTrack || !canEdit) return;
    const synced = await forceSyncLyricsDraft();
    if (!synced) {
      setLyricsStatusMessage("Сначала синхронизируйте черновик с сервером");
      return;
    }
    await withAuth(() =>
      createLyricVersion(activeProject.id, activeTrack.id, {
        lyrics: draftLyricsRef.current,
        label,
      }),
    );
    await refreshActiveTrack();
    setLyricsSaveStatus("saved");
  };

  const handlePinVersion = async (versionId: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => pinLyricVersion(activeProject.id, activeTrack.id, versionId));
    await refreshActiveTrack();
  };

  const handleDirectFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeProject || !activeTrack) return;

    if (file.size > AUDIO_LIMIT_BYTES) {
      setUploadError("Размер файла превышает 25 МБ.");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    try {
      await withAuth(() => uploadTrackAudio(activeProject.id, activeTrack.id, file));
      await refreshActiveTrack();
      setShowUploadModal(false);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 413) setUploadError("Файл слишком большой (максимум 25 МБ).");
        else if (error.status === 415) setUploadError("Неподдерживаемый или поврежденный аудиоформат.");
        else if (error.status === 403) setUploadError("Недостаточно прав для загрузки аудио.");
        else setUploadError(error.message);
      } else {
        setUploadError("Ошибка загрузки файла.");
      }
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleAddExternalLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeProject || !activeTrack || !extUrl.trim() || !extLabel.trim()) return;

    setIsUploading(true);
    setUploadError("");
    try {
      await withAuth(() =>
        attachExternalAudio(activeProject.id, activeTrack.id, {
          label: extLabel.trim(),
          externalUrl: extUrl.trim(),
          externalProvider: extProvider,
        }),
      );
      await refreshActiveTrack();
      setExtUrl("");
      setExtLabel("");
      setShowUploadModal(false);
    } catch (error) {
      setUploadError(error instanceof ApiError ? error.message : "Ошибка сохранения внешней ссылки.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddComment = async (text: string, lineIndex?: number) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createComment(activeProject.id, activeTrack.id, { text, lineIndex }));
    await Promise.all([refreshActiveTrack(), refreshNotifications()]);
  };

  const handleResolveComment = async (commentId: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => resolveComment(activeProject.id, activeTrack.id, commentId));
    await refreshActiveTrack();
  };

  const handleSendMessage = async (text: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => postChatMessage(activeProject.id, activeTrack.id, { text }));
    await refreshActiveTrack();
  };

  const handleAddTask = async (title: string, assignedToId?: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createTask(activeProject.id, activeTrack.id, { title, assignedToId: assignedToId ?? null }));
    await refreshActiveTrack();
  };

  const handleUpdateTaskStatus = async (taskId: string, status: Task["status"]) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => updateTask(activeProject.id, activeTrack.id, taskId, { status }));
    await refreshActiveTrack();
  };

  const handleAddAnnotation = async (timestampSeconds: number, text: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createAnnotation(activeProject.id, activeTrack.id, { timestampSeconds, text }));
    await refreshActiveTrack();
  };

  const handleReadNotification = async (id: string) => {
    await withAuth(() => markNotificationRead(id));
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

  const handleReadAllNotifications = async () => {
    await withAuth(() => markAllNotificationsRead());
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const trackCommentsCount = (lineIdx: number) => {
    if (!activeTrack) return 0;
    return activeTrack.comments.filter((comment) => comment.lineIndex === lineIdx && !comment.resolved).length;
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {!currentUser && (
        <AuthModal
          onLogin={handleLogin}
          onRegister={handleRegister}
          onGoogleAuth={handleGoogleAuth}
          currentUser={currentUser}
          onLogout={handleLogout}
          authLoading={isCheckingSession}
          sessionExpired={sessionExpired}
          authMessage={authMessage}
          googleOAuthEnabled={googleOAuthEnabled}
        />
      )}

      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md bg-neutral-950/80 border-neutral-900">
        <div className="flex items-center gap-2 select-none text-white font-bold">collabStudio Stage 4</div>
        {currentUser && (
          <AuthModal
            onLogin={handleLogin}
            onRegister={handleRegister}
            onGoogleAuth={handleGoogleAuth}
            currentUser={currentUser}
            onLogout={handleLogout}
            googleOAuthEnabled={googleOAuthEnabled}
          />
        )}
      </header>

      {globalError && (
        <div className="max-w-7xl mx-auto w-full px-4 mt-3">
          <div className="bg-red-950/50 border border-red-900/40 rounded-lg p-2 text-xs text-red-300">{globalError}</div>
        </div>
      )}

      {currentUser && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 pb-24 max-w-7xl mx-auto w-full min-h-0">
              <div className={`lg:col-span-3 min-h-0 flex-col gap-4 ${mobileTab === "projects" ? "flex" : "hidden lg:flex"}`}>
              <ProjectList
                projects={projects}
                activeProject={activeProject}
                activeTrack={activeTrack}
                onSelectProject={(project) => {
                  if (canEdit) {
                    void forceSyncLyricsDraft();
                  }
                  setActiveProjectId(project.id);
                  setActiveTrackId(project.tracks[0]?.id ?? null);
                  setMobileTab("editor");
                }}
                onSelectTrack={(track) => {
                  if (canEdit) {
                    void forceSyncLyricsDraft();
                  }
                  setActiveTrackId(track.id);
                  setMobileTab("editor");
                }}
                onCreateProject={handleCreateProject}
                onAddTrack={handleAddTrack}
                onAddMember={handleAddProjectMember}
                onUpdateMemberRole={handleUpdateProjectMemberRole}
                onRemoveMember={handleRemoveProjectMember}
                onDeleteProject={handleDeleteProject}
                currentUser={currentUser}
              />
              </div>

              <div className={`lg:col-span-6 min-h-0 flex-col gap-5 ${mobileTab === "editor" ? "flex" : "hidden lg:flex"}`}>
              {activeTrack ? (
                <>
                  <div className="p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-900/60 border-neutral-800">
                    <div className="text-left">
                      <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                        {activeProject?.title}
                      </div>
                      <h2 className="text-base font-bold text-white mt-0.5">{activeTrack.title}</h2>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 px-3.5 rounded-lg text-xs font-semibold"
                      >
                        Загрузить аудио
                      </button>
                    )}
                  </div>

                  <LyricsEditor
                    draftLyrics={draftLyrics}
                    onChangeDraftLyrics={handleDraftLyricsChange}
                    onCreateVersion={handleCreateLyricVersion}
                    onPinVersion={handlePinVersion}
                    versionHistory={activeTrack.lyricVersions}
                    selectedLineIndex={selectedLineIndex}
                    onSelectLine={setSelectedLineIndex}
                    trackCommentsCount={trackCommentsCount}
                    canEdit={canEdit}
                    saveStatus={lyricsSaveStatus}
                    savedAt={lyricsSavedAt}
                    statusMessage={lyricsStatusMessage}
                    restoreDraft={restoreDraftSnapshot}
                    onRestoreLocalDraft={handleRestoreLocalDraft}
                    onUseServerDraft={handleUseServerDraft}
                    onDownloadLocalDraft={handleDownloadLocalDraft}
                    onJumpToDiscussion={() => {
                      setActiveSidebar("comments");
                      setMobileTab("rightPanel");
                    }}
                  />

                  <AudioPlayer
                    audioVersions={activeTrack.audioVersions}
                    annotations={activeTrack.annotations as Annotation[]}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAudioVersion={setSelectedAudioVersionId}
                    selectedAudioVersionId={selectedAudioVersionId}
                    canAnnotate={canEdit}
                    onRequestUploadFile={() => setShowUploadModal(true)}
                    onRequestAddLink={() => setShowUploadModal(true)}
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/10 min-h-[400px]">
                  <FolderOpen className="w-12 h-12 text-neutral-700 mb-3 animate-pulse" />
                  <p className="text-xs text-neutral-400">Выберите проект и трек для работы.</p>
                </div>
              )}
              </div>

              <div className={`lg:col-span-3 min-h-0 flex-col gap-4 ${mobileTab === "rightPanel" ? "flex" : "hidden lg:flex"}`}>
              {activeTrack ? (
                <div className="flex flex-col h-full space-y-4">
                  <div className="bg-neutral-950 border border-neutral-800 p-1 rounded-xl flex items-center justify-between">
                    <button onClick={() => setActiveSidebar("comments")} className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg ${activeSidebar === "comments" ? "bg-indigo-600 text-white" : "text-neutral-400"}`}>
                      Правки
                    </button>
                    <button onClick={() => setActiveSidebar("chat")} className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg ${activeSidebar === "chat" ? "bg-indigo-600 text-white" : "text-neutral-400"}`}>
                      Чат
                    </button>
                    <button onClick={() => setActiveSidebar("tasks")} className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg ${activeSidebar === "tasks" ? "bg-indigo-600 text-white" : "text-neutral-400"}`}>
                      Задачи
                    </button>
                    <button onClick={() => setActiveSidebar("rhymes")} className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg ${activeSidebar === "rhymes" ? "bg-indigo-600 text-white" : "text-neutral-400"}`}>
                      AI
                    </button>
                  </div>

                  <div className="flex-1 min-h-[360px]">
                    {activeSidebar === "comments" && (
                      <CommentsPanel
                        comments={activeTrack.comments}
                        onAddComment={handleAddComment}
                        onResolveComment={handleResolveComment}
                        canResolve={canResolve}
                        selectedLineIndex={selectedLineIndex}
                        onClearSelectedLine={() => setSelectedLineIndex(null)}
                        lyricsLines={draftLyrics.split("\n")}
                      />
                    )}
                    {activeSidebar === "chat" && <ChatRoom chat={activeTrack.chat} onSendMessage={handleSendMessage} currentUser={currentUser} canSend={canSend} />}
                    {activeSidebar === "tasks" && (
                      <TaskBoard
                        tasks={activeTrack.tasks}
                        onAddTask={handleAddTask}
                        onUpdateTaskStatus={handleUpdateTaskStatus}
                        participants={activeProject ? activeProject.participants : []}
                        canEdit={canEdit}
                      />
                    )}
                    {activeSidebar === "rhymes" && <RhymeFinder onUnauthorized={handleUnauthorized} />}
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center h-full min-h-[300px]">
                  <Sparkles className="w-8 h-8 text-neutral-800 mb-2 mx-auto" />
                  <p className="text-[11px] text-neutral-500">Выберите трек, чтобы открыть правки, чат, задачи и AI-рифмы.</p>
                </div>
              )}
              </div>
            </div>

            <div className="max-w-7xl mx-auto w-full px-4 pb-24">
              <NotificationsPanel
                notifications={notifications}
                onMarkAsRead={handleReadNotification}
                onReadAll={handleReadAllNotifications}
              />
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden px-4 pb-4 pt-2 bg-gradient-to-t from-black/95 via-black/90 to-transparent">
            <div className="mx-auto max-w-md rounded-2xl flex items-center justify-around p-1.5 shadow-2xl border backdrop-blur-lg bg-neutral-900/90 border-neutral-800">
              <button onClick={() => setMobileTab("projects")} className="flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-neutral-300">
                <FolderOpen className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Проекты</span>
              </button>
              <button onClick={() => setMobileTab("editor")} className="flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-neutral-300">
                <Music className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Редактор</span>
              </button>
              <button onClick={() => setMobileTab("rightPanel")} className="flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-neutral-300">
                <MessageSquare className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Обсуждение</span>
              </button>
            </div>
          </div>
        </>
      )}

      {showUploadModal && activeProject && activeTrack && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1">Добавление аудио</h3>
            <p className="text-xs text-neutral-400 mb-6">Поддерживаются форматы: mp3, wav, flac, ogg, aac, m4a, webm. Лимит 25 МБ.</p>

            {uploadError && <div className="bg-red-950/40 border border-red-900/30 p-2.5 rounded-lg text-red-400 text-xs text-center mb-4">{uploadError}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-neutral-900 pt-6">
              <div className="flex flex-col items-center justify-center p-4 border border-dashed border-neutral-800 rounded-xl hover:border-indigo-500/50 bg-neutral-900/10 transition-colors relative min-h-[160px]">
                <span className="text-xs font-semibold text-white">Загрузить файл</span>
                <span className="text-[10px] text-neutral-500 mt-1">Ограничение до 25 МБ</span>
                <input
                  type="file"
                  accept={AUDIO_ACCEPT}
                  onChange={handleDirectFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>

              <form onSubmit={handleAddExternalLink} className="space-y-3 flex flex-col justify-between">
                <input
                  type="url"
                  required
                  value={extUrl}
                  onChange={(e) => setExtUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={extLabel}
                  onChange={(e) => setExtLabel(e.target.value)}
                  placeholder="Название версии"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none"
                />
                <select
                  value={extProvider}
                  onChange={(e) => setExtProvider(e.target.value as ExternalProvider)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="google">Google Диск</option>
                  <option value="yandex">Яндекс Диск</option>
                  <option value="telegram">Telegram</option>
                  <option value="other">Другой сервис</option>
                </select>

                <button
                  type="submit"
                  disabled={isUploading || !extUrl.trim() || !extLabel.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium p-1.5 rounded text-xs transition-colors cursor-pointer"
                >
                  {isUploading ? "Сохраняем..." : "Прикрепить ссылку"}
                </button>
              </form>
            </div>

            <div className="flex justify-end mt-6 border-t border-neutral-900 pt-4">
              <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 rounded-lg cursor-pointer">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
