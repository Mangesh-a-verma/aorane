import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type Language } from "@/lib/api";
import { Languages as LangIcon, Plus, X, RefreshCw } from "lucide-react";

export default function Languages() {
  const [langs, setLangs] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", nameEn: "", nameLocal: "", direction: "ltr" });

  const fetch = () => { setLoading(true); api.languages().then((r) => setLangs(r.languages)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createLanguage(form);
      setLangs((l) => [...l, res.language]);
      setShowModal(false);
      setForm({ code: "", nameEn: "", nameLocal: "", direction: "ltr" });
    } catch (err) { alert((err as Error).message); }
    finally { setCreating(false); }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Languages</h1>
            <p className="text-muted-foreground text-sm">{langs.length} languages configured</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetch} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90">
              <Plus size={15} /> Add Language
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />)}</div>
        ) : langs.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <LangIcon size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi language configure nahi ki gayi</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {langs.map((lang) => (
              <div key={lang.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{lang.code}</span>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{lang.nameEn}</div>
                      <div className="text-muted-foreground text-xs" dir={lang.direction === "rtl" ? "rtl" : "ltr"}>{lang.nameLocal}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lang.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {lang.isActive ? "Active" : "Pending"}
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Translation: {lang.completionPct}%</span>
                    <span className="capitalize">{lang.direction === "rtl" ? "RTL" : "LTR"}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#0077B6] to-[#1B998B] rounded-full" style={{ width: `${lang.completionPct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">Add Language</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Language Code *", key: "code", placeholder: "hi (Hindi), ta (Tamil)" },
                { label: "Name in English *", key: "nameEn", placeholder: "Hindi" },
                { label: "Name in Local Script *", key: "nameLocal", placeholder: "हिन्दी" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                  <input value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Text Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {["ltr", "rtl"].map((d) => (
                    <button key={d} onClick={() => setForm((x) => ({ ...x, direction: d }))}
                      className={`py-2 rounded-xl border text-sm font-medium uppercase transition-all
                        ${form.direction === d ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={create} disabled={creating || !form.code || !form.nameEn || !form.nameLocal}
                className="w-full bg-primary text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 mt-1">
                {creating ? "Adding..." : "Add Language"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
