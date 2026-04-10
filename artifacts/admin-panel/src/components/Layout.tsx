import React, { useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, Building2, Flag, UtensilsCrossed,
  Tag, Megaphone, Droplet, Languages, ClipboardList, LogOut,
  Menu, X, ShieldAlert, ChevronRight,
} from "lucide-react";

const NAV = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard", color: "#0077B6" },
  { path: "/users", icon: Users, label: "Users", color: "#1B998B" },
  { path: "/organizations", icon: Building2, label: "Organizations", color: "#8B5CF6" },
  { path: "/feature-flags", icon: Flag, label: "Feature Flags", color: "#F59E0B" },
  { path: "/food-items", icon: UtensilsCrossed, label: "Food Database", color: "#10B981" },
  { path: "/promo-codes", icon: Tag, label: "Promo Codes", color: "#EF4444" },
  { path: "/announcements", icon: Megaphone, label: "Announcements", color: "#3B82F6" },
  { path: "/blood-requests", icon: Droplet, label: "Blood Emergency", color: "#DC2626" },
  { path: "/languages", icon: Languages, label: "Languages", color: "#7C3AED" },
  { path: "/audit-logs", icon: ClipboardList, label: "Audit Logs", color: "#6B7280" },
];

function NavItem({ path, icon: Icon, label, color }: typeof NAV[0]) {
  const [isActive] = useRoute(path);
  return (
    <Link href={path}>
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 group
        ${isActive ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/6 hover:text-white/80"}`}>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all
          ${isActive ? "bg-white/15" : "bg-transparent group-hover:bg-white/8"}`}>
          <Icon size={15} style={{ color: isActive ? color : undefined }} />
        </div>
        <span className="text-sm flex-1">{label}</span>
        {isActive && <ChevronRight size={13} style={{ color }} />}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-sidebar flex flex-col transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}>

        {/* Branding */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0077B6] to-[#1B998B] flex items-center justify-center">
              <ShieldAlert size={14} className="text-white" />
            </div>
            <div>
              <div className="text-white text-sm font-bold tracking-wide">AORANE</div>
              <div className="text-white/35 text-[10px] font-medium">SUPER ADMIN</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => <NavItem key={item.path} {...item} />)}
        </nav>

        {/* Admin footer */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0077B6] to-[#1B998B] flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{admin?.fullName?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/80 text-xs font-medium truncate">{admin?.fullName}</div>
              <div className="text-white/35 text-[10px] capitalize">{admin?.role}</div>
            </div>
            <button onClick={logout} title="Logout"
              className="p-1 text-white/25 hover:text-destructive transition-colors rounded">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-12 bg-card border-b border-border flex items-center gap-3 px-4 shrink-0">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-muted" onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="text-xs bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full font-mono font-semibold">
            ADMIN PANEL
          </span>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground hidden sm:block">
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
