import { useEffect, useState } from "react";
import { getAdminReports, resolveAdminReport, type AdminContentReport } from "../../api/admin";
import { Link } from "react-router-dom";

export function AdminReports() {
  const [reports, setReports] = useState<AdminContentReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = () => {
    setLoading(true);
    getAdminReports()
      .then((data) => setReports(data.reports))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleResolve = async (id: string, action: "RESOLVED" | "DISMISSED") => {
    const resolution = action === "RESOLVED" ? window.prompt("Enter resolution note (optional):") : null;
    if (action === "RESOLVED" && resolution === null) return; // cancelled
    
    try {
      await resolveAdminReport(id, action, resolution || undefined);
      fetchReports();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-100">
      <h2 className="text-2xl font-bold mb-6">Moderation Queue</h2>
      {error && <div className="text-red-400 mb-4">{error}</div>}
      
      <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
        <table className="w-full text-left">
          <thead className="bg-slate-800 text-slate-400 text-sm">
            <tr>
              <th className="p-4 font-medium">Reporter</th>
              <th className="p-4 font-medium">Type</th>
              <th className="p-4 font-medium">Content ID</th>
              <th className="p-4 font-medium">Reason</th>
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm">
            {loading && <tr><td colSpan={6} className="p-4 text-center">Loading...</td></tr>}
            {!loading && reports.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-500">Queue is empty. Great job!</td></tr>
            )}
            {!loading && reports.map(report => (
              <tr key={report.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-4">
                  <div className="font-medium text-white">{report.reporter.displayName}</div>
                  <div className="text-slate-400">@{report.reporter.username}</div>
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 rounded text-xs font-medium bg-amber-900/30 text-amber-300 border border-amber-700/50">
                    {report.contentType}
                  </span>
                </td>
                <td className="p-4 text-slate-300 font-mono text-xs max-w-[150px] truncate">
                  {report.contentId}
                </td>
                <td className="p-4 text-slate-200">
                  {report.reason}
                </td>
                <td className="p-4 text-slate-400">
                  {new Date(report.createdAt).toLocaleDateString()}
                </td>
                <td className="p-4 text-right space-x-3">
                  <button onClick={() => handleResolve(report.id, "RESOLVED")} className="text-emerald-400 hover:text-emerald-300 font-medium">Resolve</button>
                  <button onClick={() => handleResolve(report.id, "DISMISSED")} className="text-slate-400 hover:text-slate-300 font-medium">Dismiss</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
