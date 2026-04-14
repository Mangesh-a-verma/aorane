import crypto from "crypto";

const RAZORPAY_KEY_ID = () => process.env["RAZORPAY_KEY_ID"];
const RAZORPAY_KEY_SECRET = () => process.env["RAZORPAY_KEY_SECRET"];
const BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const id = RAZORPAY_KEY_ID();
  const secret = RAZORPAY_KEY_SECRET();
  if (!id || !secret) return null;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function isLiveMode() {
  return !!RAZORPAY_KEY_ID() && !!RAZORPAY_KEY_SECRET();
}

async function rzPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("Razorpay keys not configured");
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json() as T & { error?: { description: string } };
  if (!r.ok) throw new Error((d as { error?: { description: string } }).error?.description || "Razorpay error");
  return d;
}

async function rzGet<T>(path: string): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("Razorpay keys not configured");
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth, "Content-Type": "application/json" },
  });
  const d = await r.json() as T & { error?: { description: string } };
  if (!r.ok) throw new Error((d as { error?: { description: string } }).error?.description || "Razorpay error");
  return d;
}

export interface RazorpayPlan {
  id: string;
  interval: number;
  period: string;
  item: { amount: number; currency: string; name: string };
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number;
  current_end: number;
  charge_at: number;
  total_count: number;
  paid_count: number;
  short_url: string;
}

export async function createPlan(params: {
  name: string;
  amount: number;
  period: "monthly" | "yearly";
  interval?: number;
}): Promise<RazorpayPlan> {
  return rzPost<RazorpayPlan>("/plans", {
    period: params.period === "yearly" ? "yearly" : "monthly",
    interval: params.interval ?? 1,
    item: { name: params.name, amount: params.amount * 100, currency: "INR" },
  });
}

export async function createSubscription(params: {
  planId: string;
  totalCount?: number;
  customerNotify?: 1 | 0;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  return rzPost<RazorpaySubscription>("/subscriptions", {
    plan_id: params.planId,
    total_count: params.totalCount ?? 120,
    customer_notify: params.customerNotify ?? 1,
    notes: params.notes ?? {},
  });
}

export async function cancelSubscription(subscriptionId: string, cancelAtEnd = false): Promise<{ id: string; status: string }> {
  return rzPost<{ id: string; status: string }>(`/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: cancelAtEnd ? 1 : 0,
  });
}

export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return rzGet<RazorpaySubscription>(`/subscriptions/${subscriptionId}`);
}

export function verifyWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
  const expected = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
  return expected === signature;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = RAZORPAY_KEY_SECRET();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

export function verifySubscriptionSignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  const secret = RAZORPAY_KEY_SECRET();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return expected === signature;
}

export async function createOrder(params: { amount: number; currency?: string; receipt: string }) {
  return rzPost<{ id: string; amount: number; currency: string; status: string }>("/orders", {
    amount: params.amount * 100,
    currency: params.currency ?? "INR",
    receipt: params.receipt,
  });
}
