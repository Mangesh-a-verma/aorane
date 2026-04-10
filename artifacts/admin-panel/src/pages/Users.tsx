import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type User } from "@/lib/api";
import { Search, Shield, Ban, CheckCircle, RefreshCw, ChevronDown } from "lucide-react";

const PLANS = ["free", "max", "pro", "family"];
const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  max: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  family: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
};

function UserRow({ user, onUpdate }: { user: User; onUpdate: (id: string, d: Partial<User>) => void }) {
  const [updating, setUpdating] = useState(false);
  const act = async (data: Partial<User>) => { setUpdating(true); await onUpdate(user.id, data); setUpdating(false); };

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-muted-foreground truncate max-w-[100px]">{user.id?.slice(0,8)}...</div>
        <div className="text-sm font-medium text-foreground mt-0.5">{user.phone || "—"}</div>
      </td>
      <td className="px-4 py-3">
        <select value={user.plan} onChange={(e) => act({ plan: e.target.value })}
          disabled={updating}
          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${PLAN_COLORS[user.plan] || PLAN_COLORS.free}`}>
          {PLANS.map((p) => <option key={p} value={p} className="bg-background text-foreground capitalize">{p}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
          ${user.isBanned ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : user.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
          {user.isBanned ? "Banned" : user.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => act({ isBanned: !user.isBanned })} disabled={updating}
            className={`p-1.5 rounded-lg text-xs transition-all ${user.isBanned ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"}`}
            title={user.isBanned ? "Unban" : "Ban"}>
            {user.isBanned ? <CheckCircle size={13} /> : <Ban size={13} />}
          </button>
          <button onClick={() => act({ isActive: !user.isActive })} disabled={updating}
            className="p-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            title={user.isActive ? "Deactivate" : "Activate"}>
            <Shield size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = () => { setLoading(true); api.users().then((r) => setUsers(r.users)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetchUsers(); }, []);

  const updateUser = async (id: string, data: Partial<User>) => {
    await api.updateUser(id, data);
    setUsers((u) => u.map((x) => x.id === id ? { ...x, ...data } : x));
  };

  const filtered = users.filter((u) => !search || u.phone?.includes(search) || u.id?.includes(search));

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Users</h1>
            <p className="text-muted-foreground text-sm">{users.length} registered users</p>
          </div>
          <button onClick={fetchUsers} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Phone ya user ID se dhundho..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["User", "Plan", "Status", "Joined", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Koi user nahi mila</td></tr>
                ) : (
                  filtered.map((u) => <UserRow key={u.id} user={u} onUpdate={updateUser} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
