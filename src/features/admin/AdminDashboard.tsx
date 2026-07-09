import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats, getSystemStats, type AdminStats, type SystemStats } from "../../api/admin";

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAdminStats(), getSystemStats()])
      .then(([adminData, systemData]) => {
        setStats(adminData.stats);
        setSystemStats(systemData.system);
      })
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

      {systemStats && (
        <div className="mb-8 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
          <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-200">System Health</h2>
            <div className="flex gap-2">
              {systemStats.alerts.map(alert => (
                <span key={alert} className="text-xs font-bold px-2 py-1 bg-red-900/80 text-red-300 rounded uppercase">
                  {alert}
                </span>
              ))}
              {systemStats.alerts.length === 0 && (
                <span className="text-xs font-bold px-2 py-1 bg-emerald-900/80 text-emerald-300 rounded uppercase">
                  HEALTHY
                </span>
              )}
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Disk Usage</span>
                <span className="text-slate-200 font-mono">{systemStats.diskUsagePercent}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${systemStats.diskUsagePercent > 85 ? 'bg-red-500' : systemStats.diskUsagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${systemStats.diskUsagePercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Memory Usage</span>
                <span className="text-slate-200 font-mono">{systemStats.memUsagePercent}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${systemStats.memUsagePercent > 85 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${systemStats.memUsagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
