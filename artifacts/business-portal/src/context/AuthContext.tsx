import React, { createContext, useContext, useState, useEffect } from "react";
import type { Admin, Org } from "@/lib/api";

interface AuthState {
  token: string | null;
  admin: Admin | null;
  org: Org | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, admin: Admin, org: Org) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, admin: null, org: null, isLoading: true });

  useEffect(() => {
    const token = localStorage.getItem("bp_token");
    const adminStr = localStorage.getItem("bp_admin");
    const orgStr = localStorage.getItem("bp_org");
    if (token && adminStr && orgStr) {
      try {
        setState({ token, admin: JSON.parse(adminStr), org: JSON.parse(orgStr), isLoading: false });
      } catch {
        setState({ token: null, admin: null, org: null, isLoading: false });
      }
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = (token: string, admin: Admin, org: Org) => {
    localStorage.setItem("bp_token", token);
    localStorage.setItem("bp_admin", JSON.stringify(admin));
    localStorage.setItem("bp_org", JSON.stringify(org));
    setState({ token, admin, org, isLoading: false });
  };

  const logout = () => {
    localStorage.removeItem("bp_token");
    localStorage.removeItem("bp_admin");
    localStorage.removeItem("bp_org");
    setState({ token: null, admin: null, org: null, isLoading: false });
  };

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
