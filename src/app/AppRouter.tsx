import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import App from "../App";
import { AdminLayout } from "../features/admin/AdminLayout";
import { TermsPage } from "../features/legal/TermsPage";
import { PrivacyPage } from "../features/legal/PrivacyPage";
import { GuidelinesPage } from "../features/legal/GuidelinesPage";

const PublicProfilePage = React.lazy(() => import("../features/public-profile/PublicProfilePage"));
const ProfileSettingsPage = React.lazy(() => import("../features/profile/ProfileSettingsPage"));
const PublicationManagerPage = React.lazy(() => import("../features/publications/PublicationManagerPage"));
const PublicWorkPage = React.lazy(() => import("../features/publications/PublicWorkPage"));
const PublicCollabPage = React.lazy(() => import("../features/publications/PublicCollabPage"));
const AdminDashboard = React.lazy(() => import("../features/admin/AdminDashboard").then(module => ({ default: module.AdminDashboard })));
const AdminUsers = React.lazy(() => import("../features/admin/AdminUsers").then(module => ({ default: module.AdminUsers })));
const AdminReports = React.lazy(() => import("../features/admin/AdminReports").then(module => ({ default: module.AdminReports })));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh] text-slate-400">
    <div className="animate-pulse">Загрузка...</div>
  </div>
);

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/u/:handle" element={<PublicProfilePage />} />
        <Route path="/works/:slug" element={<PublicWorkPage />} />
        <Route path="/collabs/:slug" element={<PublicCollabPage />} />
        <Route path="/app" element={<App />} />
        <Route path="/app/profile" element={<ProfileSettingsPage />} />
        <Route path="/app/publications" element={<PublicationManagerPage />} />
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
  );
}
