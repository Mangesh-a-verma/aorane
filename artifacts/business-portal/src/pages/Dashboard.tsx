import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { api, type Overview } from "@/lib/api";
import {
  Users, Server, TrendingUp, Activity, Copy, Check,
  Building2, MapPin, Mail, Phone, Shield,
} from "lucide-react";

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center`} style={{ backgroundColor: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { org } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.overview().then(setOverview).catch(console.error).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(org?.orgCode || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const seatPct = org ? Math.min(100, (org.usedSeats / org.totalSeats) * 100) : 0;

  const orgTypeLabels: Record<string, string> = {
    corporate: "Corporate", hospital: "Hospital", gym: "Gym & Fitness",
    insurance: "Insurance", ngo: "NGO", yoga: "Yoga Studio",
    school: "School", other: "Organization",
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organization ka overview</p>
        </div>

        {/* Enrollment Code Banner */}
        <div className="mb-6 bg-gradient-to-r from-[#0077B6] to-[#1B998B] rounded-xl p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-white/70 text-sm mb-1">Organization Enrollment Code</div>
              <div className="text-3xl font-bold tracking-widest font-mono">{org?.orgCode}</div>
              <div className="text-white/60 text-xs mt-1">Members ko yeh code share karein join karne ke liye</div>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
            >
              {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Code</>}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Members"
            value={loading ? "..." : overview?.memberCount || 0}
            sub="Active enrolled users"
            icon={Users}
            color="#0077B6"
          />
          <StatCard
            label="Seats Used"
            value={`${org?.usedSeats || 0}/${org?.totalSeats || 0}`}
            sub={`${seatPct.toFixed(0)}% utilized`}
            icon={Server}
            color="#1B998B"
          />
          <StatCard
            label="Seat Utilization"
            value={`${seatPct.toFixed(0)}%`}
            sub="Of total capacity"
            icon={TrendingUp}
            color="#F59E0B"
          />
          <StatCard
            label="Status"
            value={org?.isActive ? "Active" : "Inactive"}
            sub="Platform connection"
            icon={Activity}
            color="#10B981"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Org Info Card */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Building2 size={18} className="text-primary" />
              <h2 className="font-semibold text-foreground">Organization Details</h2>
            </div>
            <div className="space-y-3">
              {[
                { icon: Building2, label: "Type", value: orgTypeLabels[org?.orgType || ""] || "—" },
                { icon: MapPin, label: "Location", value: [org?.city, org?.state].filter(Boolean).join(", ") || "—" },
                { icon: Mail, label: "Email", value: org?.contactEmail || "—" },
                { icon: Phone, label: "Phone", value: org?.contactPhone || "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon size={15} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-sm text-foreground font-medium">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seat Capacity Card */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Shield size={18} className="text-primary" />
              <h2 className="font-semibold text-foreground">Seat Capacity</h2>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Used</span>
                <span className="text-foreground font-semibold">{org?.usedSeats} of {org?.totalSeats}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0077B6] to-[#1B998B] rounded-full transition-all duration-500"
                  style={{ width: `${seatPct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2">{org && org.totalSeats - org.usedSeats} seats available</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total", value: org?.totalSeats || 0, color: "text-foreground" },
                { label: "Used", value: org?.usedSeats || 0, color: "text-primary" },
                { label: "Free", value: (org?.totalSeats || 0) - (org?.usedSeats || 0), color: "text-green-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
