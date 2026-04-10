import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  decimal,
  integer,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const wearableConnectionsTable = pgTable("wearable_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scopes: text("scopes").array(),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const wearableDataTable = pgTable("wearable_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  steps: integer("steps"),
  heartRateAvg: integer("heart_rate_avg"),
  heartRateMin: integer("heart_rate_min"),
  heartRateMax: integer("heart_rate_max"),
  caloriesBurned: decimal("calories_burned", { precision: 7, scale: 2 }),
  sleepHours: decimal("sleep_hours", { precision: 3, scale: 1 }),
  bloodOxygen: decimal("blood_oxygen", { precision: 5, scale: 2 }),
  activeMinutes: integer("active_minutes"),
  distanceKm: decimal("distance_km", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offlineQueueTable = pgTable("offline_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  payload: text("payload").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const languagesTable = pgTable("languages", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameLocal: text("name_local").notNull(),
  direction: text("direction").notNull().default("ltr"),
  isActive: boolean("is_active").notNull().default(false),
  completionPct: integer("completion_pct").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const translationsTable = pgTable("translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  languageCode: text("language_code").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WearableConnection = typeof wearableConnectionsTable.$inferSelect;
export type WearableData = typeof wearableDataTable.$inferSelect;
export type OfflineQueue = typeof offlineQueueTable.$inferSelect;
export type Language = typeof languagesTable.$inferSelect;
