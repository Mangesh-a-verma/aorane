import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  decimal,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organizationsTable } from "./business";

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "success", "failed", "refunded"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled"]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  source: text("source").notNull().default("razorpay"),
  seats: integer("seats").notNull().default(1),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }),
  discountPct: integer("discount_pct").notNull().default(0),
  promoCodeUsed: text("promo_code_used"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptionsTable.id),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("INR"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  plan: text("plan").notNull(),
  seats: integer("seats").notNull().default(1),
  gatewayFee: decimal("gateway_fee", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const promoCodesTable = pgTable("promo_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  discountPct: integer("discount_pct").notNull(),
  discountType: text("discount_type").notNull().default("percent"),
  applicablePlans: text("applicable_plans").array(),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  isLifetimeUpgrade: boolean("is_lifetime_upgrade").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralsTable = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  referredId: uuid("referred_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rewardStatus: text("reward_status").notNull().default("pending"),
  rewardAmount: decimal("reward_amount", { precision: 8, scale: 2 }),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type PromoCode = typeof promoCodesTable.$inferSelect;
