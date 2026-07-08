import { Navigate, Route, Routes } from "react-router-dom";
import App from "../App";
import PublicProfilePage from "../features/public-profile/PublicProfilePage";
import ProfileSettingsPage from "../features/profile/ProfileSettingsPage";
import PublicationManagerPage from "../features/publications/PublicationManagerPage";
import PublicWorkPage from "../features/publications/PublicWorkPage";
import PublicCollabPage from "../features/publications/PublicCollabPage";
import { AdminLayout } from "../features/admin/AdminLayout";
import { AdminDashboard } from "../features/admin/AdminDashboard";
import { AdminUsers } from "../features/admin/AdminUsers";
import { AdminReports } from "../features/admin/AdminReports";
import { TermsPage } from "../features/legal/TermsPage";
import { PrivacyPage } from "../features/legal/PrivacyPage";
import { GuidelinesPage } from "../features/legal/GuidelinesPage";

export default function AppRouter() {
  return (
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
  );
}
