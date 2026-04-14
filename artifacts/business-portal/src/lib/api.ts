const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : `${import.meta.env.BASE_URL}api`;

function getToken(): string | null {
  return localStorage.getItem("bp_token");
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts?.headers as Record<string, string>),
  };
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  if (!text || text.trim() === "") {
    throw new Error(`Empty response from server (${res.status}) at ${url}`);
  }
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`); }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export interface Org {
  id: string; orgType: string; name: string; orgCode: string;
  contactEmail: string; contactPhone: string; city: string; state: string;
  totalSeats: number; usedSeats: number; isActive: boolean; isVerified: boolean;
  plan: string; createdAt: string;
}

export interface Admin {
  id: string; fullName: string; role: string; email: string;
}

export interface Member {
  memberId: string; userId: string; role: string; joinedAt: string;
  fullName: string | null; bloodGroup: string | null;
}

export interface MemberSearchResult {
  userId: string; aoraneId: string | null; name: string | null;
  bloodGroup: string | null; gender: string | null; age: number | null;
  city: string | null; bmi: string | null; plan: string;
}

export interface EnrollmentCode {
  id: string; code: string; planType: string; totalSeats: number;
  usedSeats: number; validityDays: number; expiresAt: string;
  isActive: boolean; createdAt: string;
}

export interface Overview {
  org: Org; memberCount: number; activeSeats: number;
}

export interface OrgPlan {
  label: string; seats: number; price: number; priceYearly: number; color: string;
}

export interface Analytics {
  totalMembers: number;
  genderDist: { name: string; value: number; color: string }[];
  planDist: { name: string; value: number }[];
  ageDist: { name: string; value: number }[];
  avgBmi: string | null;
  joinTrend: { date: string; count: number }[];
}

export interface Announcement {
  id: string; title: string; body: string; type: string; sentCount: number; createdAt: string;
}

export interface MemberDetail {
  member: { userId: string; role: string; joinedAt: string };
  profile: { fullName: string | null; bloodGroup: string | null; gender: string | null; bmi: string | null; dateOfBirth: string | null } | null;
  user: { plan: string; aoraneId: string | null };
  recentScores: { scoreDate: string; overallScore: number | null }[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; admin: Admin; org: Org }>("/business/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  register: (data: Record<string, unknown>) =>
    request<{ success: boolean; org: Org; token: string; orgCode: string }>("/business/register", { method: "POST", body: JSON.stringify(data) }),

  overview: () => request<Overview>("/business/overview"),

  members: () => request<{ members: Member[] }>("/business/members"),

  searchMembers: (q: string) =>
    request<{ results: MemberSearchResult[]; count: number }>(`/business/members/search?q=${encodeURIComponent(q)}`),

  getMemberDetail: (userId: string) =>
    request<MemberDetail>(`/business/members/${userId}/detail`),

  removeMember: (userId: string) =>
    request<{ success: boolean }>(`/business/members/${userId}/remove`, { method: "POST" }),

  getCodes: () => request<{ codes: EnrollmentCode[] }>("/business/enrollment-codes"),

  createCode: (data: { planType: string; totalSeats: number; validityDays: number }) =>
    request<{ code: EnrollmentCode }>("/business/enrollment-codes", { method: "POST", body: JSON.stringify(data) }),

  getBillingPlans: () => request<{ plans: Record<string, OrgPlan> }>("/business/billing/plans"),

  getBillingSubscription: () => request<{ payment: Record<string, unknown> | null; org: Org; plans: Record<string, OrgPlan> }>("/business/billing/subscription"),

  createBillingOrder: (plan: string, billing: string) =>
    request<{ paymentId: string; razorpayOrderId: string | null; razorpayKeyId: string | null; amount: number; plan: string; planLabel: string; seats: number; isTestMode: boolean }>("/business/billing/order", { method: "POST", body: JSON.stringify({ plan, billing }) }),

  verifyBillingPayment: (data: Record<string, unknown>) =>
    request<{ success: boolean; org: Org; message: string; expiresAt?: string }>("/business/billing/verify", { method: "POST", body: JSON.stringify(data) }),

  createBillingSubscription: (plan: string, billing: string) =>
    request<{ isTestMode: boolean; paymentId: string; razorpaySubscriptionId?: string; razorpayKeyId?: string; plan: string; planLabel?: string; amount: number; seats?: number; message?: string; nextRenewalAt?: string; expiresAt?: string; org?: Org }>("/business/billing/subscription/create", { method: "POST", body: JSON.stringify({ plan, billing }) }),

  verifyBillingSubscription: (data: Record<string, unknown>) =>
    request<{ success: boolean; org: Org; message: string; expiresAt?: string }>("/business/billing/subscription/verify", { method: "POST", body: JSON.stringify(data) }),

  cancelBillingSubscription: () =>
    request<{ success: boolean; message: string; nextRenewalAt?: string }>("/business/billing/subscription/cancel", { method: "DELETE" }),

  getAnalytics: () => request<Analytics>("/business/analytics"),

  getAnnouncements: () => request<{ announcements: Announcement[] }>("/business/announcements"),

  createAnnouncement: (data: { title: string; body: string; type: string }) =>
    request<{ announcement: Announcement }>("/business/announcements", { method: "POST", body: JSON.stringify(data) }),

  updateSettings: (data: Record<string, string>) =>
    request<{ org: Org }>("/business/settings", { method: "PATCH", body: JSON.stringify(data) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/business/admin/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),
};
