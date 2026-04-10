import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  decimal,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planEnum = pgEnum("plan", ["free", "max", "pro", "family"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);
export const foodPrefEnum = pgEnum("food_preference", ["veg", "nonveg", "eggetarian", "vegan", "jain"]);
export const activityLevelEnum = pgEnum("activity_level", ["sedentary", "light", "moderate", "very", "athlete"]);
export const authProviderEnum = pgEnum("auth_provider", ["mobile", "google", "facebook", "x"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  plan: planEnum("plan").notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  isBanned: boolean("is_banned").notNull().default(false),
  countryCode: text("country_code").notNull().default("IN"),
  languageCode: text("language_code").notNull().default("hi"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currencyCode: text("currency_code").notNull().default("INR"),
  referralCode: text("referral_code").unique(),
  referredBy: uuid("referred_by"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userAuthProvidersTable = pgTable("user_auth_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: authProviderEnum("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  email: text("email"),
  isPrimary: boolean("is_primary").notNull().default(false),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userProfilesTable = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  dateOfBirth: text("date_of_birth"),
  gender: genderEnum("gender"),
  profilePhotoUrl: text("profile_photo_url"),
  heightCm: decimal("height_cm", { precision: 5, scale: 2 }),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  bmi: decimal("bmi", { precision: 5, scale: 2 }),
  bloodGroup: text("blood_group"),
  foodPreference: foodPrefEnum("food_preference"),
  foodAllergies: text("food_allergies").array(),
  workProfile: text("work_profile"),
  activityLevel: activityLevelEnum("activity_level"),
  exerciseFrequency: text("exercise_frequency"),
  exerciseTypes: text("exercise_types").array(),
  sleepHoursAvg: decimal("sleep_hours_avg", { precision: 3, scale: 1 }),
  wakeTime: text("wake_time"),
  sleepTime: text("sleep_time"),
  stressLevelSelf: text("stress_level_self"),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userMedicalConditionsTable = pgTable("user_medical_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  condition: text("condition").notNull(),
  conditionType: text("condition_type"),
  diagnosedAt: text("diagnosed_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userHealthGoalsTable = pgTable("user_health_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  primaryGoal: text("primary_goal").notNull(),
  currentWeightKg: decimal("current_weight_kg", { precision: 5, scale: 2 }),
  targetWeightKg: decimal("target_weight_kg", { precision: 5, scale: 2 }),
  targetDate: text("target_date"),
  secondaryGoals: text("secondary_goals").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userPreferencesTable = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  languageCode: text("language_code").notNull().default("hi"),
  darkMode: boolean("dark_mode").notNull().default(false),
  waterGoalGlasses: integer("water_goal_glasses").notNull().default(8),
  calorieGoal: integer("calorie_goal"),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  medicineReminders: boolean("medicine_reminders").notNull().default(true),
  waterReminders: boolean("water_reminders").notNull().default(true),
  weeklyReportEmail: boolean("weekly_report_email").notNull().default(false),
  appLockEnabled: boolean("app_lock_enabled").notNull().default(false),
  appLockMethod: text("app_lock_method"),
  pinHash: text("pin_hash"),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(5),
  adsEnabled: boolean("ads_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userPrivacySettingsTable = pgTable("user_privacy_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  shareBasicProfile: boolean("share_basic_profile").notNull().default(true),
  shareBmi: boolean("share_bmi").notNull().default(true),
  shareExerciseData: boolean("share_exercise_data").notNull().default(true),
  shareWaterIntake: boolean("share_water_intake").notNull().default(true),
  shareSleepData: boolean("share_sleep_data").notNull().default(false),
  shareStressLevel: boolean("share_stress_level").notNull().default(false),
  shareMedicineDetails: boolean("share_medicine_details").notNull().default(false),
  shareMedicalConditions: boolean("share_medical_conditions").notNull().default(false),
  shareFoodData: boolean("share_food_data").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserPreferencesSchema = createInsertSchema(userPreferencesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;
export type UserPrivacySettings = typeof userPrivacySettingsTable.$inferSelect;
