import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { api, type OrgPlan } from "@/lib/api";
import { CreditCard, CheckCircle, Zap, Building2, Crown, AlertCircle, RefreshCw, RotateCcw, XCircle, CalendarClock } from "lucide-react";

declare global {
  interface Window { Razorpay: new (opts: Record<string, unknown>) => { open(): void }; }
}

const PLAN_ICONS: Record<string, React.ElementType> = { starter: Zap, growth: Building2, enterprise: Crown };
const PLAN_FEATURES: Record<string, string[]> = {
  starter:    ["50 member seats", "Member health dashboard", "AORANE ID search", "Enrollment code management", "Basic analytics"],
  growth:     ["200 member seats", "Everything in Starter", "Advanced health analytics", "Team announcements & comms", "Member detail & health trends", "Priority support"],
  enterprise: ["500 member seats", "Everything in Growth", "Custom enrollment codes", "Data export (CSV)", "Dedicated account manager", "White-label reports"],
};

interface SubscriptionInfo {
  plan: string;
  status: string;
  payment_type?: string;
  auto_renew?: boolean;
  next_renewal_at?: string;
  expires_at?: string;
}

export default function Billing() {
  const { org, setOrg } = useAuth();
  const [plans, setPlans] = useState<Record<string, OrgPlan>>({});
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [autoRenew, setAutoRenew] = useState(true);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    api.getBillingSubscription()
      .then((d) => {
        setPlans(d.plans);
        if (d.payment) {
          setSubscription({
            plan: d.payment.plan,
            status: d.payment.status,
            payment_type: d.payment.paymentType || d.payment.payment_type,
            auto_renew: d.payment.autoRenew ?? d.payment.auto_renew,
            next_renewal_at: d.payment.nextRenewalAt || d.payment.next_renewal_at,
            expires_at: d.payment.expiresAt || d.payment.expires_at,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadRazorpay = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const handlePay = async (planKey: string) => {
    setPaying(planKey);
    setError("");
    setSuccess("");
    try {
      if (autoRenew) {
        // Auto-recurring subscription flow
        const sub = await api.createBillingSubscription(planKey, billing);
        if (sub.isTestMode || !sub.razorpaySubscriptionId) {
          if (sub.org) setOrg?.(sub.org);
          setSuccess(sub.message || "Auto-renew subscription activated!");
          setSubscription({ plan: planKey, status: "success", payment_type: "recurring", auto_renew: true, next_renewal_at: sub.nextRenewalAt });
        } else {
          const ok = await loadRazorpay();
          if (!ok) { setError("Payment gateway failed to load"); return; }
          await new Promise<void>((resolve, reject) => {
            const rzp = new window.Razorpay({
              key: sub.razorpayKeyId,
              subscription_id: sub.razorpaySubscriptionId,
              name: "AORANE Business",
              description: `${sub.planLabel} Plan — ${sub.seats} seats (Auto-renew)`,
              handler: async (resp: Record<string, string>) => {
                try {
                  const result = await api.verifyBillingSubscription({
                    paymentId: sub.paymentId,
                    razorpaySubscriptionId: resp.razorpay_subscription_id,
                    razorpayPaymentId: resp.razorpay_payment_id,
                    razorpaySignature: resp.razorpay_signature,
                    plan: planKey,
                  });
                  if (result.org) setOrg?.(result.org);
                  setSuccess(result.message || "Auto-renew subscription activated!");
                  setSubscription({ plan: planKey, status: "success", payment_type: "recurring", auto_renew: true, next_renewal_at: result.expiresAt });
                  resolve();
                } catch (e) { reject(e); }
              },
              prefill: { email: org?.contactEmail, contact: org?.contactPhone },
              theme: { color: "#0077B6" },
            });
            rzp.open();
          });
        }
      } else {
        // One-time payment flow
        const order = await api.createBillingOrder(planKey, billing);
        if (order.isTestMode || !order.razorpayOrderId) {
          const result = await api.verifyBillingPayment({ paymentId: order.paymentId, plan: planKey, isTestMode: true });
          if (result.org) setOrg?.(result.org);
          setSuccess(result.message || "Plan activated!");
          setSubscription({ plan: planKey, status: "success", payment_type: "one_time" });
        } else {
          const ok = await loadRazorpay();
          if (!ok) { setError("Payment gateway failed to load"); return; }
          await new Promise<void>((resolve, reject) => {
            const rzp = new window.Razorpay({
              key: order.razorpayKeyId, amount: order.amount * 100, currency: "INR",
              name: "AORANE Business", description: `${order.planLabel} Plan — ${order.seats} seats`,
              order_id: order.razorpayOrderId,
              handler: async (resp: Record<string, string>) => {
                try {
                  const result = await api.verifyBillingPayment({
                    paymentId: order.paymentId,
                    razorpayOrderId: resp.razorpay_order_id,
                    razorpayPaymentId: resp.razorpay_payment_id,
                    razorpaySignature: resp.razorpay_signature,
                    plan: planKey,
                  });
                  if (result.org) setOrg?.(result.org);
                  setSuccess(result.message || "Plan activated!");
                  setSubscription({ plan: planKey, status: "success", payment_type: "one_time" });
                  resolve();
                } catch (e) { reject(e); }
              },
              prefill: { email: org?.contactEmail, contact: org?.contactPhone },
              theme: { color: "#0077B6" },
            });
            rzp.open();
          });
        }
      }
    } catch (e) {
      setError((e as Error).message || "Payment failed");
    } finally { setPaying(null); }
  };

  const handleCancelAutoRenew = async () => {
    setCancelling(true);
    setError("");
    try {
      const result = await api.cancelBillingSubscription();
      setSuccess(result.message || "Auto-renew cancelled.");
      setSubscription((s) => s ? { ...s, auto_renew: false } : s);
    } catch (e) {
      setError((e as Error).message || "Failed to cancel auto-renew");
    } finally { setCancelling(false); }
  };

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    </Layout>
  );

  const currentPlan = org?.plan || "basic";
  const isVerified = org?.isVerified;
  const renewalDate = subscription?.next_renewal_at ? new Date(subscription.next_renewal_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const isAutoRenewActive = subscription?.auto_renew === true;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Billing & Subscription</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your organization plan and seat allocation</p>
        </div>

        {success && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <CheckCircle size={20} className="text-emerald-500 shrink-0" />
            <p className="text-emerald-400 text-sm font-medium">{success}</p>
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle size={20} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Current plan status */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <CreditCard size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Current Plan</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {currentPlan === "basic" ? "Free (Basic)" : currentPlan} · {org?.totalSeats} seats · {org?.usedSeats} used
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isVerified ? (
                <span className="text-xs bg-emerald-500/15 text-emerald-400 px-3 py-1 rounded-full font-medium">✓ Active</span>
              ) : (
                <span className="text-xs bg-yellow-500/15 text-yellow-400 px-3 py-1 rounded-full font-medium">⚠ Unverified</span>
              )}
              {isAutoRenewActive && (
                <span className="text-xs bg-blue-500/15 text-blue-400 px-3 py-1 rounded-full font-medium flex items-center gap-1">
                  <RotateCcw size={11} /> Auto-renew ON
                </span>
              )}
            </div>
          </div>
          {/* Renewal info + cancel */}
          {isVerified && renewalDate && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock size={14} className="text-primary" />
                {isAutoRenewActive ? `Auto-renews on ${renewalDate}` : `Active until ${renewalDate}`}
              </div>
              {isAutoRenewActive && (
                <button
                  onClick={handleCancelAutoRenew}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? <RefreshCw size={12} className="animate-spin" /> : <XCircle size={13} />}
                  Cancel auto-renew
                </button>
              )}
            </div>
          )}
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <span className={`text-sm font-medium ${billing === "monthly" ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
          <button onClick={() => setBilling(b => b === "monthly" ? "yearly" : "monthly")}
            className={`relative w-12 h-6 rounded-full transition-colors ${billing === "yearly" ? "bg-primary" : "bg-muted"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${billing === "yearly" ? "left-7" : "left-1"}`} />
          </button>
          <span className={`text-sm font-medium ${billing === "yearly" ? "text-foreground" : "text-muted-foreground"}`}>
            Yearly <span className="text-emerald-400 text-xs font-medium">Save 17%</span>
          </span>
        </div>

        {/* Auto-renew toggle */}
        <div className="flex items-center justify-center gap-3 mb-8 bg-blue-500/5 border border-blue-500/10 rounded-xl py-3 px-4">
          <RotateCcw size={15} className={autoRenew ? "text-blue-400" : "text-muted-foreground"} />
          <span className={`text-sm font-medium ${autoRenew ? "text-foreground" : "text-muted-foreground"}`}>Auto-renew (recommended)</span>
          <button onClick={() => setAutoRenew(a => !a)}
            className={`relative w-12 h-6 rounded-full transition-colors ${autoRenew ? "bg-blue-500" : "bg-muted"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoRenew ? "left-7" : "left-1"}`} />
          </button>
          <span className="text-xs text-muted-foreground">{autoRenew ? "Auto-charges on renewal — no interruption" : "Pay manually each cycle"}</span>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {Object.entries(plans).map(([key, plan]) => {
            const Icon = PLAN_ICONS[key] || Zap;
            const features = PLAN_FEATURES[key] || [];
            const amount = billing === "yearly" ? plan.priceYearly : plan.price;
            const isCurrentPlan = subscription && (subscription.plan as string) === key && subscription.status === "success";
            const isPaying = paying === key;
            return (
              <div key={key} className={`relative bg-card border rounded-2xl p-6 flex flex-col transition-all ${isCurrentPlan ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : key === "growth" ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
                {key === "growth" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">Most Popular</div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">Current Plan</div>
                )}
                <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center" style={{ backgroundColor: plan.color + "20" }}>
                  <Icon size={20} style={{ color: plan.color }} />
                </div>
                <h3 className="text-lg font-bold text-foreground">{plan.label}</h3>
                <div className="mt-2 mb-1">
                  <span className="text-3xl font-bold text-foreground">₹{amount.toLocaleString("en-IN")}</span>
                  <span className="text-muted-foreground text-sm">/{billing === "yearly" ? "yr" : "mo"}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{plan.seats} member seats</p>
                {autoRenew && (
                  <p className="text-xs text-blue-400 mb-3 flex items-center gap-1">
                    <RotateCcw size={10} /> Auto-renews {billing === "monthly" ? "every month" : "yearly"}
                  </p>
                )}
                <ul className="flex-1 space-y-2 mb-5">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePay(key)}
                  disabled={isPaying || !!isCurrentPlan}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${isCurrentPlan ? "bg-emerald-500/10 text-emerald-400 cursor-default" : "text-white hover:opacity-90 active:scale-95"}`}
                  style={isCurrentPlan ? {} : { backgroundColor: plan.color }}
                >
                  {isPaying ? <RefreshCw size={15} className="animate-spin" /> : isCurrentPlan ? "✓ Active" : autoRenew ? `Subscribe to ${plan.label}` : `Buy ${plan.label}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Secure payments via Razorpay · GST applicable · Cancel auto-renew anytime
        </p>
      </div>
    </Layout>
  );
}
