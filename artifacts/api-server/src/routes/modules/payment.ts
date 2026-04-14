import { Router } from "express";
import { db, usersTable, subscriptionsTable, paymentsTable, promoCodesTable, planPricingTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";
import {
  isLiveMode, createPlan, createSubscription, cancelSubscription,
  verifySubscriptionSignature, verifyPaymentSignature, createOrder,
} from "../../lib/razorpay";

const router = Router();

async function getPlanFromDB(planKey: string) {
  const [plan] = await db.select().from(planPricingTable).where(eq(planPricingTable.planKey, planKey));
  return plan;
}

// ─── GET: current subscription status ────────────────────────────────────────
router.get("/payment/subscription", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .orderBy(desc(subscriptionsTable.createdAt)).limit(1);
    const [user] = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, req.userId!));
    res.json({ subscription: sub || null, plan: user?.plan || "free" });
  } catch {
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

// ─── POST: validate promo code ────────────────────────────────────────────────
router.post("/payment/promo/validate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { code, plan } = req.body as { code: string; plan: string };
    if (!code) { res.status(400).json({ error: "Code required" }); return; }
    const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, code.toUpperCase()));
    if (!promo) { res.status(404).json({ error: "Invalid promo code" }); return; }
    if (!promo.isActive) { res.status(400).json({ error: "This promo code is no longer active" }); return; }
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      res.status(400).json({ error: "This promo code has expired" }); return;
    }
    if (promo.applicablePlans && !promo.applicablePlans.includes(plan)) {
      res.status(400).json({ error: `This code is only valid for: ${promo.applicablePlans.join(", ")}` }); return;
    }
    res.json({ valid: true, discount: promo.discountPct, code: promo.code, message: `${promo.discountPct}% discount applied!` });
  } catch {
    res.status(500).json({ error: "Failed to validate promo code" });
  }
});

// ─── POST: one-time payment order ─────────────────────────────────────────────
router.post("/payment/order", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { plan, promoCode } = req.body as { plan: string; promoCode?: string };
    const planData = await getPlanFromDB(plan);
    if (!planData || planData.type !== "individual" || planData.planKey === "free") {
      res.status(400).json({ error: "Invalid plan" }); return;
    }
    let discount = 0;
    let promoUsed: string | null = null;
    if (promoCode) {
      const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, promoCode.toUpperCase()));
      if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
        discount = promo.discountPct;
        promoUsed = promo.code;
      }
    }
    const baseAmount = Number(planData.monthlyPrice);
    const finalAmount = Math.round(baseAmount * (1 - discount / 100));
    let razorpayOrderId: string | null = null;
    if (isLiveMode()) {
      const order = await createOrder({ amount: finalAmount, receipt: `usr_${req.userId!.substring(0, 8)}` });
      razorpayOrderId = order.id;
    }
    const [payment] = await db.insert(paymentsTable).values({
      userId: req.userId!, amount: finalAmount.toString(), currency: "INR",
      plan, seats: 1, razorpayOrderId, status: "pending",
    }).returning();
    res.json({
      success: true, paymentId: payment.id, razorpayOrderId,
      razorpayKeyId: process.env["RAZORPAY_KEY_ID"] || null,
      amount: finalAmount, plan, discount, promoUsed,
      planLabel: planData.displayName,
      isTestMode: !isLiveMode(),
    });
  } catch {
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// ─── POST: verify one-time payment ───────────────────────────────────────────
router.post("/payment/verify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature, plan, isTestMode } = req.body as Record<string, unknown>;
    if (!isTestMode && isLiveMode()) {
      const valid = verifyPaymentSignature(razorpayOrderId as string, razorpayPaymentId as string, razorpaySignature as string);
      if (!valid) { res.status(400).json({ error: "Payment signature invalid" }); return; }
    }
    await db.update(paymentsTable).set({ status: "success", razorpayPaymentId: razorpayPaymentId as string }).where(eq(paymentsTable.id, paymentId as string));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await db.insert(subscriptionsTable).values({
      userId: req.userId!, plan: plan as string, status: "active",
      source: "razorpay", expiresAt, paymentType: "one_time", autoRenew: false, nextRenewalAt: expiresAt,
    });
    await db.update(usersTable).set({ plan: plan as "free" | "pro" | "max" | "family" }).where(eq(usersTable.id, req.userId!));
    res.json({ success: true, message: `${plan} plan activate ho gaya!`, expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

// ─── POST: create auto-recurring subscription ─────────────────────────────────
router.post("/payment/subscription/create", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { plan, promoCode } = req.body as { plan: string; promoCode?: string };
    const planData = await getPlanFromDB(plan);
    if (!planData || planData.type !== "individual" || planData.planKey === "free") {
      res.status(400).json({ error: "Invalid plan" }); return;
    }
    let discount = 0;
    let promoUsed: string | null = null;
    if (promoCode) {
      const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, promoCode.toUpperCase()));
      if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
        discount = promo.discountPct;
        promoUsed = promo.code;
      }
    }
    const baseAmount = Number(planData.monthlyPrice);
    const finalAmount = Math.round(baseAmount * (1 - discount / 100));

    if (!isLiveMode()) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const [sub] = await db.insert(subscriptionsTable).values({
        userId: req.userId!, plan, status: "active", source: "razorpay",
        expiresAt, paymentType: "recurring", autoRenew: true, nextRenewalAt: expiresAt,
      }).returning();
      await db.update(usersTable).set({ plan: plan as "free" | "pro" | "max" | "family" }).where(eq(usersTable.id, req.userId!));
      return res.json({
        isTestMode: true, subscriptionId: sub.id, plan, amount: finalAmount, promoUsed,
        expiresAt, nextRenewalAt: expiresAt,
        message: "Auto-renew subscription activated (test mode)",
      });
    }

    const rzPlan = await createPlan({ name: `AORANE ${planData.displayName} Monthly`, amount: finalAmount, period: "monthly" });
    const rzSub = await createSubscription({ planId: rzPlan.id, totalCount: 120, notes: { userId: req.userId!, plan } });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const [sub] = await db.insert(subscriptionsTable).values({
      userId: req.userId!, plan, status: "pending", source: "razorpay",
      expiresAt, paymentType: "recurring", autoRenew: true,
      nextRenewalAt: expiresAt, razorpaySubscriptionId: rzSub.id,
    }).returning();

    res.json({
      isTestMode: false, razorpaySubscriptionId: rzSub.id,
      razorpayKeyId: process.env["RAZORPAY_KEY_ID"],
      subscriptionId: sub.id, plan, amount: finalAmount, discount, promoUsed,
      planLabel: planData.displayName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create subscription";
    res.status(500).json({ error: msg });
  }
});

// ─── POST: verify subscription first payment ──────────────────────────────────
router.post("/payment/subscription/verify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { subscriptionId, razorpaySubscriptionId, razorpayPaymentId, razorpaySignature, plan } = req.body as Record<string, string>;
    if (isLiveMode()) {
      const valid = verifySubscriptionSignature(razorpaySubscriptionId, razorpayPaymentId, razorpaySignature);
      if (!valid) { res.status(400).json({ error: "Payment signature invalid" }); return; }
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await db.update(subscriptionsTable).set({ status: "active", expiresAt, nextRenewalAt: expiresAt }).where(eq(subscriptionsTable.id, subscriptionId));
    await db.update(usersTable).set({ plan: plan as "free" | "pro" | "max" | "family" }).where(eq(usersTable.id, req.userId!));
    res.json({ success: true, message: "Auto-renew subscription activated!", expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to verify subscription" });
  }
});

// ─── DELETE: cancel auto-renew ────────────────────────────────────────────────
router.delete("/payment/subscription/cancel", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .orderBy(desc(subscriptionsTable.createdAt)).limit(1);
    if (!sub) { res.status(404).json({ error: "No active subscription found" }); return; }
    if (isLiveMode() && sub.razorpaySubscriptionId) {
      await cancelSubscription(sub.razorpaySubscriptionId, true);
    }
    await db.update(subscriptionsTable).set({ autoRenew: false }).where(eq(subscriptionsTable.id, sub.id));
    res.json({ success: true, message: "Auto-renew cancelled. Plan stays active until expiry.", expiresAt: sub.expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to cancel auto-renew" });
  }
});

export default router;
