import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type Flag } from "@/lib/api";
import { Flag as FlagIcon, Plus, RefreshCw, X } from "lucide-react";

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!enabled)}
      className={`relative w-10 h-5 rounded-full transition-all duration-200 ${enabled ? "bg-[#1B998B]" : "bg-muted"}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${enabled ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

export default function FeatureFlags() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: "", label: "", description: "", isEnabled: false });

  const fetch = () => { setLoading(true); api.flags().then((r) => setFlags(r.flags)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const toggle = async (key: string, enabled: boolean) => {
    await api.updateFlag(key, { isEnabled: enabled });
    setFlags((f) => f.map((x) => x.key === key ? { ...x, isEnabled: enabled } : x));
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createFlag(form);
      setFlags((f) => [res.flag, ...f]);
      setShowModal(false);
      setForm({ key: "", label: "", description: "", isEnabled: false });
    } catch (err) { alert((err as Error).message); }
    finally { setCreating(false); }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feature Flags</h1>
            <p className="text-muted-foreground text-sm">Platform features on/off control</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetch} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-all">
              <Plus size={15} /> New Flag
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="h-4 bg-muted rounded w-40 mb-2" />
                    <div className="h-3 bg-muted rounded w-64" />
                  </div>
                  <div className="w-10 h-5 bg-muted rounded-full" />
                </div>
              </div>
            ))
          ) : flags.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <FlagIcon size={36} className="text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Koi feature flag nahi mili</p>
            </div>
          ) : (
            flags.map((flag) => (
              <div key={flag.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4 hover:border-primary/20 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{flag.key}</span>
                    <span className="font-semibold text-foreground text-sm">{flag.label}</span>
                  </div>
                  {flag.description && <p className="text-xs text-muted-foreground truncate">{flag.description}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium ${flag.isEnabled ? "text-[#1B998B]" : "text-muted-foreground"}`}>
                    {flag.isEnabled ? "ON" : "OFF"}
                  </span>
                  <Toggle enabled={flag.isEnabled} onChange={(v) => toggle(flag.key, v)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">New Feature Flag</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Key *", key: "key", placeholder: "feature_key_name" },
                { label: "Label *", key: "label", placeholder: "User-facing label" },
                { label: "Description", key: "description", placeholder: "What does this flag do?" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                  <input value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <label className="text-xs font-medium text-muted-foreground">Enable by default</label>
                <Toggle enabled={form.isEnabled} onChange={(v) => setForm((x) => ({ ...x, isEnabled: v }))} />
              </div>
              <button onClick={create} disabled={creating || !form.key || !form.label}
                className="w-full bg-primary text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 mt-2">
                {creating ? "Creating..." : "Create Flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
