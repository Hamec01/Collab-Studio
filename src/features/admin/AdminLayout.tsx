import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../app/auth/AuthProvider";

export function AdminLayout() {
  const { currentUser, isInitializing } = useAuth();

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white tracking-tight">
            CollabStudio <span className="text-fuchsia-500">Admin</span>
          </h1>
          <nav className="space-x-4">
            <a href="/app" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Back to App</a>
          </nav>
        </div>
      </header>
      <main className="py-8">
        <Outlet />
      </main>
    </div>
  );
}
