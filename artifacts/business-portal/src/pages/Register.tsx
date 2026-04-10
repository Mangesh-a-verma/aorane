import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Building2, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";

const ORG_TYPES = [
  { value: "corporate", label: "Corporate", icon: "🏢" },
  { value: "hospital", label: "Hospital / Clinic", icon: "🏥" },
  { value: "gym", label: "Gym & Fitness", icon: "💪" },
  { value: "insurance", label: "Insurance", icon: "🛡️" },
  { value: "ngo", label: "NGO / Nonprofit", icon: "🤝" },
  { value: "yoga", label: "Yoga / Wellness", icon: "🧘" },
  { value: "school", label: "School / College", icon: "📚" },
  { value: "other", label: "Other", icon: "✨" },
];

export default function Register() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    orgType: "",
    name: "",
    contactEmail: "",
    contactPhone: "",
    city: "",
    state: "",
    adminName: "",
    adminPassword: "",
    confirmPassword: "",
    totalSeats: "50",
  });

  const set = (field: string, val: string) => setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = async () => {
    if (form.adminPassword !== form.confirmPassword) {
      setError("Passwords match nahi kar rahe");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const res = await api.register({
        orgType: form.orgType,
        name: form.name,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        city: form.city,
        state: form.state,
        adminName: form.adminName,
        adminPassword: form.adminPassword,
        totalSeats: parseInt(form.totalSeats),
      });
      const admin = { id: "", fullName: form.adminName, role: "owner", email: form.contactEmail };
      login(res.token, admin, res.org);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Registration failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040D1C] via-[#0A1628] to-[#0D2035] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#0077B6]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#1B998B]/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0077B6] to-[#1B998B] mb-3">
            <Building2 size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            <span className="bg-gradient-to-r from-[#38BDF8] to-[#2DD4BF] bg-clip-text text-transparent">AORANE</span> Business
          </h1>
          <p className="text-white/50 text-xs mt-1">Apni organization register karein</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? "bg-gradient-to-r from-[#0077B6] to-[#1B998B]" : "bg-white/10"}`} />
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-7 shadow-2xl">
          {error && (
            <div className="mb-4 flex items-start gap-2.5 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Step 1: Org Type */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Organization Type</h2>
              <p className="text-white/45 text-sm mb-5">Aapka organization kaisa hai?</p>
              <div className="grid grid-cols-2 gap-2.5">
                {ORG_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => set("orgType", t.value)}
                    className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-left transition-all
                      ${form.orgType === t.value
                        ? "bg-[#0077B6]/20 border-[#0077B6] text-white"
                        : "bg-white/4 border-white/10 text-white/60 hover:bg-white/7 hover:text-white"
                      }`}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => form.orgType && setStep(2)}
                disabled={!form.orgType}
                className="w-full mt-5 bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-semibold py-3 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
              >
                Aage <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Org Details */}
          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white mb-1">Organization Details</h2>
              <p className="text-white/45 text-sm mb-4">Basic information fill karein</p>

              {[
                { label: "Organization Name *", key: "name", placeholder: "e.g., Sunrise Health Clinic" },
                { label: "Email Address *", key: "contactEmail", placeholder: "admin@yourorg.com", type: "email" },
                { label: "Phone Number", key: "contactPhone", placeholder: "+91 XXXXXXXXXX" },
                { label: "City", key: "city", placeholder: "Mumbai" },
                { label: "State", key: "state", placeholder: "Maharashtra" },
                { label: "Total Seats (Members)", key: "totalSeats", placeholder: "50", type: "number" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-white/60 text-xs font-medium mb-1.5">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={form[f.key as keyof typeof form]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 text-white placeholder-white/25 focus:outline-none focus:border-[#0077B6] transition-all text-sm"
                  />
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white text-sm">
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  onClick={() => form.name && form.contactEmail && setStep(3)}
                  disabled={!form.name || !form.contactEmail}
                  className="flex-1 bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                >
                  Aage <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Admin Setup */}
          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white mb-1">Admin Account</h2>
              <p className="text-white/45 text-sm mb-4">Portal access ke liye credentials set karein</p>

              {[
                { label: "Full Name *", key: "adminName", placeholder: "Dr. Rajesh Kumar" },
                { label: "Password *", key: "adminPassword", placeholder: "••••••••", type: "password" },
                { label: "Confirm Password *", key: "confirmPassword", placeholder: "••••••••", type: "password" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-white/60 text-xs font-medium mb-1.5">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={form[f.key as keyof typeof form]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 text-white placeholder-white/25 focus:outline-none focus:border-[#0077B6] transition-all text-sm"
                  />
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white text-sm">
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || !form.adminName || !form.adminPassword || !form.confirmPassword}
                  className="flex-1 bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                >
                  {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Register"}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-5">
          Already registered?{" "}
          <a href="/business-portal/" className="text-[#38BDF8] hover:underline">Login karein</a>
        </p>
      </div>
    </div>
  );
}
