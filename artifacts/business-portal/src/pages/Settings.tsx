import React from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { Building2, User, Shield, LogOut, MapPin, Mail, Phone } from "lucide-react";

export default function Settings() {
  const { admin, org, logout } = useAuth();

  const orgTypeLabels: Record<string, string> = {
    corporate: "Corporate", hospital: "Hospital / Clinic", gym: "Gym & Fitness",
    insurance: "Insurance", ngo: "NGO / Nonprofit", yoga: "Yoga / Wellness",
    school: "School / College", other: "Organization",
  };

  return (
    <Layout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organization aur account details</p>
        </div>

        {/* Admin Profile */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <User size={18} className="text-primary" />
            <h2 className="font-semibold text-foreground">Admin Profile</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0077B6] to-[#1B998B] flex items-center justify-center text-white font-bold text-xl">
              {admin?.fullName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-foreground">{admin?.fullName}</div>
              <div className="text-muted-foreground text-sm capitalize">{admin?.role} · {org?.name}</div>
            </div>
          </div>
        </div>

        {/* Org Details */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <Building2 size={18} className="text-primary" />
            <h2 className="font-semibold text-foreground">Organization Details</h2>
          </div>
          <div className="space-y-4">
            {[
              { icon: Building2, label: "Name", value: org?.name },
              { icon: Building2, label: "Type", value: orgTypeLabels[org?.orgType || ""] },
              { icon: Mail, label: "Contact Email", value: org?.contactEmail },
              { icon: Phone, label: "Phone", value: org?.contactPhone || "Not provided" },
              { icon: MapPin, label: "Location", value: [org?.city, org?.state].filter(Boolean).join(", ") || "Not provided" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <Icon size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-sm font-medium text-foreground">{value || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Org Code */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <Shield size={18} className="text-primary" />
            <h2 className="font-semibold text-foreground">Enrollment Details</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Org Code</div>
              <div className="font-mono font-bold text-foreground text-lg tracking-widest">{org?.orgCode}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Seats</div>
              <div className="font-bold text-foreground">{org?.usedSeats} / {org?.totalSeats}</div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2.5 bg-destructive/10 hover:bg-destructive/15 border border-destructive/20 text-destructive rounded-xl py-3 font-medium text-sm transition-all"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </Layout>
  );
}
