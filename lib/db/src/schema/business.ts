import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const orgTypeEnum = pgEnum("org_type", [
  "corporate",
  "hospital",
  "gym",
  "insurance",
  "ngo",
  "yoga",
  "school",
  "other",
]);

export const orgPlanEnum = pgEnum("org_plan", ["basic", "pro", "max"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "manager", "viewer"]);

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  orgType: orgTypeEnum("org_type").notNull(),
  plan: orgPlanEnum("plan").notNull().default("basic"),
  orgCode: text("org_code").notNull().unique(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  city: text("city"),
  state: text("state"),
  countryCode: text("country_code").notNull().default("IN"),
  gstin: text("gstin"),
  industry: text("industry"),
  companySize: text("company_size"),
  hospitalType: text("hospital_type"),
  bedCount: integer("bed_count"),
  nabhAccredited: boolean("nabh_accredited").notNull().default(false),
  gymType: text("gym_type"),
  memberCount: integer("member_count"),
  irdaiLicense: text("irdai_license"),
  customerBaseSize: text("customer_base_size"),
  totalSeats: integer("total_seats").notNull().default(10),
  usedSeats: integer("used_seats").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isVerified: boolean("is_verified").notNull().default(false),
  discountPct: integer("discount_pct").notNull().default(0),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orgAdminsTable = pgTable("org_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: orgRoleEnum("role").notNull().default("admin"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orgMembersTable = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  enrolledViaCode: text("enrolled_via_code"),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollmentCodesTable = pgTable("enrollment_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  planType: text("plan_type").notNull().default("basic"),
  totalSeats: integer("total_seats").notNull().default(10),
  usedSeats: integer("used_seats").notNull().default(0),
  validityDays: integer("validity_days").notNull().default(365),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insuranceApiKeysTable = pgTable("insurance_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrgAdminSchema = createInsertSchema(orgAdminsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Organization = typeof organizationsTable.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrgAdmin = typeof orgAdminsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
export type EnrollmentCode = typeof enrollmentCodesTable.$inferSelect;
