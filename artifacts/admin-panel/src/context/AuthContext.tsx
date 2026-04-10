import React, { createContext, useContext, useState, useEffect } from "react";

interface AdminUser { id: string; fullName: string; role: string; }
interface AuthState { token: string | null; admin: AdminUser | null; isLoading: boolean; }
interface AuthCtx extends AuthState { login: (token: string, admin: AdminUser) => void; logout: () => void; }

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, admin: null, isLoading: true });

  useEffect(() => {
    const token = localStorage.getItem("ap_token");
    const adminStr = localStorage.getItem("ap_admin");
    if (token && adminStr) {
      try { setState({ token, admin: JSON.parse(adminStr), isLoading: false }); }
      catch { setState({ token: null, admin: null, isLoading: false }); }
    } else { setState((s) => ({ ...s, isLoading: false })); }
  }, []);

  const login = (token: string, admin: AdminUser) => {
    localStorage.setItem("ap_token", token);
    localStorage.setItem("ap_admin", JSON.stringify(admin));
    setState({ token, admin, isLoading: false });
  };
  const logout = () => {
    localStorage.removeItem("ap_token");
    localStorage.removeItem("ap_admin");
    setState({ token: null, admin: null, isLoading: false });
  };

  return <Ctx.Provider value={{ ...state, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
