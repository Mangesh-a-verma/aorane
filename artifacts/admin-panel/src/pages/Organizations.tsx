import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type Org } from "@/lib/api";
import { Building2, MapPin, Mail, Users, RefreshCw } from "lucide-react";

const TYPE_ICONS: Record<string, string> = {
  corporate: "🏢", hospital: "🏥", gym: "💪", insurance: "🛡️",
  ngo: "🤝", yoga: "🧘", school: "📚", other: "✨",
};

export default function Organizations() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => { setLoading(true); api.organizations().then((r) => setOrgs(r.organizations)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
            <p className="text-muted-foreground text-sm">{orgs.length} registered businesses</p>
          </div>
          <button onClick={fetch} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-muted rounded mb-3 w-2/3" />
                <div className="h-3 bg-muted rounded mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi organization nahi mili</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {orgs.map((org) => (
              <div key={org.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/25 transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-2xl">{TYPE_ICONS[org.orgType] || "🏢"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate">{org.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${org.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                        {org.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{org.orgCode}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  {org.contactEmail && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail size={12} /> <span className="truncate">{org.contactEmail}</span>
                    </div>
                  )}
                  {(org.city || org.state) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin size={12} /> {[org.city, org.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users size={12} /> {org.usedSeats}/{org.totalSeats} seats used
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
