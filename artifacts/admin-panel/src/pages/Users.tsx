import React, { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { api, type User, type SearchResult } from "@/lib/api";
import { Search, Shield, Ban, CheckCircle, RefreshCw, Fingerprint, X, User as UserIcon, Mail, Phone, Copy, Check, Percent, Loader2, AlertCircle, Calendar } from "lucide-react";

const PLANS = ["free", "max", "pro", "family"];
const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  max: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  family: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
};

function CopyBadge({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title="Copy" className="ml-1 inline-flex items-center text-muted-foreground hover:text-primary transition-colors">
      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
    </button>
  );
}

function DiscountModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (d: Partial<User>) => void }) {
  const [pct, setPct] = useState(user.customDiscountPct ? String(user.customDiscountPct) : "");
  const [note, setNote] = useState(user.customDiscountNote || "");
  const [validUntil, setValidUntil] = useState(user.customDiscountValidUntil ? new Date(user.customDiscountValidUntil).toISOString().split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!pct || Number(pct) < 1 || Number(pct) > 100) { setErr("1–100 ke beech value do"); return; }
    setSaving(true); setErr("");
    try {
      await api.setUserCustomDiscount(user.id, { customDiscountPct: Number(pct), customDiscountNote: note || undefined, customDiscountValidUntil: validUntil || null });
      onSaved({ customDiscountPct: Number(pct), customDiscountNote: note || null, customDiscountValidUntil: validUntil || null });
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await api.setUserCustomDiscount(user.id, { remove: true });
      onSaved({ customDiscountPct: null, customDiscountNote: null, customDiscountValidUntil: null });
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Custom Discount" className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-bold text-sm text-foreground">Custom Discount</div>
            <div className="text-xs text-muted-foreground">{user.fullName || user.phone || "—"}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          {err && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertCircle size={11}/>{err}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Discount % *</label>
            <div className="relative">
              <input type="number" min="1" max="100" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 20"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm pr-8 focus:outline-none focus:border-primary" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Beta tester, loyalty reward..."
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Valid Until (optional)</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} min={new Date().toISOString().split("T")[0]}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 pt-0">
          {user.customDiscountPct && (
            <button onClick={remove} disabled={saving} className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/20">Remove</button>
          )}
          <button onClick={save} disabled={saving || !pct}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Percent size={12} />}
            {saving ? "Saving…" : user.customDiscountPct ? "Update" : "Set Discount"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, onUpdate }: { user: User; onUpdate: (id: string, d: Partial<User>) => void }) {
  const [updating, setUpdating] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const act = async (data: Partial<User>) => { setUpdating(true); await onUpdate(user.id, data); setUpdating(false); };
  const aoraneDisplay = user.aoraneId;
  const name = user.fullName;

  return (
    <>
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 min-w-[180px]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <UserIcon size={14} className="text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{name || <span className="text-muted-foreground italic text-xs">No name</span>}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <Phone size={9} className="text-muted-foreground shrink-0" />
              <span className="font-mono text-xs text-muted-foreground truncate">{user.phone || "—"}</span>
              {user.phone && <CopyBadge value={user.phone} />}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div>
          {user.email ? (
            <div className="flex items-center gap-1">
              <Mail size={10} className="text-muted-foreground shrink-0" />
              <span className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">{user.email}</span>
              <CopyBadge value={user.email} />
            </div>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          {aoraneDisplay ? (
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs font-bold text-primary tracking-widest uppercase">
                {aoraneDisplay.replace(/(.{4})(.{4})(.{4})/, "$1 $2 $3")}
              </span>
              <CopyBadge value={aoraneDisplay} />
            </div>
          ) : <span className="text-xs text-muted-foreground italic">Not set</span>}
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">{user.id?.slice(0, 8).toUpperCase()}...</span>
            <CopyBadge value={user.id} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <select value={user.plan} onChange={(e) => act({ plan: e.target.value })}
          disabled={updating}
          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${PLAN_COLORS[user.plan] || PLAN_COLORS.free}`}>
          {PLANS.map((p) => <option key={p} value={p} className="bg-background text-foreground capitalize">{p.toUpperCase()}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
          ${user.isBanned ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : user.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
          {user.isBanned ? "Banned" : user.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {user.lastLoginAt
          ? <div>
              <div>{new Date(user.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</div>
              <div className="text-[10px] text-muted-foreground/60">{new Date(user.lastLoginAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          : <span className="italic text-muted-foreground/50">Never</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => act({ isBanned: !user.isBanned })} disabled={updating}
            className={`p-1.5 rounded-lg text-xs transition-all ${user.isBanned ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"}`}
            title={user.isBanned ? "Unban" : "Ban"}>
            {user.isBanned ? <CheckCircle size={13} /> : <Ban size={13} />}
          </button>
          <button onClick={() => act({ isActive: !user.isActive })} disabled={updating}
            className="p-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            title={user.isActive ? "Deactivate" : "Activate"}>
            <Shield size={13} />
          </button>
          <button onClick={() => setDiscountOpen(true)}
            aria-label="Set custom discount"
            className={`p-1.5 rounded-lg text-xs transition-all ${user.customDiscountPct ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            title={user.customDiscountPct ? `Discount: ${user.customDiscountPct}%` : "Set Discount"}>
            <Percent size={13} />
          </button>
        </div>
      </td>
    </tr>
    {discountOpen && (
      <DiscountModal
        user={user}
        onClose={() => setDiscountOpen(false)}
        onSaved={(d) => { onUpdate(user.id, d); setDiscountOpen(false); }}
      />
    )}
    </>
  );
}

function SearchResultCard({ r }: { r: SearchResult }) {
  const genderLabel = r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : r.gender ? r.gender : "—";
  const planColor = PLAN_COLORS[r.plan] || PLAN_COLORS.free;
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <UserIcon size={18} className="text-primary" />
          </div>
          <div>
            <div className="font-semibold text-foreground">{r.name || "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{r.phone || r.email || "—"}</div>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColor}`}>{r.plan?.toUpperCase()}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-muted/40 rounded-lg px-3 py-2 col-span-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5 tracking-widest">Aorane ID</div>
          {r.aoraneId ? (
            <div className="flex items-center gap-1.5">
              <div className="font-mono text-sm font-bold text-primary tracking-[0.3em] uppercase">
                {r.aoraneId.toUpperCase().replace(/(.{4})(.{4})(.{4})/, "$1 $2 $3")}
              </div>
              <CopyBadge value={r.aoraneId} />
            </div>
          ) : <div className="text-xs text-muted-foreground italic">Not generated</div>}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase">{r.userId?.toUpperCase()}</span>
            <CopyBadge value={r.userId} />
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">Blood Group</div>
          <div className="text-sm font-bold text-red-500">{r.bloodGroup || "—"}</div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">Gender / Age</div>
          <div className="text-sm font-medium">{genderLabel}{r.age ? `, ${r.age} yrs` : ""}</div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 col-span-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">Location / BMI</div>
          <div className="text-sm font-medium">{[r.city, r.state].filter(Boolean).join(", ") || "—"} · BMI {r.bmi || "—"}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.isBanned ? "bg-red-100 text-red-600" : r.isActive ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {r.isBanned ? "Banned" : r.isActive ? "Active" : "Inactive"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Joined {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
        </span>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [aoraneQuery, setAoraneQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 100;

  const fetchUsers = (searchTerm = "") => {
    setLoading(true);
    setOffset(0);
    api.users({ limit: LIMIT, offset: 0, search: searchTerm || undefined })
      .then((r) => { setUsers(r.users); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const loadMore = () => {
    const nextOffset = offset + LIMIT;
    setLoadingMore(true);
    api.users({ limit: LIMIT, offset: nextOffset, search: search || undefined })
      .then((r) => { setUsers((prev) => [...prev, ...r.users]); setTotal(r.total); setOffset(nextOffset); })
      .catch(console.error)
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    if (tableDebounce.current) clearTimeout(tableDebounce.current);
    tableDebounce.current = setTimeout(() => { fetchUsers(search); }, search ? 400 : 0);
    return () => { if (tableDebounce.current) clearTimeout(tableDebounce.current); };
  }, [search]);

  const updateUser = async (id: string, data: Partial<User>) => {
    await api.updateUser(id, data);
    setUsers((u) => u.map((x) => x.id === id ? { ...x, ...data } : x));
  };

  const handleAoraneSearch = (q: string) => {
    setAoraneQuery(q);
    setSearchError("");
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim() || q.trim().length < 3) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.searchUsers(q.trim());
        setSearchResults(res.results);
      } catch (e: unknown) {
        setSearchError((e as Error).message || "Search failed");
        setSearchResults([]);
      } finally { setSearchLoading(false); }
    }, 400);
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Universal Search */}
        <div className="bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Fingerprint size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Universal User Search</h2>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">ID · Phone · Name · Email</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Search by Aorane ID (12-digit), User UUID, Phone number, Name, or Email</p>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={aoraneQuery}
              onChange={(e) => handleAoraneSearch(e.target.value)}
              placeholder="Search by ID, UUID, +91XXXXXXXXXX, name or email..."
              className="w-full bg-card border border-border rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary transition-all font-mono"
            />
            {aoraneQuery && (
              <button onClick={() => { setAoraneQuery(""); setSearchResults(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          {searchLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Searching...
            </div>
          )}

          {searchError && (
            <div className="mt-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">{searchError}</div>
          )}

          {searchResults !== null && !searchLoading && (
            <div className="mt-4">
              {searchResults.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-6 bg-muted/30 rounded-xl">
                  No user found for "{aoraneQuery}"
                </div>
              ) : (
                <div>
                  <div className="text-xs text-muted-foreground mb-3">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {searchResults.map((r) => <SearchResultCard key={r.userId} r={r} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* All Users Table */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">All Users</h1>
              <p className="text-muted-foreground text-sm">
                Showing <span className="font-semibold text-foreground">{users.length}</span>
                {total > 0 && <> of <span className="font-semibold text-foreground">{total}</span></>}
                {search ? <> matching <span className="font-semibold text-primary">"{search}"</span></> : <> registered users</>}
              </p>
            </div>
            <button onClick={() => fetchUsers(search)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-all">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email, Aorane ID or UUID (searches all users)..."
              className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
            {loading && search && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["User", "Email", "Aorane ID / UUID", "Plan", "Status", "Joined", "Last Login", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      {search ? `No users found matching "${search}"` : "No users found"}
                    </td></tr>
                  ) : (
                    users.map((u) => <UserRow key={u.id} user={u} onUpdate={updateUser} />)
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {users.length < total && (
            <div className="mt-3 flex items-center justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-all disabled:opacity-50"
              >
                {loadingMore ? <RefreshCw size={14} className="animate-spin" /> : null}
                {loadingMore ? "Loading…" : `Load more (${total - users.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
