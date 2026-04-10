import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Users, Building2, Activity, Database, ShieldCheck, Zap } from "lucide-react";

function StatBox({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/25 transition-all">
      <div className="flex items-start justify-between mb-3">
        <span className="text-muted-foreground text-sm">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <Icon size={17} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

const INFO_CARDS = [
  { label: "Platform Version", value: "v2.0.0", icon: Zap, color: "#8B5CF6" },
  { label: "API Status", value: "Healthy", icon: Activity, color: "#10B981" },
  { label: "Database", value: "PostgreSQL", icon: Database, color: "#0077B6" },
  { label: "Auth", value: "JWT + OTP", icon: ShieldCheck, color: "#F59E0B" },
];

export default function Dashboard() {
  const [stats, setStats] = useState<{ totalUsers: number; totalOrganizations: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.overview().then((r) => setStats(r.stats)).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">AORANE platform ka real-time overview</p>
        </div>

        {/* Hero banner */}
        <div className="bg-gradient-to-r from-[#0A1628] to-[#0D2035] border border-white/8 rounded-2xl p-6 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-8 -right-8 w-40 h-40 bg-[#0077B6]/20 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-[#1B998B]/15 rounded-full blur-xl" />
          </div>
          <div className="relative">
            <div className="text-white/40 text-xs font-mono mb-2 uppercase tracking-widest">Platform Health</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white font-bold text-lg">All Systems Operational</span>
            </div>
            <p className="text-white/40 text-sm">API Server · Database · Mobile App · Business Portal</p>
          </div>
        </div>

        {/* Main stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <StatBox label="Total Users" value={loading ? "..." : (stats?.totalUsers ?? 0)} icon={Users} color="#0077B6" sub="Registered accounts" />
          <StatBox label="Organizations" value={loading ? "..." : (stats?.totalOrganizations ?? 0)} icon={Building2} color="#1B998B" sub="Business accounts" />
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {INFO_CARDS.map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <c.icon size={16} style={{ color: c.color }} className="mb-2" />
              <div className="text-foreground font-semibold text-sm">{c.value}</div>
              <div className="text-muted-foreground text-xs mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="mt-5 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-3 text-sm">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { href: "/users", label: "Manage Users", color: "#0077B6" },
              { href: "/feature-flags", label: "Feature Flags", color: "#F59E0B" },
              { href: "/promo-codes", label: "Promo Codes", color: "#EF4444" },
              { href: "/audit-logs", label: "Audit Logs", color: "#6B7280" },
            ].map((a) => (
              <a key={a.href} href={`/admin-panel${a.href}`}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-all text-sm text-muted-foreground hover:text-foreground">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                {a.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
