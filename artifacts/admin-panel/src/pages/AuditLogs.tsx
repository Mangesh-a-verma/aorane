import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type AuditLog } from "@/lib/api";
import { ClipboardList, RefreshCw, Search } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  update_user: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  toggle_feature_flag: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ban_user: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  create_promo_code: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  update_blood_request: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetch = () => { setLoading(true); api.auditLogs().then((r) => setLogs(r.logs)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const filtered = logs.filter((l) => !search ||
    l.action?.includes(search) || l.targetType?.includes(search) || l.targetId?.includes(search)
  );

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
            <p className="text-muted-foreground text-sm">{logs.length} recent actions (last 100)</p>
          </div>
          <button onClick={fetch} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Action ya target search karein..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-3 animate-pulse h-14" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <ClipboardList size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi audit log nahi mili</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Action", "Target", "Details", "Time"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}>
                        {log.action?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground capitalize">{log.targetType}</div>
                      <div className="font-mono text-xs text-foreground/60 truncate max-w-[120px]">{log.targetId?.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      {log.details && (
                        <div className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded max-w-[180px] truncate">
                          {JSON.stringify(log.details)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
