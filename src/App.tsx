import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppNotification,
  Project,
  Task,
  Track,
} from "./types";
import AuthModal from "./components/AuthModal";
import ProjectList from "./components/ProjectList";
import { type LyricsSaveStatus, type RestoreDraftSnapshot } from "./components/LyricsEditor";
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
  createProjectTask,
  createTask,
  createTrack,
  getTrack,
  pinLyricVersion,
  postProjectChatMessage,
  postChatMessage,
  saveLyricsDraft,
  removeProjectMember,
  resolveComment,
  updateProjectMemberRole,
  updateProjectTask,
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
import { useLyricsEditLease } from "./features/track-workspace/lyrics/useLyricsEditLease";
import { TrackLyricsWorkspace } from "./features/track-workspace/lyrics/TrackLyricsWorkspace";
import { buildLyricsDraftWrite, useLyricsDocumentDraft, withLyricsDraftSnapshot } from "./features/track-workspace/lyrics/useLyricsDocumentDraft";
import { LYRICS_AUTOSAVE_DEBOUNCE_MS, LYRICS_RETRY_BASE_MS, LYRICS_RETRY_MAX_MS, type DraftSyncState } from "./features/track-workspace/lyrics/lyricsDraftRuntime";
import { lyricsDocumentToPlainText, type LyricsDocument } from "./features/track-workspace/lyrics/lyricsDocument";
import { createLyricSnapshot, downloadLocalLyricsDraft, exportLyricsTxt, restoreLyricSnapshot } from "./features/track-workspace/lyrics/lyricsSnapshots";
import { featureFlags } from "./app/featureFlags";
import { TrackContextPanel, type TrackSidebar } from "./features/track-workspace/TrackContextPanel";
import { LyricsCommentsSheet } from "./features/track-workspace/lyrics/LyricsCommentsSheet";
import { LyricsDiscussionsSheet } from "./features/track-workspace/lyrics/LyricsDiscussionsSheet";
import { useLyricsDiscussions } from "./features/track-workspace/lyrics/useLyricsDiscussions";
import { StickyAudioPlayer } from "./components/StickyAudioPlayer";
import { normalizeTrackAudioSources, resolveSelectedAudioSource } from "./features/track-workspace/audio/normalizeTrackAudio";
import { ProjectContextPanel } from "./features/project-workspace/ProjectContextPanel";
import Button from "./shared/ui/Button";
import StateView from "./shared/ui/StateView";
type MobileTab = "projects" | "editor" | "rightPanel";
type ExternalProvider = "google" | "yandex" | "telegram" | "other";
const AUDIO_LIMIT_BYTES = 25 * 1024 * 1024;
const AUDIO_ACCEPT = ".mp3,.wav,.flac,.ogg,.aac,.m4a,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/aac,audio/mp4,audio/webm";
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
    selectedAudioSourceId,
    setSelectedAudioSourceId,
    syncSelectedAudioSource,
    loadSource,
  } = usePlayer();
  const [globalError, setGlobalError] = useState<string>("");
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<TrackSidebar>("comments");
  const [mobileTab, setMobileTab] = useState<MobileTab>("projects");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [extUrl, setExtUrl] = useState("");
  const [extLabel, setExtLabel] = useState("");
  const [extProvider, setExtProvider] = useState<ExternalProvider>("google");
  const [draftLyrics, setDraftLyrics] = useState("");
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [draftServerUpdatedAt, setDraftServerUpdatedAt] = useState<string | null>(null);
  const [lyricsSaveStatus, setLyricsSaveStatus] = useState<LyricsSaveStatus>("idle");
  const [lyricsSavedAt, setLyricsSavedAt] = useState<string | null>(null);
  const lyricsDocumentDraft = useLyricsDocumentDraft();
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
  const draftRevisionRef = useRef<number | null>(null);
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
    refreshActiveProject,
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
  const activeTrackAudioSources = useMemo(() => (activeTrack ? normalizeTrackAudioSources(activeTrack) : []), [activeTrack]);
  const activeTrackSelectedAudio = useMemo(
    () => resolveSelectedAudioSource(activeTrackAudioSources, selectedAudioSourceId),
    [activeTrackAudioSources, selectedAudioSourceId],
  );

  const projectRole = useMemo(() => {
    if (!currentUser || !activeProject) return null;
    return activeProject.currentUserRole ?? activeProject.participants.find((member) => member.userId === currentUser.id)?.role ?? null;
  }, [currentUser, activeProject]);

  const canEdit = projectRole === "owner" || projectRole === "editor";
  const lyricsLease = useLyricsEditLease({
    projectId: activeProjectId,
    trackId: activeTrackId,
    canEdit,
    withAuth,
  });

  const canResolve = canEdit;
  const canSend = !!currentUser && !!activeProject && !!activeTrack && (projectRole === "owner" || projectRole === "editor");
  const canSendProjectChat = !!currentUser && !!activeProject && (projectRole === "owner" || projectRole === "editor");
  const lyricsDiscussionsEnabled = featureFlags.lyricsStructuredEditor;
  const isMobileViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

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
    lyricsDocumentDraft.reset();
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
        document: featureFlags.lyricsStructuredEditor ? lyricsDocumentDraft.forPlainText(content) : undefined,
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
      document: featureFlags.lyricsStructuredEditor ? lyricsDocumentDraft.forPlainText(content) : undefined,
      savedAt: new Date().toISOString(),
      baseRevision: draftRevisionRef.current ?? undefined,
      serverUpdatedAt: draftServerUpdatedAt ?? undefined,
      syncState,
    });
  };

  const clearWorkspace = () => {
    resetWorkspaceQuery();
    setSelectedAudioSourceId(null);
    setSelectedLineIndex(null);
    clearDiscussionState();
    setShowLyricsComments(false);
    clearDiscussionState();
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

  const updateTrackDraftState = (projectId: string, trackId: string, lyrics: string, lyricsRevision: number, updatedAt: string, lyricsDocument?: LyricsDocument) => {
    updateTrackInProjects(projectId, trackId, (track) => withLyricsDraftSnapshot(track, lyrics, lyricsRevision, updatedAt, lyricsDocument));
  };

  const refreshCurrentTrack = async () => {
    if (!activeProjectId || !activeTrackId) return;
    await refreshActiveTrack(activeProjectId, activeTrackId);
  };

  const {
    showLyricsComments,
    setShowLyricsComments,
    discussionSelection,
    setDiscussionSelection,
    discussionAnchors,
    clearDiscussionState,
    handleCreateDiscussionThread,
    handleReplyDiscussionThread,
    handleResolveDiscussionThread,
    handleReanchorDiscussionThread,
  } = useLyricsDiscussions({
    activeProject,
    activeTrack,
    draftDocument: lyricsDocumentDraft.document,
    withAuth,
    refreshCurrentTrack,
    refreshNotifications,
  });

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
    if (!scope || !canEdit || !lyricsLease.leaseToken || draftRevisionRef.current === null) return false;

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
      const baseRevision = draftRevisionRef.current!;
      const leaseToken = lyricsLease.leaseToken!;
      const payload = buildLyricsDraftWrite(featureFlags.lyricsStructuredEditor, lyricsDocumentDraft.forPlainText(content), content, baseRevision, leaseToken);
      const response = await withAuth(() =>
        saveLyricsDraft(scope.projectId, scope.trackId, payload),
      );

      if (generation !== draftGenerationRef.current) return false;

      setDraftRevision(response.revision);
      draftRevisionRef.current = response.revision;
      setDraftServerUpdatedAt(response.updatedAt);
      retryAttemptRef.current = 0;
      const latestLocalContent = draftLyricsRef.current;
      const isLatestSynced = isLatestContentSynced(response.content, latestLocalContent);

      if (isLatestSynced) {
        setLyricsSaveStatus("saved");
        setLyricsSavedAt(response.updatedAt);
        setLyricsStatusMessage("");
        lastSyncedLyricsRef.current = response.content;
        if (featureFlags.lyricsStructuredEditor) lyricsDocumentDraft.setDocument(response.document);
        updateTrackDraftState(scope.projectId, scope.trackId, response.content, response.revision, response.updatedAt, featureFlags.lyricsStructuredEditor ? response.document : undefined);
        await removeLocalDraft(scope).catch(() => undefined);
      } else {
        setLyricsSaveStatus("dirty");
        setLyricsStatusMessage("");
      }

      return true;
    } catch (error) {
      if (generation !== draftGenerationRef.current) return false;
      if (isApiError(error) && error.code === "LYRICS_LEASE_LOST") {
        lyricsLease.markLost();
        setLyricsSaveStatus("local");
        setLyricsStatusMessage("Сеанс редактирования истёк — черновик сохранён локально");
        persistEmergencyDraft("local-only", content);
        await persistLocalDraft("local-only", content);
        return false;
      }
      if (isApiError(error) && error.status === 409) {
        setLyricsSaveStatus("conflict");
        setLyricsStatusMessage("Текст был изменен в другом окне или другим редактором");
        persistEmergencyDraft("conflict", content);
        await persistLocalDraft("conflict", content);
        const latest = await withAuth(() => getTrack(scope.projectId, scope.trackId)).catch(() => null);
        if (latest) {
          updateTrackDraftState(scope.projectId, scope.trackId, latest.lyrics, latest.lyricsRevision, latest.updatedAt, latest.lyricsDocument);
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

  const stopLyricsEditing = async () => {
    clearDraftTimers();
    await flushLyricsAutosave(draftLyricsRef.current);
    await lyricsLease.release();
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
    if (workspaceReady && location.pathname !== resolvedRouteSelection.canonicalPath) return;
    setMobileTab(parsedRoute.trackId ? mobileStateFromTab(parsedRoute.tab) : "projects");
    if (parsedRoute.tab === "team") {
      setActiveSidebar("comments");
    }
  }, [workspaceReady, location.pathname, resolvedRouteSelection.canonicalPath, parsedRoute]);

  useEffect(() => {
    if (authPhase !== "authenticated" || !workspaceReady) return;

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
    workspaceReady,
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

  // Load audio source into shared player when selected audio changes
  useEffect(() => {
    const sourceUrl = activeTrackSelectedAudio?.streamUrl || null;
    loadSource(sourceUrl);
  }, [activeTrackSelectedAudio?.id, activeTrackSelectedAudio?.streamUrl, loadSource]);

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
      clearDiscussionState();
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
    if (featureFlags.lyricsStructuredEditor) lyricsDocumentDraft.loadTrack(activeTrack);
    setDraftRevision(activeTrack.lyricsRevision);
    setDraftServerUpdatedAt(activeTrack.updatedAt);
    setLyricsSaveStatus("idle");
    setLyricsSavedAt(activeTrack.updatedAt);
    setLyricsStatusMessage("");
    setRestoreDraftSnapshot(null);
    draftLyricsRef.current = activeTrack.lyrics;
    draftRevisionRef.current = activeTrack.lyricsRevision;
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
      if (featureFlags.lyricsStructuredEditor) lyricsDocumentDraft.loadLocal(localDraft);
      draftLyricsRef.current = localDraft.content;
      setRestoreDraftSnapshot({
        localSavedAt: localDraft.savedAt,
        serverUpdatedAt: activeTrack.updatedAt,
        localPreview: localDraft.content.slice(0, 240),
        serverPreview: activeTrack.lyrics.slice(0, 240),
      });
      setLyricsSaveStatus(localDraft.syncState === "conflict" ? "conflict" : "local");
    })();

    syncSelectedAudioSource(activeTrackAudioSources);
  }, [activeTrack?.id, activeProject?.id, currentUser?.id, activeTrackAudioSources, syncSelectedAudioSource]);

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
      if (!canEdit || !lyricsLease.leaseToken || draftRevisionRef.current === null) return;
      persistEmergencyDraft("local-only");
      void persistLocalDraft("local-only");
      const scope = currentDraftScope();
      if (!scope) return;
      if (lyricsSaveStatus === "dirty" || lyricsSaveStatus === "local" || lyricsSaveStatus === "error") {
        void fetch(`/api/projects/${scope.projectId}/tracks/${scope.trackId}/lyrics/draft`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildLyricsDraftWrite(featureFlags.lyricsStructuredEditor, lyricsDocumentDraft.forPlainText(draftLyricsRef.current), draftLyricsRef.current, draftRevisionRef.current, lyricsLease.leaseToken)),
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
  }, [canEdit, lyricsLease.leaseToken, lyricsSaveStatus]);

  const handleCreateProject = async (title: string, type: "single" | "album", initialTrackTitle: string | undefined, tags: string[], coverUrl?: string) => {
    const project = await withAuth(() => createProject({ title, type, initialTrackTitle, tags, coverUrl }));
    setProjects((prev) => [project, ...prev]);
    navigate(
      buildPrivatePath({
        projectId: project.id,
        trackId: project.tracks[0]?.id ?? null,
        tab: "lyrics",
      }),
    );
    const initialAudio = normalizeTrackAudioSources(project.tracks[0] ?? { audioVersions: [], assets: [] })[0] ?? null;
    setSelectedAudioSourceId(initialAudio?.id ?? null);
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
    const initialAudio = normalizeTrackAudioSources(track)[0] ?? null;
    setSelectedAudioSourceId(initialAudio?.id ?? null);
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

  const handleDraftLyricsChange = (newLyrics: string, preserveDocument = false) => {
    if (featureFlags.lyricsStructuredEditor && !preserveDocument) lyricsDocumentDraft.setPlainText(newLyrics);
    draftLyricsRef.current = newLyrics;
    setDraftLyrics(newLyrics);
    if (!canEdit) return;
    setLyricsSaveStatus("dirty");
    setLyricsStatusMessage("");
    persistEmergencyDraft("local-only", newLyrics);
    void persistLocalDraft("local-only", newLyrics);
    scheduleLyricsAutosave(newLyrics);
  };

  const handleDraftDocumentChange = (document: LyricsDocument) => { lyricsDocumentDraft.setDocument(document); handleDraftLyricsChange(lyricsDocumentToPlainText(document), true); };

  const handleRestoreLocalDraft = async () => {
    const scope = currentDraftScope();
    const localDraft = scope && activeTrack ? await readMergedDraft(scope) : null;
    if (!localDraft || !activeTrack) return void setRestoreDraftSnapshot(null);
    setDraftLyrics(localDraft.content);
    setLyricsSaveStatus(localDraft.syncState === "conflict" ? "conflict" : "dirty");
    if (featureFlags.lyricsStructuredEditor) lyricsDocumentDraft.loadLocal(localDraft);
    draftLyricsRef.current = localDraft.content;
    setDraftRevision(activeTrack.lyricsRevision); draftRevisionRef.current = activeTrack.lyricsRevision;
    setDraftServerUpdatedAt(activeTrack.updatedAt);
    setLyricsStatusMessage(""); setRestoreDraftSnapshot(null); clearDiscussionState();
  };

  const handleUseServerDraft = async () => {
    const scope = currentDraftScope();
    if (!scope || !activeTrack) return;
    setDraftLyrics(activeTrack.lyrics); draftLyricsRef.current = activeTrack.lyrics;
    if (featureFlags.lyricsStructuredEditor) lyricsDocumentDraft.loadTrack(activeTrack);
    setDraftRevision(activeTrack.lyricsRevision); draftRevisionRef.current = activeTrack.lyricsRevision;
    lastSyncedLyricsRef.current = activeTrack.lyrics;
    setDraftServerUpdatedAt(activeTrack.updatedAt);
    setLyricsSaveStatus("saved"); setLyricsSavedAt(activeTrack.updatedAt);
    setLyricsStatusMessage(""); setRestoreDraftSnapshot(null); clearDiscussionState();
    await removeLocalDraft(scope).catch(() => undefined);
  };

  const handleDownloadLocalDraft = () => downloadLocalLyricsDraft({
    trackTitle: activeTrack?.title ?? null,
    readLocalDraft: async () => {
      const scope = currentDraftScope();
      return scope ? readMergedDraft(scope) : null;
    },
  });

  const handleCreateLyricVersion = async (label: string) => {
    await createLyricSnapshot({ activeProjectId: activeProject?.id ?? null, activeTrackId: activeTrack?.id ?? null, canEdit, syncDraft: forceSyncLyricsDraft, onSyncRequired: () => setLyricsStatusMessage("Сначала синхронизируйте черновик с сервером"), createVersion: (projectId, trackId, payload) => withAuth(() => createLyricVersion(projectId, trackId, payload)), structured: featureFlags.lyricsStructuredEditor, document: lyricsDocumentDraft.forPlainText(draftLyricsRef.current), plainText: draftLyricsRef.current, label, refreshTrack: refreshCurrentTrack });
    setLyricsSaveStatus("saved");
  };

  const handleRestoreLyricVersion = (version: Track["lyricVersions"][number]) => restoreLyricSnapshot({ activeTrackId: activeTrack?.id ?? null, canEdit, isEditing: lyricsLease.isEditing, requestEdit: lyricsLease.requestEdit, version, structured: featureFlags.lyricsStructuredEditor, setDocument: lyricsDocumentDraft.setDocument, applyPlainText: handleDraftLyricsChange, clearSelection: () => setSelectedLineIndex(null), syncDraft: forceSyncLyricsDraft });

  const handleExportLyricsTxt = (version: Track["lyricVersions"][number] | null) => exportLyricsTxt({ trackTitle: activeTrack?.title ?? null, version, structured: featureFlags.lyricsStructuredEditor, currentDocument: lyricsDocumentDraft.document, currentPlainText: draftLyricsRef.current });

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

  const handleOpenSelectedLineComments = (lineIndex: number) => {
    setSelectedLineIndex(lineIndex);
    if (!lyricsDiscussionsEnabled && isMobileViewport()) {
      setActiveSidebar("comments");
      setShowLyricsComments(true);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => postChatMessage(activeProject.id, activeTrack.id, { text }));
    await refreshCurrentTrack();
  };

  const handleSendProjectMessage = async (text: string) => {
    if (!activeProject) return;
    await withAuth(() => postProjectChatMessage(activeProject.id, { text }));
    await refreshActiveProject(activeProject.id);
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

  const handleAddProjectTask = async (title: string, assignedToId?: string) => {
    if (!activeProject) return;
    await withAuth(() => createProjectTask(activeProject.id, { title, assignedToId: assignedToId ?? null }));
    await refreshActiveProject(activeProject.id);
  };

  const handleUpdateProjectTaskStatus = async (taskId: string, status: Task["status"]) => {
    if (!activeProject) return;
    await withAuth(() => updateProjectTask(activeProject.id, taskId, { status }));
    await refreshActiveProject(activeProject.id);
  };

  const handleAddAnnotation = async (timestampSeconds: number, text: string, trackAssetId: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createAnnotation(activeProject.id, activeTrack.id, { timestampSeconds, text, trackAssetId }));
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

  const lyricsWorkspaceStatusMessage = lyricsLease.editState === "locked"
    ? t("lyrics.lease.locked")
    : lyricsLease.editState === "lost" ? t("lyrics.lease.lost") : lyricsStatusMessage;

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
                <TrackLyricsWorkspace
                  projectTitle={activeProject?.title}
                  track={activeTrack}
                  canEdit={canEdit}
                  draftLyrics={draftLyrics}
                  draftDocument={lyricsDocumentDraft.document}
                  isEditing={lyricsLease.isEditing}
                  editState={lyricsLease.editState}
                  saveStatus={lyricsSaveStatus}
                  savedAt={lyricsSavedAt}
                  statusMessage={lyricsWorkspaceStatusMessage}
                  restoreDraft={restoreDraftSnapshot}
                  selectedLineIndex={selectedLineIndex}
                  audioSources={activeTrackAudioSources}
                  selectedAudioSourceId={selectedAudioSourceId}
                  onChangeDraftLyrics={handleDraftLyricsChange}
                  onChangeDraftDocument={handleDraftDocumentChange}
                  onChangeDiscussionSelection={setDiscussionSelection}
                  onCreateVersion={handleCreateLyricVersion}
                  onRestoreVersion={handleRestoreLyricVersion}
                  onExportTxt={handleExportLyricsTxt}
                  onPinVersion={handlePinVersion}
                  onSelectLine={setSelectedLineIndex}
                  onStartEdit={lyricsLease.requestEdit}
                  onStopEdit={() => void stopLyricsEditing()}
                  onRestoreLocalDraft={handleRestoreLocalDraft}
                    onUseServerDraft={handleUseServerDraft}
                    onDownloadLocalDraft={handleDownloadLocalDraft}
                    onJumpToDiscussion={() => {
                      setActiveSidebar("comments");
                      setShowLyricsComments(true);
                    }}
                    onOpenSelectedLineComments={handleOpenSelectedLineComments}
                    onRequestUpload={() => setShowUploadModal(true)}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAudioSource={setSelectedAudioSourceId}
                  />
              ) : (
                <StateView kind="empty" message={t("state.track.empty")} className="min-h-[220px] flex items-center" />
              )}
              </div>

              <div className={`lg:col-span-3 min-h-0 flex-col gap-4 ${mobileTab === "rightPanel" ? "flex" : "hidden lg:flex"}`}>
              {activeTrack ? (
                <TrackContextPanel
                  track={activeTrack}
                  project={activeProject}
                  currentUser={currentUser}
                  activeSidebar={activeSidebar}
                  canResolve={canResolve}
                  canEdit={canEdit}
                  canSend={canSend}
                  draftLyrics={draftLyrics}
                  selectedLineIndex={selectedLineIndex}
                  discussionSelection={discussionSelection}
                  discussionAnchors={discussionAnchors}
                  discussionThreads={activeTrack.lyricsDiscussions ?? []}
                  useLyricsDiscussions={lyricsDiscussionsEnabled}
                  onSelectSidebar={setActiveSidebar}
                  onClearSelectedLine={() => { setSelectedLineIndex(null); setDiscussionSelection(null); }}
                  onClearDiscussionSelection={() => { setSelectedLineIndex(null); setDiscussionSelection(null); }}
                  onAddComment={handleAddComment}
                  onResolveComment={handleResolveComment}
                  onCreateDiscussionThread={handleCreateDiscussionThread}
                  onReplyDiscussionThread={handleReplyDiscussionThread}
                  onResolveDiscussionThread={handleResolveDiscussionThread}
                  onReanchorDiscussionThread={handleReanchorDiscussionThread}
                  onSendMessage={handleSendMessage}
                  onAddTask={handleAddTask}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                  onUnauthorized={expireSession}
                />
              ) : activeProject ? (
                <ProjectContextPanel
                  project={activeProject}
                  currentUser={currentUser}
                  canSend={canSendProjectChat}
                  canEdit={projectRole === "owner" || projectRole === "editor"}
                  onSendMessage={handleSendProjectMessage}
                  onAddTask={handleAddProjectTask}
                  onUpdateTaskStatus={handleUpdateProjectTaskStatus}
                />
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

      {currentUser && activeTrack && activeTrackSelectedAudio && (
        <StickyAudioPlayer
          trackTitle={activeTrack.title}
          selectedAudio={activeTrackSelectedAudio}
          onOpenTrack={() => {
            if (activeProjectId && activeTrackId) {
              setMobileTab("editor");
              navigate(buildPrivatePath({ projectId: activeProjectId, trackId: activeTrackId, tab: "lyrics" }));
            }
          }}
        />
      )}

      {activeTrack && !lyricsDiscussionsEnabled && (
        <LyricsCommentsSheet
          open={showLyricsComments}
          comments={activeTrack.comments}
          selectedLineIndex={selectedLineIndex}
          lyricsLines={draftLyrics.split("\n")}
          canWrite={canEdit}
          canResolve={canResolve}
          onClose={() => setShowLyricsComments(false)}
          onClearSelectedLine={() => { setSelectedLineIndex(null); setDiscussionSelection(null); }}
          onAddComment={handleAddComment}
          onResolveComment={handleResolveComment}
        />
      )}

      {activeTrack && lyricsDiscussionsEnabled && (
        <LyricsDiscussionsSheet
          open={showLyricsComments}
          threads={activeTrack.lyricsDiscussions ?? []}
          selection={discussionSelection}
          availableAnchors={discussionAnchors}
          canWrite={canEdit}
          canResolve={canResolve}
          onClose={() => setShowLyricsComments(false)}
          onClearSelection={() => { setSelectedLineIndex(null); setDiscussionSelection(null); }}
          onCreateThread={handleCreateDiscussionThread}
          onReply={handleReplyDiscussionThread}
          onResolveThread={handleResolveDiscussionThread}
          onReanchorThread={handleReanchorDiscussionThread}
        />
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
