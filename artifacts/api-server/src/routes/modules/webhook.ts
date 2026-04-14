import { Router } from "express";
import { pool } from "@workspace/db";
import { verifyWebhookSignature } from "../../lib/razorpay";
import type { Request, Response } from "express";
import { logger } from "../../lib/logger";

const router = Router();

// Razorpay webhook — handles subscription events (auto-recurring)
router.post("/webhooks/razorpay", async (req: Request, res: Response) => {
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody = JSON.stringify(req.body);

  // Verify webhook authenticity if secret is configured
  if (webhookSecret && signature) {
    const valid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }
  }

  type WebhookBody = {
    event: string;
    payload?: {
      subscription?: { entity?: { id?: string; plan_id?: string; status?: string; current_end?: number } };
      payment?: { entity?: { id?: string; amount?: number; subscription_id?: string } };
    };
  };

  const event = req.body as WebhookBody;
  const eventType = event.event || "";
  const subEntity = event.payload?.subscription?.entity;
  const paymentEntity = event.payload?.payment?.entity;

  try {
    if (eventType === "subscription.charged" && subEntity?.id) {
      const subscriptionId = subEntity.id;
      const nextRenewalDate = subEntity.current_end
        ? new Date(subEntity.current_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Extend individual user subscriptions
      await pool.query(
        `UPDATE subscriptions SET expires_at = $1, next_renewal_at = $1, status = 'active', updated_at = NOW()
         WHERE razorpay_subscription_id = $2`,
        [nextRenewalDate, subscriptionId]
      ).catch((e: Error) => logger.warn({ err: e.message }, "subscription update failed"));

      // Extend org subscriptions (no updated_at column)
      await pool.query(
        `UPDATE org_payments SET next_renewal_at = $1, status = 'success'
         WHERE razorpay_subscription_id = $2`,
        [nextRenewalDate, subscriptionId]
      ).catch((e: Error) => logger.warn({ err: e.message }, "org_payment update failed"));

      // Keep user plan active
      await pool.query(
        `UPDATE users SET plan = (SELECT plan FROM subscriptions WHERE razorpay_subscription_id = $1 LIMIT 1), updated_at = NOW()
         WHERE id = (SELECT user_id FROM subscriptions WHERE razorpay_subscription_id = $1 LIMIT 1)`,
        [subscriptionId]
      ).catch((e: Error) => logger.warn({ err: e.message }, "user plan update failed"));
    }

    if (eventType === "subscription.halted" && subEntity?.id) {
      await pool.query(
        `UPDATE subscriptions SET status = 'expired', auto_renew = FALSE, updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [subEntity.id]
      ).catch(() => {});
      await pool.query(
        `UPDATE org_payments SET auto_renew = FALSE WHERE razorpay_subscription_id = $1`,
        [subEntity.id]
      ).catch(() => {});
    }

    if (eventType === "subscription.cancelled" && subEntity?.id) {
      await pool.query(
        `UPDATE subscriptions SET auto_renew = FALSE, updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [subEntity.id]
      ).catch(() => {});
      await pool.query(
        `UPDATE org_payments SET auto_renew = FALSE WHERE razorpay_subscription_id = $1`,
        [subEntity.id]
      ).catch(() => {});
    }

    if (eventType === "subscription.completed" && subEntity?.id) {
      await pool.query(
        `UPDATE subscriptions SET auto_renew = FALSE, status = 'expired', updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [subEntity.id]
      ).catch(() => {});
    }

    res.json({ success: true, event: eventType });
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
