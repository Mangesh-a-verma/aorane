import React, { useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, QrCode, Settings, LogOut,
  Menu, X, Building2, ChevronRight, Bell,
} from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/members", icon: Users, label: "Members" },
  { path: "/codes", icon: QrCode, label: "Enrollment Codes" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

function NavItem({ path, icon: Icon, label }: { path: string; icon: React.ElementType; label: string }) {
  const [isActive] = useRoute(path);
  return (
    <Link href={path}>
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group
        ${isActive
          ? "bg-primary/20 text-primary font-semibold"
          : "text-sidebar-foreground/70 hover:bg-white/8 hover:text-sidebar-foreground"
        }`}>
        <Icon size={18} className={isActive ? "text-primary" : ""} />
        <span className="text-sm">{label}</span>
        {isActive && <ChevronRight size={14} className="ml-auto text-primary" />}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { admin, org, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const orgTypeLabels: Record<string, string> = {
    corporate: "Corporate",
    hospital: "Hospital",
    gym: "Gym & Fitness",
    insurance: "Insurance",
    ngo: "NGO",
    yoga: "Yoga Studio",
    school: "School",
    other: "Organization",
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform duration-300
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}>

        {/* Logo */}
        <div className="px-6 pt-6 pb-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-wide">AORANE</div>
              <div className="text-sidebar-foreground/50 text-xs">Business Portal</div>
            </div>
          </div>

          {/* Org info */}
          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/8">
            <div className="text-white/90 text-sm font-semibold truncate">{org?.name}</div>
            <div className="text-white/40 text-xs mt-0.5">{orgTypeLabels[org?.orgType || ""] || "Organization"}</div>
            <div className="flex items-center gap-1 mt-2">
              <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((org?.usedSeats || 0) / (org?.totalSeats || 1)) * 100)}%` }}
                />
              </div>
              <span className="text-white/40 text-xs">{org?.usedSeats}/{org?.totalSeats}</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 pb-4 border-t border-sidebar-border pt-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
              <span className="text-primary text-sm font-bold">
                {admin?.fullName?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/90 text-sm font-medium truncate">{admin?.fullName}</div>
              <div className="text-white/40 text-xs capitalize">{admin?.role}</div>
            </div>
            <button onClick={logout} className="text-white/30 hover:text-destructive transition-colors p-1 rounded" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-card border-b border-border flex items-center gap-4 px-4 shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-mono">
              {org?.orgCode}
            </span>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
