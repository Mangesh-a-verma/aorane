import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type BloodRequest } from "@/lib/api";
import { Droplet, RefreshCw, Flag, CheckCircle, XCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  fulfilled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const BG_COLORS = [
  "bg-red-500", "bg-red-700", "bg-rose-500", "bg-pink-600",
  "bg-orange-500", "bg-amber-600", "bg-yellow-500", "bg-red-800",
];

export default function BloodRequests() {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => { setLoading(true); api.bloodRequests().then((r) => setRequests(r.requests)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const update = async (id: string, data: { status?: string; isFlagged?: boolean }) => {
    await api.updateBloodRequest(id, data);
    setRequests((r) => r.map((x) => x.id === id ? { ...x, ...data } : x));
  };

  const BG_IDX = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Blood Emergency Requests</h1>
            <p className="text-muted-foreground text-sm">{requests.length} requests total</p>
          </div>
          <button onClick={fetch} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-28" />)}</div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Droplet size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi blood request nahi mili</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className={`bg-card border rounded-xl p-5 hover:border-primary/20 transition-all ${req.isFlagged ? "border-red-300 dark:border-red-700/50 bg-red-50/50 dark:bg-red-950/20" : "border-border"}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0
                    ${BG_COLORS[BG_IDX.indexOf(req.bloodGroup) % BG_COLORS.length] || "bg-red-600"}`}>
                    {req.bloodGroup}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-foreground">{req.unitsNeeded} unit{req.unitsNeeded > 1 ? "s" : ""} needed</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[req.status] || STATUS_COLORS.active}`}>
                        {req.status}
                      </span>
                      {req.isFlagged && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          ⚑ Flagged
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {req.hospitalName} · {req.city}, {req.state}
                    </div>
                    <div className="text-xs text-muted-foreground/60 mt-1">
                      {new Date(req.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => update(req.id, { isFlagged: !req.isFlagged })}
                      className={`p-1.5 rounded-lg transition-all ${req.isFlagged ? "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                      title={req.isFlagged ? "Unflag" : "Flag"}>
                      <Flag size={14} />
                    </button>
                    {req.status === "active" && (
                      <>
                        <button onClick={() => update(req.id, { status: "fulfilled" })}
                          className="p-1.5 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-all" title="Mark Fulfilled">
                          <CheckCircle size={14} />
                        </button>
                        <button onClick={() => update(req.id, { status: "cancelled" })}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all" title="Cancel">
                          <XCircle size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
