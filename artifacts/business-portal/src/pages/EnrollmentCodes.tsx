import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type EnrollmentCode } from "@/lib/api";
import { QrCode, Plus, Copy, Check, Clock, Users, AlertCircle, X } from "lucide-react";

function CodeBadge({ code }: { code: EnrollmentCode }) {
  const [copied, setCopied] = useState(false);
  const isExpired = new Date(code.expiresAt) < new Date();
  const isFull = code.usedSeats >= code.totalSeats;
  const pct = Math.min(100, (code.usedSeats / code.totalSeats) * 100);

  const copyCode = () => {
    navigator.clipboard.writeText(code.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`bg-card border rounded-xl p-5 transition-all ${isExpired || isFull ? "border-border opacity-60" : "border-border hover:border-primary/30 hover:shadow-sm"}`}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="font-mono text-2xl font-bold text-foreground tracking-widest">{code.code}</div>
          <div className="flex items-center gap-2 mt-1.5">
            {isExpired && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">Expired</span>}
            {isFull && !isExpired && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">Full</span>}
            {!isExpired && !isFull && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full capitalize">{code.planType}</span>}
          </div>
        </div>
        <button onClick={copyCode} className="shrink-0 p-2 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5 text-muted-foreground">
          <span className="flex items-center gap-1"><Users size={11} /> {code.usedSeats}/{code.totalSeats} used</span>
          <span>{pct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-gradient-to-r from-[#0077B6] to-[#1B998B]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock size={11} />
        <span>Expires {new Date(code.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
}

export default function EnrollmentCodes() {
  const [codes, setCodes] = useState<EnrollmentCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ planType: "basic", totalSeats: "20", validityDays: "365" });

  const fetchCodes = () => {
    setLoading(true);
    api.getCodes().then((r) => setCodes(r.codes)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchCodes(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      await api.createCode({
        planType: form.planType,
        totalSeats: parseInt(form.totalSeats),
        validityDays: parseInt(form.validityDays),
      });
      setShowModal(false);
      fetchCodes();
    } catch (err) {
      setError((err as Error).message || "Failed to create code");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Enrollment Codes</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Members ko invite karne ke liye codes banayein</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-medium px-4 py-2.5 rounded-xl text-sm hover:from-[#005f91] hover:to-[#157a6e] transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} />
            New Code
          </button>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-7 bg-muted rounded mb-3 w-3/4" />
                <div className="h-2 bg-muted rounded mb-2" />
                <div className="h-2 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <QrCode size={40} className="text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">Abhi tak koi enrollment code nahi banaya</p>
            <p className="text-muted-foreground/60 text-sm mt-1">New Code button click kar ke pehla code banayein</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 flex items-center gap-2 bg-primary/10 hover:bg-primary/15 text-primary px-4 py-2 rounded-xl text-sm font-medium transition-all"
            >
              <Plus size={15} /> Code Banayein
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {codes.map((code) => <CodeBadge key={code.id} code={code} />)}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground text-lg">New Enrollment Code</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Plan Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {["basic", "premium", "enterprise"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm((f) => ({ ...f, planType: p }))}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium capitalize transition-all
                        ${form.planType === p ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Total Seats</label>
                <input
                  type="number"
                  value={form.totalSeats}
                  onChange={(e) => setForm((f) => ({ ...f, totalSeats: e.target.value }))}
                  min="1"
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Validity (days)</label>
                <div className="grid grid-cols-4 gap-2">
                  {["30", "90", "180", "365"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setForm((f) => ({ ...f, validityDays: d }))}
                      className={`py-2 rounded-xl border text-sm transition-all
                        ${form.validityDays === d ? "bg-primary/15 border-primary text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full bg-gradient-to-r from-[#0077B6] to-[#1B998B] text-white font-semibold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Code Banayein"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
