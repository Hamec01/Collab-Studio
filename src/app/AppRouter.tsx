import { Navigate, Route, Routes } from "react-router-dom";
import App from "../App";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<App />} />
      <Route path="/app/projects" element={<App />} />
      <Route path="/app/projects/:projectId" element={<App />} />
      <Route path="/app/projects/:projectId/tracks/:trackId" element={<App />} />
      <Route path="/app/projects/:projectId/tracks/:trackId/:tab" element={<App />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
