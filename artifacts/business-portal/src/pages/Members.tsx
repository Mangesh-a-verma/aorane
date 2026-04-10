import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type Member } from "@/lib/api";
import { Users, Search, UserCheck, Droplet, RefreshCw } from "lucide-react";

const BG_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-teal-500",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const fetchMembers = () => {
    setLoading(true);
    setError("");
    api.members()
      .then((res) => setMembers(res.members))
      .catch(() => setError("Members load karne mein error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMembers(); }, []);

  const filtered = members.filter((m) =>
    !search || (m.fullName?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Members</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{members.length} enrolled members</p>
          </div>
          <button onClick={fetchMembers} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-2 rounded-lg transition-all">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name se search karein..."
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
          />
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded mb-2 w-3/4" />
                    <div className="h-2 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">{search ? "Koi member nahi mila" : "Abhi tak koi member join nahi kiya"}</p>
            <p className="text-muted-foreground/60 text-sm mt-1">Organization code share karein to invite members</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m, idx) => (
              <div key={m.memberId} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${BG_COLORS[idx % BG_COLORS.length]}`}>
                    {getInitials(m.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground text-sm truncate">{m.fullName || "Unknown User"}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <UserCheck size={11} className="text-primary" />
                      <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                      {m.bloodGroup && m.bloodGroup !== "Unknown" && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          <Droplet size={11} className="text-red-400" />
                          <span className="text-xs text-red-500 font-medium">{m.bloodGroup}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground/60 mt-1.5">
                      Joined {new Date(m.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
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
