import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ShieldAlert, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await api.login(email, password);
      login(res.token, res.admin);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040D1C] via-[#071529] to-[#0A1E35] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-[#0077B6]/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#1B998B]/10 rounded-full blur-3xl" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-900/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 items-center justify-center mb-4 shadow-lg shadow-red-900/40">
            <ShieldAlert size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Console</h1>
          <p className="text-white/35 text-sm mt-1">AORANE Platform Administration</p>
        </div>

        <div className="bg-white/4 backdrop-blur-xl border border-white/8 rounded-2xl p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <ShieldAlert size={14} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-xs">Restricted access. Authorized personnel only.</span>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs font-medium mb-1.5">Admin Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@aorane.in"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#0077B6] text-sm transition-all" />
            </div>
            <div>
              <label className="block text-white/60 text-xs font-medium mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 text-white placeholder-white/20 focus:outline-none focus:border-[#0077B6] text-sm transition-all" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || !email || !password}
              className="w-full bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-semibold py-2.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 text-sm mt-1">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Access Admin Panel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
