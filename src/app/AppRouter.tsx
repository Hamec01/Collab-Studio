import React, { Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import App from "../App";
import { AdminLayout } from "../features/admin/AdminLayout";
import { TermsPage } from "../features/legal/TermsPage";
import { PrivacyPage } from "../features/legal/PrivacyPage";
import { GuidelinesPage } from "../features/legal/GuidelinesPage";
import { AuthEntryPage } from "../features/auth/AuthEntryPage";
import { usePlayer } from "./player/PlayerProvider";
import { StickyAudioPlayer } from "../components/StickyAudioPlayer";

const PublicProfilePage = React.lazy(() => import("../features/public-profile/PublicProfilePage"));
const ProfileSettingsPage = React.lazy(() => import("../features/profile/ProfileSettingsPage"));
const PublicationManagerPage = React.lazy(() => import("../features/publications/PublicationManagerPage"));
const PublicWorkPage = React.lazy(() => import("../features/publications/PublicWorkPage"));
const PublicCollabPage = React.lazy(() => import("../features/publications/PublicCollabPage"));
const DiscoverPage = React.lazy(() => import("../features/discover/DiscoverPage"));
const DmInboxPage = React.lazy(() => import("../features/dm/DmInboxPage"));
const AdminDashboard = React.lazy(() => import("../features/admin/AdminDashboard").then(module => ({ default: module.AdminDashboard })));
const AdminUsers = React.lazy(() => import("../features/admin/AdminUsers").then(module => ({ default: module.AdminUsers })));
const AdminReports = React.lazy(() => import("../features/admin/AdminReports").then(module => ({ default: module.AdminReports })));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh] text-slate-400">
    <div className="animate-pulse">Загрузка...</div>
  </div>
);

function RedirectDiscoverToMain() {
  const location = useLocation();
  return <Navigate to={`/main${location.search}${location.hash}`} replace />;
}

export default function AppRouter() {
  const player = usePlayer();
  const navigate = useNavigate();

  const handleOpenTrack = () => {
    if (player.activeProjectId && player.activeTrackId) {
      navigate(`/app/projects/${player.activeProjectId}/tracks/${player.activeTrackId}/lyrics`);
    }
  };

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/main" replace />} />
          <Route path="/main" element={<DiscoverPage />} />
          <Route path="/discover" element={<RedirectDiscoverToMain />} />
          <Route path="/login" element={<AuthEntryPage mode="login" />} />
          <Route path="/register" element={<AuthEntryPage mode="register" />} />
          <Route path="/u/:handle" element={<PublicProfilePage />} />
          <Route path="/works/:slug" element={<PublicWorkPage />} />
          <Route path="/collabs/:slug" element={<PublicCollabPage />} />
          <Route path="/app" element={<App />} />
          <Route path="/app/profile" element={<ProfileSettingsPage />} />
          <Route path="/app/publications" element={<PublicationManagerPage />} />
          <Route path="/app/messages" element={<DmInboxPage />} />
          <Route path="/app/projects" element={<App />} />
          <Route path="/app/projects/:projectId" element={<App />} />
          <Route path="/app/projects/:projectId/tracks/:trackId" element={<App />} />
          <Route path="/app/projects/:projectId/tracks/:trackId/:tab" element={<App />} />
          
          {/* Admin routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>

          {/* Legal routes */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/guidelines" element={<GuidelinesPage />} />

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
      <StickyAudioPlayer
        trackTitle={player.trackTitle || "Аудио"}
        selectedAudio={player.activeAudioSource}
        onOpenTrack={handleOpenTrack}
      />
    </>
  );
}
