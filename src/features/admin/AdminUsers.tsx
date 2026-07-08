import { useEffect, useState } from "react";
import { getAdminUsers, suspendAdminUser, type AdminUser } from "../../api/admin";

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = () => {
    setLoading(true);
    getAdminUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleAction = async (id: string, action: "suspend" | "restore") => {
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await suspendAdminUser(id, action);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto text-slate-100">
      <h2 className="text-2xl font-bold mb-6">Manage Users</h2>
      {error && <div className="text-red-400 mb-4">{error}</div>}
      
      <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
        <table className="w-full text-left">
          <thead className="bg-slate-800 text-slate-400 text-sm">
            <tr>
              <th className="p-4 font-medium">Username</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Role</th>
              <th className="p-4 font-medium">Joined</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm">
            {loading && <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr>}
            {!loading && users.map(user => (
              <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-4">
                  <div className="font-medium text-white">{user.displayName}</div>
                  <div className="text-slate-400">@{user.username}</div>
                </td>
                <td className="p-4 text-slate-300">{user.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    user.role === 'admin' ? 'bg-fuchsia-900/50 text-fuchsia-300' :
                    user.deletedAt ? 'bg-red-900/50 text-red-300' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {user.deletedAt ? "suspended" : user.role}
                  </span>
                </td>
                <td className="p-4 text-slate-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="p-4 text-right">
                  {user.deletedAt ? (
                    <button onClick={() => handleAction(user.id, "restore")} className="text-cyan-400 hover:text-cyan-300 font-medium">Restore</button>
                  ) : user.role === "user" ? (
                    <button onClick={() => handleAction(user.id, "suspend")} className="text-red-400 hover:text-red-300 font-medium">Suspend</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
