const API_BASE = (import.meta.env.VITE_API_URL ?? "") + "/api";

export function getToken(): string | null { return localStorage.getItem("ap_token"); }

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts?.headers as Record<string, string>),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export type User = {
  id: string; phone: string; plan: string; isActive: boolean; isBanned: boolean;
  createdAt: string; lastActiveAt: string | null;
};
export type Org = {
  id: string; name: string; orgType: string; orgCode: string; contactEmail: string;
  city: string; state: string; totalSeats: number; usedSeats: number; isActive: boolean; createdAt: string;
};
export type Flag = {
  id: string; key: string; label: string; description: string; isEnabled: boolean;
  enabledForPlans: string[]; config: Record<string, unknown> | null;
};
export type FoodItem = {
  id: string; name: string; calories: number; protein: number; carbs: number;
  fat: number; category: string; isVerified: boolean;
};
export type PromoCode = {
  id: string; code: string; discountPct: number; applicablePlans: string[];
  usageLimit: number | null; timesUsed: number; expiresAt: string | null; isActive: boolean; createdAt: string;
};
export type Announcement = {
  id: string; title: string; body: string; targetPlans: string[];
  startsAt: string | null; endsAt: string | null; isActive: boolean; createdAt: string;
};
export type BloodRequest = {
  id: string; requesterId: string; bloodGroup: string; unitsNeeded: number;
  hospitalName: string; city: string; state: string; status: string; isFlagged: boolean; createdAt: string;
};
export type Language = {
  id: string; code: string; nameEn: string; nameLocal: string;
  direction: string; isActive: boolean; completionPct: number;
};
export type AuditLog = {
  id: string; adminId: string; action: string; targetType: string; targetId: string;
  details: Record<string, unknown> | null; createdAt: string;
};

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; admin: { id: string; fullName: string; role: string } }>("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  overview: () => req<{ stats: { totalUsers: number; totalOrganizations: number } }>("/admin/overview"),
  users: (params?: { limit?: number; offset?: number }) =>
    req<{ users: User[] }>(`/admin/users?limit=${params?.limit || 50}&offset=${params?.offset || 0}`),
  updateUser: (id: string, data: Partial<{ plan: string; isActive: boolean; isBanned: boolean }>) =>
    req<{ user: User }>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  organizations: () => req<{ organizations: Org[] }>("/admin/organizations"),
  flags: () => req<{ flags: Flag[] }>("/admin/feature-flags"),
  createFlag: (data: Partial<Flag>) => req<{ flag: Flag }>("/admin/feature-flags", { method: "POST", body: JSON.stringify(data) }),
  updateFlag: (key: string, data: Partial<Flag>) => req<{ flag: Flag }>(`/admin/feature-flags/${key}`, { method: "PATCH", body: JSON.stringify(data) }),

  foodItems: () => req<{ items: FoodItem[] }>("/admin/food-items"),
  createFoodItem: (data: Partial<FoodItem>) => req<{ item: FoodItem }>("/admin/food-items", { method: "POST", body: JSON.stringify(data) }),

  promoCodes: () => req<{ codes: PromoCode[] }>("/admin/promo-codes"),
  createPromoCode: (data: Partial<PromoCode>) => req<{ code: PromoCode }>("/admin/promo-codes", { method: "POST", body: JSON.stringify(data) }),

  announcements: () => req<{ announcements: Announcement[] }>("/admin/announcements"),
  createAnnouncement: (data: Partial<Announcement>) => req<{ announcement: Announcement }>("/admin/announcements", { method: "POST", body: JSON.stringify(data) }),

  bloodRequests: () => req<{ requests: BloodRequest[] }>("/admin/blood-requests"),
  updateBloodRequest: (id: string, data: { status?: string; isFlagged?: boolean }) =>
    req<{ request: BloodRequest }>(`/admin/blood-requests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  languages: () => req<{ languages: Language[] }>("/admin/languages"),
  createLanguage: (data: Partial<Language>) => req<{ language: Language }>("/admin/languages", { method: "POST", body: JSON.stringify(data) }),

  auditLogs: () => req<{ logs: AuditLog[] }>("/admin/audit-logs"),
};
