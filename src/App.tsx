import React, { useState, useEffect } from "react";
import { User, Project, Track, Comment, ChatMessage, Task, AudioAnnotation, AppNotification } from "./types";
import AuthModal from "./components/AuthModal";
import ProjectList from "./components/ProjectList";
import LyricsEditor from "./components/LyricsEditor";
import AudioPlayer from "./components/AudioPlayer";
import CommentsPanel from "./components/CommentsPanel";
import ChatRoom from "./components/ChatRoom";
import TaskBoard from "./components/TaskBoard";
import RhymeFinder from "./components/RhymeFinder";
import NotificationsPanel from "./components/NotificationsPanel";

import {
  Bell,
  Disc,
  MessageSquare,
  Sparkles,
  Users,
  Layers,
  Upload,
  Link as LinkIcon,
  Moon,
  Sun,
  FolderOpen,
  Volume2,
  Trash2,
  ExternalLink,
  ChevronRight,
  Music
} from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<'comments' | 'chat' | 'tasks' | 'rhymes'>('comments');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mobileTab, setMobileTab] = useState<'projects' | 'editor' | 'rightPanel'>('projects');

  // Auto-set mobile tab to projects if there is no active track
  useEffect(() => {
    if (!activeTrack) {
      setMobileTab('projects');
    }
  }, [activeTrack]);

  // Audio Upload Dialog State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // External link form state
  const [extUrl, setExtUrl] = useState("");
  const [extLabel, setExtLabel] = useState("");
  const [extProvider, setExtProvider] = useState<'google' | 'yandex' | 'telegram' | 'other'>('google');

  const [selectedAudioVersionId, setSelectedAudioVersionId] = useState<string | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("collabs_user");
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem("collabs_user");
      }
    }
  }, []);

  const [inviteProjectId, setInviteProjectId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get("invite");
  });
  const [inviteProjectTitle, setInviteProjectTitle] = useState<string | null>(null);

  // Fetch invited project title if invite parameter exists
  useEffect(() => {
    if (!inviteProjectId) return;
    const fetchInviteProj = async () => {
      try {
        const res = await fetch(`/api/projects/${inviteProjectId}`);
        if (res.ok) {
          const data = await res.json();
          setInviteProjectTitle(data.title);
        }
      } catch (err) {
        console.error("Failed to fetch invited project info", err);
      }
    };
    fetchInviteProj();
  }, [inviteProjectId]);

  // Automatically join project when user is logged in
  useEffect(() => {
    if (!currentUser || !inviteProjectId) return;
    const joinProject = async () => {
      try {
        const response = await fetch(`/api/projects/${inviteProjectId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
          }),
        });
        if (response.ok) {
          const joinedProj = await response.json();
          
          // Clear query params to clean URL
          const url = new URL(window.location.href);
          url.searchParams.delete("invite");
          window.history.replaceState({}, document.title, url.toString());
          setInviteProjectId(null);
          setInviteProjectTitle(null);

          // Refresh data and select project
          await fetchData();
          setActiveProject(joinedProj);
          if (joinedProj.tracks && joinedProj.tracks.length > 0) {
            setActiveTrack(joinedProj.tracks[0]);
            setSelectedAudioVersionId(joinedProj.tracks[0].audioVersions[0]?.id || null);
          }
        }
      } catch (err) {
        console.error("Error joining project via invitation", err);
      }
    };
    joinProject();
  }, [currentUser, inviteProjectId]);

  // Fetch all projects, active track details, and notifications from backend
  const fetchData = async (silent = false) => {
    try {
      const url = currentUser ? `/api/projects?userId=${currentUser.id}` : "/api/projects";
      const projRes = await fetch(url);
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData);

        // Update active project and track with fresh data from server
        if (activeProject) {
          const freshProj = projData.find((p: Project) => p.id === activeProject.id);
          if (freshProj) {
            setActiveProject(freshProj);
            if (activeTrack) {
              const freshTrack = freshProj.tracks.find((t: Track) => t.id === activeTrack.id);
              if (freshTrack) {
                setActiveTrack(freshTrack);
              }
            }
          }
        }
      }

      const notifRes = await fetch("/api/notifications");
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData);
      }
    } catch (err) {
      console.error("Failed to poll server updates", err);
    }
  };

  // Poll server for updates every 4 seconds to simulate real-time collaboration
  useEffect(() => {
    if (!currentUser) return;
    fetchData(); // initial fetch

    const interval = setInterval(() => {
      fetchData(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentUser, activeProject?.id, activeTrack?.id]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("collabs_user", JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("collabs_user");
    setActiveProject(null);
    setActiveTrack(null);
  };

  // CREATE PROJECT
  const handleCreateProject = async (title: string, type: 'single' | 'album', tags: string[], coverUrl?: string) => {
    if (!currentUser) return;
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          tags,
          coverUrl,
          userId: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
        }),
      });

      if (response.ok) {
        const newProj = await response.json();
        setProjects((prev) => [...prev, newProj]);
        setActiveProject(newProj);
        // If single, create main track automatically
        if (type === "single") {
          handleAddTrack(newProj.id, `${title} (Основной трек)`);
        }
      }
    } catch (e) {
      console.error("Failed to create project", e);
    }
  };

  // DELETE PROJECT
  const handleDeleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (activeProject?.id === projectId) {
          setActiveProject(null);
          setActiveTrack(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ADD TRACK TO PROJECT
  const handleAddTrack = async (projectId: string, title: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        const newTrack = await response.json();
        // Refresh local projects list and expand newly added track
        fetchData();
        setActiveTrack(newTrack);
      }
    } catch (e) {
      console.error("Failed to add track", e);
    }
  };

  // UPDATE LYRICS & SAVE LYRICS DRAFT VERSION
  const handleUpdateLyrics = async (newLyrics: string, versionLabel?: string, makeOriginal?: boolean) => {
    if (!activeProject || !activeTrack || !currentUser) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: newLyrics,
          author: currentUser.displayName,
          versionLabel,
          makeOriginal,
        }),
      });

      if (response.ok) {
        const updatedTrack = await response.json();
        setActiveTrack(updatedTrack);
        fetchData();
      }
    } catch (e) {
      console.error("Lyrics update failed", e);
    }
  };

  // PIN A VERSION AS ORIGINAL/MASTER
  const handlePinVersion = async (versionId: string) => {
    if (!activeProject || !activeTrack || !currentUser) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/versions/${versionId}/pin`, {
        method: "PUT",
      });

      if (response.ok) {
        const updatedTrack = await response.json();
        setActiveTrack(updatedTrack);
        fetchData();
      }
    } catch (e) {
      console.error("Pin version failed", e);
    }
  };

  // DIRECT FILE UPLOAD (MP3 < 25MB)
  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject || !activeTrack || !currentUser) return;

    if (file.size > 25 * 1024 * 1024) {
      setUploadError("Размер файла превышает ограничение 25 МБ");
      return;
    }

    setIsUploading(true);
    setUploadError("");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = event.target?.result as string;
        const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            isExternal: false,
            uploadedBy: currentUser.displayName,
            fileBase64: base64,
          }),
        });

        if (response.ok) {
          const newAudio = await response.json();
          // Update local state and close panel
          fetchData();
          setShowUploadModal(false);
        } else {
          setUploadError("Не удалось сохранить файл на сервере");
        }
      } catch (err) {
        setUploadError("Ошибка при обработке файла");
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      setUploadError("Ошибка чтения файла");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  // ADD EXTERNAL DEMO / VOCAL LINK (Google, Yandex, TG)
  const handleAddExternalLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extUrl.trim() || !extLabel.trim() || !activeProject || !activeTrack || !currentUser) return;

    setIsUploading(true);
    setUploadError("");
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: extLabel.trim(),
          url: extUrl.trim(),
          isExternal: true,
          externalProvider: extProvider,
          uploadedBy: currentUser.displayName,
        }),
      });

      if (response.ok) {
        fetchData();
        setExtUrl("");
        setExtLabel("");
        setShowUploadModal(false);
      } else {
        setUploadError("Ошибка сохранения ссылки");
      }
    } catch (err) {
      setUploadError("Не удалось подключиться к серверу");
    } finally {
      setIsUploading(false);
    }
  };

  // ADD COMMENT TO LYRICS LINE OR GENERAL COMMENTS
  const handleAddComment = async (text: string, lineIndex?: number) => {
    if (!activeProject || !activeTrack || !currentUser) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineIndex,
          text,
          author: currentUser.displayName,
        }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // RESOLVE / TOGGLE COMMENT STATUS
  const handleResolveComment = async (commentId: string) => {
    if (!activeProject || !activeTrack) return;
    try {
      const response = await fetch(
        `/api/projects/${activeProject.id}/tracks/${activeTrack.id}/comments/${commentId}/resolve`,
        { method: "PUT" }
      );
      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // SEND CHAT MESSAGE
  const handleSendMessage = async (text: string) => {
    if (!activeProject || !activeTrack || !currentUser) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          author: currentUser.displayName,
        }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ADD MICRO TASK
  const handleAddTask = async (title: string, assignedTo?: string) => {
    if (!activeProject || !activeTrack) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assignedTo }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // UPDATE TASK STATUS
  const handleUpdateTaskStatus = async (taskId: string, status: "todo" | "in-progress" | "done") => {
    if (!activeProject || !activeTrack) return;
    try {
      const response = await fetch(
        `/api/projects/${activeProject.id}/tracks/${activeTrack.id}/tasks/${taskId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ADD AUDIO TIMESTAMP ANNOTATION
  const handleAddAnnotation = async (timestampSeconds: number, text: string) => {
    if (!activeProject || !activeTrack || !currentUser) return;
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/tracks/${activeTrack.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestampSeconds,
          text,
          author: currentUser.displayName,
        }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // READ INDIVIDUAL NOTIFICATION
  const handleReadNotification = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // READ ALL NOTIFICATIONS
  const handleReadAllNotifications = async () => {
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // UTILITY: Get comments count for a specific lyrics line
  const trackCommentsCount = (lineIdx: number) => {
    if (!activeTrack) return 0;
    return activeTrack.comments.filter((c) => c.lineIndex === lineIdx && !c.resolved).length;
  };

  // Theme styling helpers
  const themeClasses = theme === "dark"
    ? "bg-neutral-950 text-neutral-100 selection:bg-indigo-600/40"
    : "bg-slate-50 text-slate-900 selection:bg-indigo-200";

  const cardClasses = theme === "dark"
    ? "bg-neutral-900/60 border-neutral-800"
    : "bg-white border-slate-200 shadow-sm";

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${themeClasses}`}>
      {/* If user is not logged in, force authentication modal */}
      {!currentUser && (
        <AuthModal
          onLogin={handleLogin}
          currentUser={currentUser}
          onLogout={handleLogout}
          inviteProjectTitle={inviteProjectTitle}
        />
      )}

      {/* Main Studio Header */}
      <header className={`border-b px-2 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md ${
        theme === "dark" ? "bg-neutral-950/80 border-neutral-900" : "bg-white/80 border-slate-200"
      }`}>
        <div className="flex items-center gap-2 select-none">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-teal-400 flex items-center justify-center shadow-lg transform rotate-3">
            <Disc className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white animate-spin-slow" />
          </div>
          <div className="text-left">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1">
              collabStudio
              <span className="text-[8px] sm:text-[9px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-900 px-1 py-0.2 rounded-full font-normal hidden sm:inline-block">
                BETA v1.2
              </span>
            </h1>
            <p className="text-[9px] text-neutral-400 hidden sm:block">Платформа совместной работы авторов песен</p>
          </div>
        </div>

        {/* Global Toolbar */}
        {currentUser && (
          <div className="flex items-center gap-4">
            {/* Dark / Light toggle button */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`p-2 rounded-full border transition-all cursor-pointer ${
                theme === "dark" ? "bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-amber-400" : "bg-white border-slate-200 text-neutral-600"
              }`}
              title={theme === "dark" ? "Перейти на светлую тему" : "Перейти на темную тему"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Profile component header */}
            <AuthModal onLogin={handleLogin} currentUser={currentUser} onLogout={handleLogout} />
          </div>
        )}
      </header>

      {/* Main Studio Area */}
      {currentUser && (
        <>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 pb-28 lg:pb-4 max-w-7xl mx-auto w-full">
            {/* LEFT PANEL: Projects & Track Directories (3 columns) */}
            <div className={`lg:col-span-3 flex-col gap-4 ${mobileTab === 'projects' ? 'flex' : 'hidden lg:flex'}`}>
            <ProjectList
              projects={projects}
              activeProject={activeProject}
              activeTrack={activeTrack}
              onSelectProject={(p) => {
                setActiveProject(p);
                // Auto load first track if exists
                if (p.tracks.length > 0) {
                  setActiveTrack(p.tracks[0]);
                  setSelectedLineIndex(null);
                  setSelectedAudioVersionId(p.tracks[0].audioVersions[0]?.id || null);
                  setMobileTab('editor');
                } else {
                  setActiveTrack(null);
                }
              }}
              onSelectTrack={(t) => {
                setActiveTrack(t);
                setSelectedLineIndex(null);
                setSelectedAudioVersionId(t.audioVersions[0]?.id || null);
                setMobileTab('editor');
              }}
              onCreateProject={handleCreateProject}
              onAddTrack={handleAddTrack}
              onDeleteProject={handleDeleteProject}
              currentUser={currentUser}
            />
          </div>

          {/* CENTRAL PANEL: Main Lyrics Editor & Audio Deck (6 columns) */}
          <div className={`lg:col-span-6 flex-col gap-5 ${mobileTab === 'editor' ? 'flex' : 'hidden lg:flex'}`}>
            {activeTrack ? (
              <>
                {/* Track General Info Block */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${cardClasses}`}>
                  <div className="text-left">
                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                      <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                      {activeProject?.title}
                    </div>
                    <h2 className="text-base font-bold text-white mt-0.5">{activeTrack.title}</h2>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Загрузить демку / капу
                    </button>
                  </div>
                </div>

                {/* Main Lyrics Editor component */}
                <LyricsEditor
                  lyrics={activeTrack.lyrics}
                  onUpdateLyrics={handleUpdateLyrics}
                  onPinVersion={handlePinVersion}
                  versionHistory={activeTrack.versionHistory}
                  selectedLineIndex={selectedLineIndex}
                  onSelectLine={setSelectedLineIndex}
                  currentUser={currentUser}
                  trackCommentsCount={trackCommentsCount}
                />

                {/* Audio Deck Player block */}
                <AudioPlayer
                  currentTrack={activeTrack}
                  audioVersions={activeTrack.audioVersions}
                  annotations={activeTrack.annotations}
                  onAddAnnotation={handleAddAnnotation}
                  onSelectAudioVersion={(vid) => setSelectedAudioVersionId(vid)}
                  selectedAudioVersionId={selectedAudioVersionId}
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/10 min-h-[400px]">
                <FolderOpen className="w-12 h-12 text-neutral-700 mb-3 animate-pulse" />
                <h3 className="text-white font-semibold text-sm">Рабочее пространство пусто</h3>
                <p className="text-xs text-neutral-400 max-w-sm mt-1 mb-4">
                  Пожалуйста, выберите существующий проект или трек в списке проектов, либо создайте новый, чтобы запустить студию написания текстов и ведения демо-версий.
                </p>
                <button
                  onClick={() => setMobileTab('projects')}
                  className="lg:hidden bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  Открыть проекты
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Lyrical Help, Comments, Chats, and checklists (3 columns) */}
          <div className={`lg:col-span-3 flex-col gap-4 ${mobileTab === 'rightPanel' ? 'flex' : 'hidden lg:flex'}`}>
            {activeTrack ? (
              <div className="flex flex-col h-full space-y-4">
                {/* Tabs to toggle Right side panel modules */}
                <div className="bg-neutral-950 border border-neutral-800 p-1 rounded-xl flex items-center justify-between">
                  <button
                    onClick={() => setActiveSidebar('comments')}
                    className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg transition-all cursor-pointer ${
                      activeSidebar === 'comments' ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Правки
                  </button>
                  <button
                    onClick={() => setActiveSidebar('chat')}
                    className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg transition-all cursor-pointer ${
                      activeSidebar === 'chat' ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Чат
                  </button>
                  <button
                    onClick={() => setActiveSidebar('tasks')}
                    className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg transition-all cursor-pointer ${
                      activeSidebar === 'tasks' ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Задачи
                  </button>
                  <button
                    onClick={() => setActiveSidebar('rhymes')}
                    className={`flex-1 text-[10px] font-bold p-2 py-2 rounded-lg transition-all cursor-pointer ${
                      activeSidebar === 'rhymes' ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    AI Рифмы
                  </button>
                </div>

                {/* Dynamic Content Panel based on active sidebar tab selection */}
                <div className="flex-1 min-h-[360px]">
                  {activeSidebar === 'comments' && (
                    <CommentsPanel
                      comments={activeTrack.comments}
                      onAddComment={handleAddComment}
                      onResolveComment={handleResolveComment}
                      selectedLineIndex={selectedLineIndex}
                      onClearSelectedLine={() => setSelectedLineIndex(null)}
                      lyricsLines={activeTrack.lyrics.split("\n")}
                    />
                  )}
                  {activeSidebar === 'chat' && (
                    <ChatRoom
                      chat={activeTrack.chat}
                      onSendMessage={handleSendMessage}
                      currentUser={currentUser}
                    />
                  )}
                  {activeSidebar === 'tasks' && (
                    <TaskBoard
                      tasks={activeTrack.tasks}
                      onAddTask={handleAddTask}
                      onUpdateTaskStatus={handleUpdateTaskStatus}
                      participants={activeProject ? activeProject.participants : []}
                    />
                  )}
                  {activeSidebar === 'rhymes' && <RhymeFinder />}
                </div>
              </div>
            ) : (
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                <Sparkles className="w-8 h-8 text-neutral-800 mb-2" />
                <p className="text-[11px] text-neutral-500">
                  Выберите активный трек, чтобы открыть панель обсуждения правок, задач, командного чата и AI генератора рифм.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Global Bottom Section: Lenta Izmeneniy */}
        <div className="max-w-7xl mx-auto w-full px-4 pb-32 lg:pb-12">
          <NotificationsPanel
            notifications={notifications}
            onMarkAsRead={handleReadNotification}
            onReadAll={handleReadAllNotifications}
          />
        </div>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden px-4 pb-5 pt-2 bg-gradient-to-t from-black/95 via-black/90 to-transparent">
          <div className={`mx-auto max-w-md rounded-2xl flex items-center justify-around p-1.5 shadow-2xl border backdrop-blur-lg ${
            theme === 'dark' 
              ? 'bg-neutral-900/90 border-neutral-800' 
              : 'bg-white/95 border-slate-200'
          }`}>
            <button
              onClick={() => setMobileTab('projects')}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative cursor-pointer ${
                mobileTab === 'projects'
                  ? theme === 'dark' ? 'text-indigo-400 bg-neutral-800/60' : 'text-indigo-600 bg-indigo-50'
                  : theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FolderOpen className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold">Проекты</span>
              {projects.length > 0 && (
                <span className="absolute top-1 right-3 text-[9px] px-1.5 py-0.2 rounded-full font-mono bg-indigo-600 text-white font-bold">
                  {projects.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setMobileTab('editor')}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative cursor-pointer ${
                mobileTab === 'editor'
                  ? theme === 'dark' ? 'text-indigo-400 bg-neutral-800/60' : 'text-indigo-600 bg-indigo-50'
                  : theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Music className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold">Редактор</span>
              {activeTrack && (
                <span className="absolute top-1.5 right-6 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setMobileTab('rightPanel')}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative cursor-pointer ${
                mobileTab === 'rightPanel'
                  ? theme === 'dark' ? 'text-indigo-400 bg-neutral-800/60' : 'text-indigo-600 bg-indigo-50'
                  : theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold">Обсуждение</span>
              {activeTrack && (
                <span className="absolute top-1 right-3 text-[9px] px-1.5 py-0.2 bg-red-600 text-white rounded-full font-mono font-bold scale-90">
                  {activeSidebar === 'comments' ? 'П' : activeSidebar === 'chat' ? 'Ч' : activeSidebar === 'tasks' ? 'З' : 'AI'}
                </span>
              )}
            </button>
          </div>
        </div>
        </>
      )}

      {/* MODAL: Upload audio versions (Direct File Upload & External link integration) */}
      {showUploadModal && activeProject && activeTrack && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              Добавление Демоверсии или Вокала (Капы)
            </h3>
            <p className="text-xs text-neutral-400 mb-6">
              Вы можете загрузить MP3 файл напрямую на сервер (до 25 МБ) или вставить внешнюю ссылку на облако (Google Drive, Yandex Disk, Telegram) для полной совместной работы соавторов.
            </p>

            {uploadError && (
              <div className="bg-red-950/40 border border-red-900/30 p-2.5 rounded-lg text-red-400 text-xs text-center mb-4">
                {uploadError}
              </div>
            )}

            {/* Columns split: left side direct upload, right side external URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-neutral-900 pt-6">
              {/* DIRECT FILE UPLOAD PANES */}
              <div className="flex flex-col items-center justify-center p-4 border border-dashed border-neutral-800 rounded-xl hover:border-indigo-500/50 bg-neutral-900/10 transition-colors relative min-h-[160px]">
                <Upload className="w-8 h-8 text-neutral-600 mb-2" />
                <span className="text-xs font-semibold text-white">Загрузить MP3 напрямую</span>
                <span className="text-[10px] text-neutral-500 mt-1">Ограничение до 25 МБ</span>

                <input
                  type="file"
                  accept="audio/mp3, audio/*"
                  onChange={handleDirectFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />

                {isUploading && !extUrl && (
                  <div className="absolute inset-0 bg-neutral-950/80 rounded-xl flex flex-col items-center justify-center">
                    <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
                    <span className="text-[11px] text-neutral-400 mt-2 font-mono">Загружаем файл...</span>
                  </div>
                )}
              </div>

              {/* EXTERNAL LINK SUBMISSION FORM */}
              <form onSubmit={handleAddExternalLink} className="space-y-3 flex flex-col justify-between">
                <div className="text-left space-y-2">
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 mb-0.5">ВНЕШНЯЯ ССЫЛКА (Гугл, Яндекс, ТГ)</label>
                    <input
                      type="url"
                      required
                      value={extUrl}
                      onChange={(e) => setExtUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 mb-0.5">НАЗВАНИЕ ССЫЛКИ / ВЕРСИИ</label>
                    <input
                      type="text"
                      required
                      value={extLabel}
                      onChange={(e) => setExtLabel(e.target.value)}
                      placeholder="Например: Капа Марии (Google Drive)"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-400 mb-0.5">ОБЛАЧНЫЙ СЕРВИС</label>
                    <select
                      value={extProvider}
                      onChange={(e) => setExtProvider(e.target.value as any)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="google">Google Диск</option>
                      <option value="yandex">Яндекс Диск</option>
                      <option value="telegram">Telegram ссылка</option>
                      <option value="other">Другой сервис</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUploading || !extUrl.trim() || !extLabel.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium p-1.5 rounded text-xs transition-colors cursor-pointer mt-2"
                >
                  {isUploading && extUrl ? "Сохраняем ссылку..." : "Прикрепить ссылку"}
                </button>
              </form>
            </div>

            <div className="flex justify-end mt-6 border-t border-neutral-900 pt-4">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 rounded-lg cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
