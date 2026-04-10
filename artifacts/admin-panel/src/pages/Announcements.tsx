import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type Announcement } from "@/lib/api";
import { Megaphone, Plus, X, Calendar } from "lucide-react";

export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", startsAt: "", endsAt: "" });

  useEffect(() => {
    api.announcements().then((r) => setItems(r.announcements)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createAnnouncement({
        title: form.title, body: form.body,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        targetPlans: ["free", "max", "pro", "family"],
      });
      setItems((i) => [res.announcement, ...i]);
      setShowModal(false);
      setForm({ title: "", body: "", startsAt: "", endsAt: "" });
    } catch (err) { alert((err as Error).message); }
    finally { setCreating(false); }
  };

  const isActive = (ann: Announcement) => {
    const now = new Date();
    const start = ann.startsAt ? new Date(ann.startsAt) : null;
    const end = ann.endsAt ? new Date(ann.endsAt) : null;
    return (!start || start <= now) && (!end || end >= now);
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
            <p className="text-muted-foreground text-sm">{items.length} total announcements</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={15} /> New Announcement
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-24" />)}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Megaphone size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi announcement nahi mili</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((ann) => (
              <div key={ann.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-foreground">{ann.title}</h3>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium
                    ${isActive(ann) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"}`}>
                    {isActive(ann) ? "Live" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{ann.body}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                  <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(ann.createdAt).toLocaleDateString("en-IN")}</span>
                  {ann.endsAt && <span>Ends: {new Date(ann.endsAt).toLocaleDateString("en-IN")}</span>}
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
              <h2 className="font-bold text-foreground">New Announcement</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
                <input value={form.title} onChange={(e) => setForm((x) => ({ ...x, title: e.target.value }))} placeholder="Announcement title"
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Body *</label>
                <textarea value={form.body} onChange={(e) => setForm((x) => ({ ...x, body: e.target.value }))} placeholder="Announcement content..." rows={3}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[{ label: "Starts At", key: "startsAt" }, { label: "Ends At", key: "endsAt" }].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                    <input type="datetime-local" value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary" />
                  </div>
                ))}
              </div>
              <button onClick={create} disabled={creating || !form.title || !form.body}
                className="w-full bg-primary text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 mt-1">
                {creating ? "Creating..." : "Publish Announcement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
