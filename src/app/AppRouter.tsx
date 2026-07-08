import { Navigate, Route, Routes } from "react-router-dom";
import App from "../App";
import PublicProfilePage from "../features/public-profile/PublicProfilePage";
import ProfileSettingsPage from "../features/profile/ProfileSettingsPage";
import PublicationManagerPage from "../features/publications/PublicationManagerPage";
import PublicWorkPage from "../features/publications/PublicWorkPage";
import PublicCollabPage from "../features/publications/PublicCollabPage";

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
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
