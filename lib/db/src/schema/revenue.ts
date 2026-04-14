import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  decimal,
  pgEnum,
  jsonb,
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
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  paymentType: text("payment_type").notNull().default("one_time"),
  autoRenew: boolean("auto_renew").notNull().default(false),
  nextRenewalAt: timestamp("next_renewal_at", { withTimezone: true }),
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
  razorpaySubscriptionId: text("razorpay_subscription_id"),
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

export const planPricingTable = pgTable("plan_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  planKey: text("plan_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  type: text("type").notNull().default("individual"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  maxSeats: integer("max_seats"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  badgeText: text("badge_text"),
  badgeColor: text("badge_color").default("#0077B6"),
  gradientColors: jsonb("gradient_colors").$type<[string, string]>(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
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
export type PlanPricing = typeof planPricingTable.$inferSelect;
