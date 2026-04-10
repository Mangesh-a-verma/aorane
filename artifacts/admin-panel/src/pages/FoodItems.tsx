import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, type FoodItem } from "@/lib/api";
import { UtensilsCrossed, Plus, Search, X, CheckCircle } from "lucide-react";

export default function FoodItems() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", calories: "", protein: "", carbs: "", fat: "", category: "vegetable",
  });

  useEffect(() => {
    api.foodItems().then((r) => setItems(r.items)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createFoodItem({
        name: form.name, calories: Number(form.calories),
        protein: Number(form.protein), carbs: Number(form.carbs),
        fat: Number(form.fat), category: form.category,
      });
      setItems((i) => [res.item, ...i]);
      setShowModal(false);
      setForm({ name: "", calories: "", protein: "", carbs: "", fat: "", category: "vegetable" });
    } catch (err) { alert((err as Error).message); }
    finally { setCreating(false); }
  };

  const filtered = items.filter((i) => !search || i.name?.toLowerCase().includes(search.toLowerCase()));

  const CATEGORIES = ["vegetable", "fruit", "grain", "protein", "dairy", "snack", "beverage", "fast-food", "sweet", "oil"];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Food Database</h1>
            <p className="text-muted-foreground text-sm">{items.length} food items</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={15} /> Add Item
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Food item name search karein..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 border-b border-border" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <UtensilsCrossed size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi food item nahi mila</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Name", "Cal", "Protein", "Carbs", "Fat", "Category", "Verified"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium text-foreground">{item.name}</td>
                      <td className="px-4 py-2.5 text-orange-500 font-semibold">{item.calories}</td>
                      <td className="px-4 py-2.5 text-blue-500">{item.protein}g</td>
                      <td className="px-4 py-2.5 text-yellow-500">{item.carbs}g</td>
                      <td className="px-4 py-2.5 text-red-400">{item.fat}g</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs capitalize bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.category}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {item.isVerified && <CheckCircle size={14} className="text-green-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">Add Food Item</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name *</label>
                <input value={form.name} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} placeholder="e.g., Palak Paneer"
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Calories (kcal)", key: "calories" },
                  { label: "Protein (g)", key: "protein" },
                  { label: "Carbs (g)", key: "carbs" },
                  { label: "Fat (g)", key: "fat" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                    <input type="number" value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      placeholder="0"
                      className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
                <select value={form.category} onChange={(e) => setForm((x) => ({ ...x, category: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary capitalize">
                  {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <button onClick={create} disabled={creating || !form.name} className="w-full bg-primary text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 mt-1">
                {creating ? "Adding..." : "Add Food Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
