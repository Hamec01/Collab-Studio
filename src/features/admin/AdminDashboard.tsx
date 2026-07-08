import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats, type AdminStats } from "../../api/admin";

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminStats()
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-100">
      <h1 className="text-3xl font-bold mb-6 text-white tracking-tight">Admin Dashboard</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-xl backdrop-blur-sm">
          <h3 className="text-slate-400 text-sm uppercase tracking-wider mb-2">Total Users</h3>
          <p className="text-4xl font-light text-cyan-400">{stats?.totalUsers ?? "..."}</p>
        </div>
        <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-xl backdrop-blur-sm">
          <h3 className="text-slate-400 text-sm uppercase tracking-wider mb-2">Publications</h3>
          <p className="text-4xl font-light text-fuchsia-400">{stats?.totalPublications ?? "..."}</p>
        </div>
        <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-xl backdrop-blur-sm">
          <h3 className="text-slate-400 text-sm uppercase tracking-wider mb-2">Pending Reports</h3>
          <p className="text-4xl font-light text-amber-400">{stats?.pendingReports ?? "..."}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/admin/users"
          className="flex flex-col items-center justify-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors"
        >
          <span className="text-xl font-medium mb-2">Manage Users</span>
          <span className="text-sm text-slate-400 text-center">View all users, suspend or restore accounts.</span>
        </Link>
        <Link
          to="/admin/reports"
          className="flex flex-col items-center justify-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors"
        >
          <span className="text-xl font-medium mb-2">Moderation Queue</span>
          <span className="text-sm text-slate-400 text-center">Review content reports and resolve issues.</span>
        </Link>
      </div>
    </div>
  );
}
