const API_BASE = (import.meta.env.VITE_API_URL ?? "") + "/api";

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
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export interface Org {
  id: string;
  orgType: string;
  name: string;
  orgCode: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  totalSeats: number;
  usedSeats: number;
  isActive: boolean;
  createdAt: string;
}

export interface Admin {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

export interface Member {
  memberId: string;
  userId: string;
  role: string;
  joinedAt: string;
  fullName: string | null;
  bloodGroup: string | null;
}

export interface EnrollmentCode {
  id: string;
  code: string;
  planType: string;
  totalSeats: number;
  usedSeats: number;
  validityDays: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface Overview {
  org: Org;
  memberCount: number;
  activeSeats: number;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; admin: Admin; org: Org }>("/business/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (data: Record<string, unknown>) =>
    request<{ success: boolean; org: Org; token: string; orgCode: string }>("/business/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  overview: () =>
    request<Overview>("/business/overview"),

  members: () =>
    request<{ members: Member[] }>("/business/members"),

  getCodes: () =>
    request<{ codes: EnrollmentCode[] }>("/business/enrollment-codes"),

  createCode: (data: { planType: string; totalSeats: number; validityDays: number }) =>
    request<{ code: EnrollmentCode }>("/business/enrollment-codes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
