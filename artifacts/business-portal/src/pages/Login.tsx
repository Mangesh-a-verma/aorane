import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Building2, Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Email aur password dono zaroori hain"); return; }
    setIsLoading(true);
    setError("");
    try {
      const res = await api.login(email, password);
      login(res.token, res.admin, res.org);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040D1C] via-[#0A1628] to-[#0D2035] flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#0077B6]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#1B998B]/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0077B6] to-[#1B998B] mb-4 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            <span className="bg-gradient-to-r from-[#38BDF8] to-[#2DD4BF] bg-clip-text text-transparent">AORANE</span>
          </h1>
          <p className="text-white/50 text-sm mt-1">Business Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-2">Welcome back</h2>
          <p className="text-white/50 text-sm mb-6">Apne organization account mein sign in karein</p>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-white/70 text-sm font-medium mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourorg.com"
                className="w-full bg-white/6 border border-white/12 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#0077B6] focus:ring-1 focus:ring-[#0077B6]/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/6 border border-white/12 rounded-xl px-4 py-3 pr-11 text-white placeholder-white/25 focus:outline-none focus:border-[#0077B6] focus:ring-1 focus:ring-[#0077B6]/50 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#0077B6] to-[#1B998B] hover:from-[#005f91] hover:to-[#157a6e] text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#0077B6]/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/8 text-center">
            <p className="text-white/40 text-sm">
              Nayi organization?{" "}
              <a href="/business-portal/register" className="text-[#38BDF8] hover:text-white transition-colors font-medium">
                Register karein
              </a>
            </p>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 mt-6 text-white/25 text-xs">
          <span>🔒 End-to-end encrypted</span>
          <span>•</span>
          <span>🇮🇳 DPDP Compliant</span>
          <span>•</span>
          <span>✓ AORANE Certified</span>
        </div>
      </div>
    </div>
  );
}
