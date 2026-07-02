import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Annotation,
  AppNotification,
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
import { FolderOpen, MessageSquare, Music } from "lucide-react";
import { ApiError, isApiError } from "./api/client";
import { useAuth } from "./app/auth/AuthProvider";
import { usePlayer } from "./app/player/PlayerProvider";
import { useI18n } from "./app/i18n/I18nProvider";
import AppShell from "./app/shell/AppShell";
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
  markAllNotificationsRead,
  markNotificationRead,
} from "./api/notifications";
import {
  isLatestContentSynced,
  shouldRestoreFromLocal,
} from "./utils/lyricsDraftRecovery";
import {
  buildPrivatePath,
  mobileStateFromTab,
  parsePrivatePath,
} from "./app/routeContract";
import { resolveRouteSelection, shouldNavigateToCanonicalPath } from "./app/routeSelection";
import { useWorkspaceQuery } from "./app/state/useWorkspaceQuery";
import {
  buildDraftScope,
  readMergedDraft,
  removeLocalDraft,
  saveEmergencyDraft,
  writeLocalDraft,
} from "./app/draft/draftInterface";
import Button from "./shared/ui/Button";
import StateView from "./shared/ui/StateView";

type Sidebar = "comments" | "chat" | "tasks" | "rhymes";
type MobileTab = "projects" | "editor" | "rightPanel";
type ExternalProvider = "google" | "yandex" | "telegram" | "other";

const AUDIO_LIMIT_BYTES = 25 * 1024 * 1024;
const AUDIO_ACCEPT = ".mp3,.wav,.flac,.ogg,.aac,.m4a,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/aac,audio/mp4,audio/webm";
const LYRICS_AUTOSAVE_DEBOUNCE_MS = 1500;
const LYRICS_RETRY_BASE_MS = 1200;
const LYRICS_RETRY_MAX_MS = 30000;

type DraftSyncState = "local-only" | "synced" | "conflict" | "error";

export default function App() {
  const { t } = useI18n();
  const {
    authPhase,
    isCheckingSession,
    currentUser,
    sessionExpired,
    authMessage,
    authSystemError,
    googleOAuthEnabled,
    login,
    register,
    logout,
    startGoogleAuth,
    expireSession,
    withAuth,
  } = useAuth();
  const {
    selectedAudioVersionId,
    setSelectedAudioVersionId,
    syncSelectedAudioVersion,
  } = usePlayer();
  const [globalError, setGlobalError] = useState<string>("");
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<Sidebar>("comments");
  const [mobileTab, setMobileTab] = useState<MobileTab>("projects");
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

  const location = useLocation();
  const navigate = useNavigate();
  const parsedRoute = useMemo(() => parsePrivatePath(location.pathname), [location.pathname]);

  const {
    projects,
    setProjects,
    notifications,
    setNotifications,
    workspaceReady,
    workspaceError,
    refreshActiveTrack,
    refreshNotifications,
    resetWorkspaceQuery,
    updateTrackInProjects,
  } = useWorkspaceQuery({
    authPhase,
    currentUserId: currentUser?.id ?? null,
    withAuth,
  });

  const resolvedRouteSelection = useMemo(
    () => resolveRouteSelection(projects, parsedRoute),
    [projects, parsedRoute],
  );
  const activeProjectId = resolvedRouteSelection.projectId;
  const activeTrackId = resolvedRouteSelection.trackId;

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
    return buildDraftScope(currentUser.id, activeProjectId, activeTrackId);
  };

  const persistLocalDraft = async (syncState: DraftSyncState, contentOverride?: string) => {
    const scope = currentDraftScope();
    if (!scope) return;
    const content = contentOverride ?? draftLyricsRef.current;
    try {
      await writeLocalDraft(scope, {
        content,
        baseRevision: draftRevisionRef.current ?? undefined,
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
    saveEmergencyDraft({
      key: scope.key,
      content,
      savedAt: new Date().toISOString(),
      baseRevision: draftRevisionRef.current ?? undefined,
      serverUpdatedAt: draftServerUpdatedAt ?? undefined,
      syncState,
    });
  };

  const clearWorkspace = () => {
    resetWorkspaceQuery();
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

  const updateTrackDraftState = (projectId: string, trackId: string, lyrics: string, updatedAt: string) => {
    updateTrackInProjects(projectId, trackId, (track) => ({
      ...track,
      lyrics,
      updatedAt,
    }));
  };

  const refreshCurrentTrack = async () => {
    if (!activeProjectId || !activeTrackId) return;
    await refreshActiveTrack(activeProjectId, activeTrackId);
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
        await removeLocalDraft(scope).catch(() => undefined);
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
    if (location.pathname.startsWith("/app") && !parsedRoute.isCanonical) {
      navigate(
        buildPrivatePath({
          projectId: parsedRoute.projectId,
          trackId: parsedRoute.trackId,
          tab: parsedRoute.tab,
        }),
        { replace: true },
      );
    }
  }, [location.pathname, navigate, parsedRoute]);

  useEffect(() => {
    if (authPhase !== "authenticated") return;
    setMobileTab(parsedRoute.trackId ? mobileStateFromTab(parsedRoute.tab) : "projects");
    if (parsedRoute.tab === "team") {
      setActiveSidebar("comments");
    }
  }, [authPhase, parsedRoute]);

  useEffect(() => {
    if (authPhase !== "authenticated") return;

    const nextTab =
      mobileTab === "rightPanel"
        ? "team"
        : parsedRoute.tab === "team"
          ? "lyrics"
          : parsedRoute.tab;

    const nextPath = buildPrivatePath({
      projectId: activeProjectId,
      trackId: mobileTab === "projects" ? null : activeTrackId,
      tab: mobileTab === "projects" ? "lyrics" : nextTab,
    });

    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  }, [
    authPhase,
    activeProjectId,
    activeTrackId,
    mobileTab,
    parsedRoute.tab,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (authPhase !== "authenticated" || !workspaceReady || !location.pathname.startsWith("/app")) return;
    if (shouldNavigateToCanonicalPath(location.pathname, resolvedRouteSelection.canonicalPath)) {
      navigate(resolvedRouteSelection.canonicalPath, { replace: true });
    }
  }, [
    authPhase,
    workspaceReady,
    location.pathname,
    resolvedRouteSelection.canonicalPath,
    navigate,
  ]);

  useEffect(() => {
    if (authPhase === "unauthenticated") {
      clearWorkspace();
    }
  }, [authPhase]);

  useEffect(() => {
    if (authSystemError) {
      setGlobalError(authSystemError);
      return;
    }
    if (authMessage) {
      setGlobalError(authMessage);
      return;
    }
    if (workspaceError) {
      setGlobalError(workspaceError);
      return;
    }
    if (authPhase === "authenticated") {
      setGlobalError("");
    }
  }, [authSystemError, authMessage, workspaceError, authPhase]);

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

    const scope = buildDraftScope(currentUser.id, activeProject.id, activeTrack.id);
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
      const localDraft = await readMergedDraft({
        ...scope,
      });

      if (generation !== draftGenerationRef.current) return;

      if (!localDraft) return;

      if (!shouldRestoreFromLocal(localDraft.content, activeTrack.lyrics)) {
        await removeLocalDraft({
          ...scope,
        }).catch(() => undefined);
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

    syncSelectedAudioVersion(activeTrack.audioVersions);
  }, [activeTrack?.id, activeProject?.id, currentUser?.id, syncSelectedAudioVersion]);

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

  const handleCreateProject = async (title: string, type: "single" | "album", tags: string[], coverUrl?: string) => {
    const project = await withAuth(() => createProject({ title, type, tags, coverUrl }));
    setProjects((prev) => [project, ...prev]);
    navigate(
      buildPrivatePath({
        projectId: project.id,
        trackId: project.tracks[0]?.id ?? null,
        tab: "lyrics",
      }),
    );
    setSelectedAudioVersionId(project.tracks[0]?.audioVersions[0]?.id ?? null);
  };

  const handleDeleteProject = async (projectId: string) => {
    await withAuth(() => deleteProject(projectId));
    const nextProjects = projects.filter((project) => project.id !== projectId);
    setProjects(nextProjects);
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
    navigate(
      buildPrivatePath({
        projectId,
        trackId: track.id,
        tab: "lyrics",
      }),
    );
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
    const localDraft = await readMergedDraft(scope);
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
    await removeLocalDraft(scope).catch(() => undefined);
  };

  const handleDownloadLocalDraft = async () => {
    const scope = currentDraftScope();
    if (!scope) return;
    const localDraft = await readMergedDraft(scope);
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
    await refreshCurrentTrack();
    setLyricsSaveStatus("saved");
  };

  const handlePinVersion = async (versionId: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => pinLyricVersion(activeProject.id, activeTrack.id, versionId));
    await refreshCurrentTrack();
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
      await refreshCurrentTrack();
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
      await refreshCurrentTrack();
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
    await Promise.all([refreshCurrentTrack(), refreshNotifications()]);
  };

  const handleResolveComment = async (commentId: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => resolveComment(activeProject.id, activeTrack.id, commentId));
    await refreshCurrentTrack();
  };

  const handleSendMessage = async (text: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => postChatMessage(activeProject.id, activeTrack.id, { text }));
    await refreshCurrentTrack();
  };

  const handleAddTask = async (title: string, assignedToId?: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createTask(activeProject.id, activeTrack.id, { title, assignedToId: assignedToId ?? null }));
    await refreshCurrentTrack();
  };

  const handleUpdateTaskStatus = async (taskId: string, status: Task["status"]) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => updateTask(activeProject.id, activeTrack.id, taskId, { status }));
    await refreshCurrentTrack();
  };

  const handleAddAnnotation = async (timestampSeconds: number, text: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createAnnotation(activeProject.id, activeTrack.id, { timestampSeconds, text }));
    await refreshCurrentTrack();
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
    <AppShell
      title={t("shell.brand")}
      headerRight={
        currentUser ? (
          <AuthModal
            onLogin={login}
            onRegister={register}
            onGoogleAuth={startGoogleAuth}
            currentUser={currentUser}
            onLogout={logout}
            googleOAuthEnabled={googleOAuthEnabled}
          />
        ) : undefined
      }
      showMobileNav={Boolean(currentUser)}
      mobileNavItems={[
        { key: "projects", label: t("shell.projects"), icon: FolderOpen, active: mobileTab === "projects", onPress: () => setMobileTab("projects") },
        { key: "editor", label: t("shell.editor"), icon: Music, active: mobileTab === "editor", onPress: () => setMobileTab("editor") },
        { key: "discussion", label: t("shell.discussion"), icon: MessageSquare, active: mobileTab === "rightPanel", onPress: () => setMobileTab("rightPanel") },
      ]}
    >
      {!currentUser && (
        <AuthModal
          onLogin={login}
          onRegister={register}
          onGoogleAuth={startGoogleAuth}
          currentUser={currentUser}
          onLogout={logout}
          authLoading={isCheckingSession}
          sessionExpired={sessionExpired}
          authMessage={authMessage}
          googleOAuthEnabled={googleOAuthEnabled}
        />
      )}

      {globalError && (
        <div className="max-w-7xl mx-auto w-full px-4 mt-3">
          <StateView kind="error" message={globalError} compact />
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
                  navigate(
                    buildPrivatePath({
                      projectId: project.id,
                      trackId: project.tracks[0]?.id ?? null,
                      tab: "lyrics",
                    }),
                  );
                  setMobileTab("editor");
                }}
                onSelectTrack={(track) => {
                  if (canEdit) {
                    void forceSyncLyricsDraft();
                  }
                  const ownerProject = projects.find((project) => project.tracks.some((projectTrack) => projectTrack.id === track.id));
                  navigate(
                    buildPrivatePath({
                      projectId: ownerProject?.id ?? activeProjectId,
                      trackId: track.id,
                      tab: "lyrics",
                    }),
                  );
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
                      {!canEdit && <div className="mt-2"><StateView kind="readOnly" message={t("state.readOnly")} compact /></div>}
                    </div>

                    {canEdit && (
                      <Button
                        onClick={() => setShowUploadModal(true)}
                        variant="primary"
                        size="sm"
                        className="font-semibold"
                      >
                        Загрузить аудио
                      </Button>
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
                <StateView kind="empty" message={t("state.track.empty")} className="min-h-[220px] flex items-center" />
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
                    {activeSidebar === "rhymes" && <RhymeFinder onUnauthorized={expireSession} />}
                  </div>
                </div>
              ) : (
                <StateView kind="empty" message={t("state.sidebar.empty")} className="h-full min-h-[220px] flex items-center" />
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
        </>
      )}

      {showUploadModal && activeProject && activeTrack && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1">{t("modal.audioUpload")}</h3>
            <p className="text-xs text-neutral-400 mb-6">{t("modal.audioFormats")}</p>

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
              <Button type="button" variant="secondary" onClick={() => setShowUploadModal(false)}>
                {t("modal.close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
