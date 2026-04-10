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

export const bloodGroupEnum = pgEnum("blood_group", ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]);
export const bloodRequestStatusEnum = pgEnum("blood_request_status", ["active", "fulfilled", "expired", "cancelled"]);
export const donorResponseEnum = pgEnum("donor_response", ["can_help", "later", "unavailable"]);

export const familyGroupsTable = pgTable("family_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  maxMembers: integer("max_members").notNull().default(4),
  planId: text("plan_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const familyMembersTable = pgTable("family_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => familyGroupsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bloodDonorsTable = pgTable("blood_donors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  bloodGroup: bloodGroupEnum("blood_group").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  countryCode: text("country_code").notNull().default("IN"),
  lat: text("lat"),
  lng: text("lng"),
  isAvailable: boolean("is_available").notNull().default(true),
  lastDonatedAt: text("last_donated_at"),
  nextEligibleAt: text("next_eligible_at"),
  donationCount: integer("donation_count").notNull().default(0),
  badges: text("badges").array(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  otpVerified: boolean("otp_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const bloodEmergencyRequestsTable = pgTable("blood_emergency_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  patientName: text("patient_name").notNull(),
  bloodGroupNeeded: bloodGroupEnum("blood_group_needed").notNull(),
  hospitalName: text("hospital_name").notNull(),
  hospitalCity: text("hospital_city").notNull(),
  hospitalState: text("hospital_state").notNull(),
  unitsNeeded: integer("units_needed").notNull().default(1),
  contactPhone: text("contact_phone").notNull(),
  contactName: text("contact_name"),
  status: bloodRequestStatusEnum("status").notNull().default("active"),
  donorsNotified: integer("donors_notified").notNull().default(0),
  donorsResponded: integer("donors_responded").notNull().default(0),
  otpVerified: boolean("otp_verified").notNull().default(false),
  flagCount: integer("flag_count").notNull().default(0),
  isFlagged: boolean("is_flagged").notNull().default(false),
  notes: text("notes"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const bloodEmergencyResponsesTable = pgTable("blood_emergency_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => bloodEmergencyRequestsTable.id, { onDelete: "cascade" }),
  donorId: uuid("donor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  response: donorResponseEnum("response").notNull(),
  contacted: boolean("contacted").notNull().default(false),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBloodDonorSchema = createInsertSchema(bloodDonorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBloodEmergencyRequestSchema = createInsertSchema(bloodEmergencyRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type BloodDonor = typeof bloodDonorsTable.$inferSelect;
export type BloodEmergencyRequest = typeof bloodEmergencyRequestsTable.$inferSelect;
export type FamilyGroup = typeof familyGroupsTable.$inferSelect;
