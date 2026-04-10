import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type PromoCode } from "@/lib/api";
import { Tag, Plus, Copy, Check, X } from "lucide-react";

export default function PromoCodes() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", discountPct: "10", usageLimit: "100", expiresAt: "" });

  useEffect(() => {
    api.promoCodes().then((r) => setCodes(r.codes)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); });
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createPromoCode({
        code: form.code.toUpperCase(),
        discountPct: Number(form.discountPct),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        applicablePlans: ["max", "pro", "family"],
      });
      setCodes((c) => [res.code, ...c]);
      setShowModal(false);
      setForm({ code: "", discountPct: "10", usageLimit: "100", expiresAt: "" });
    } catch (err) { alert((err as Error).message); }
    finally { setCreating(false); }
  };

  const isExpired = (code: PromoCode) => code.expiresAt && new Date(code.expiresAt) < new Date();
  const isFull = (code: PromoCode) => code.usageLimit !== null && code.timesUsed >= code.usageLimit;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Promo Codes</h1>
            <p className="text-muted-foreground text-sm">{codes.length} codes total</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={15} /> New Code
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-16" />)}</div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Tag size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi promo code nahi mila</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Code", "Discount", "Used", "Expiry", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">{c.code}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400">{c.discountPct}% OFF</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.timesUsed}{c.usageLimit ? `/${c.usageLimit}` : ""}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${isExpired(c) ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : isFull(c) ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                        {isExpired(c) ? "Expired" : isFull(c) ? "Limit Reached" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => copyCode(c.id, c.code)}
                        className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-all">
                        {copiedId === c.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">New Promo Code</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Code *", key: "code", placeholder: "HEALTH20", type: "text" },
                { label: "Discount %", key: "discountPct", placeholder: "10", type: "number" },
                { label: "Usage Limit", key: "usageLimit", placeholder: "100", type: "number" },
                { label: "Expires At", key: "expiresAt", placeholder: "", type: "date" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
                </div>
              ))}
              <button onClick={create} disabled={creating || !form.code} className="w-full bg-primary text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 mt-1">
                {creating ? "Creating..." : "Create Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
