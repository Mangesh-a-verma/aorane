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
import { usersTable } from "./users";

export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack", "other"]);
export const inputMethodEnum = pgEnum("input_method", ["photo", "text", "voice", "wearable", "manual"]);

export const foodItemsTable = pgTable("food_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodNameEn: text("food_name_en").notNull(),
  foodNameLocal: jsonb("food_name_local"),
  category: text("category"),
  subcategory: text("subcategory"),
  cuisineType: text("cuisine_type"),
  countryCode: text("country_code").notNull().default("IN"),
  regionCode: text("region_code"),
  isGlobal: boolean("is_global").notNull().default(false),
  dietaryTags: text("dietary_tags").array(),
  calories: decimal("calories", { precision: 7, scale: 2 }).notNull(),
  proteinG: decimal("protein_g", { precision: 6, scale: 2 }),
  carbsG: decimal("carbs_g", { precision: 6, scale: 2 }),
  fatG: decimal("fat_g", { precision: 6, scale: 2 }),
  fiberG: decimal("fiber_g", { precision: 6, scale: 2 }),
  sugarG: decimal("sugar_g", { precision: 6, scale: 2 }),
  sodiumMg: decimal("sodium_mg", { precision: 7, scale: 2 }),
  potassiumMg: decimal("potassium_mg", { precision: 7, scale: 2 }),
  calciumMg: decimal("calcium_mg", { precision: 7, scale: 2 }),
  ironMg: decimal("iron_mg", { precision: 6, scale: 2 }),
  vitaminCMg: decimal("vitamin_c_mg", { precision: 6, scale: 2 }),
  vitaminDMcg: decimal("vitamin_d_mcg", { precision: 6, scale: 2 }),
  servingSizeG: decimal("serving_size_g", { precision: 6, scale: 2 }),
  servingDescription: text("serving_description"),
  barcode: text("barcode"),
  tags: text("tags").array(),
  isVerified: boolean("is_verified").notNull().default(false),
  addedByAdmin: boolean("added_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const foodScanCacheTable = pgTable("food_scan_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodNameEn: text("food_name_en").notNull().unique(),
  aiResult: jsonb("ai_result").notNull(),
  foodItemId: uuid("food_item_id").references(() => foodItemsTable.id),
  hitCount: integer("hit_count").notNull().default(1),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const foodLogsTable = pgTable("food_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  foodItemId: uuid("food_item_id").references(() => foodItemsTable.id),
  foodNameEn: text("food_name_en").notNull(),
  mealType: mealTypeEnum("meal_type").notNull(),
  inputMethod: inputMethodEnum("input_method").notNull().default("text"),
  quantityG: decimal("quantity_g", { precision: 7, scale: 2 }),
  quantityDescription: text("quantity_description"),
  calories: decimal("calories", { precision: 7, scale: 2 }).notNull(),
  proteinG: decimal("protein_g", { precision: 6, scale: 2 }),
  carbsG: decimal("carbs_g", { precision: 6, scale: 2 }),
  fatG: decimal("fat_g", { precision: 6, scale: 2 }),
  fiberG: decimal("fiber_g", { precision: 6, scale: 2 }),
  photoUrl: text("photo_url"),
  aiConfidence: decimal("ai_confidence", { precision: 5, scale: 2 }),
  isOfflineEntry: boolean("is_offline_entry").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFoodItemSchema = createInsertSchema(foodItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFoodLogSchema = createInsertSchema(foodLogsTable).omit({ id: true, createdAt: true });

export type FoodItem = typeof foodItemsTable.$inferSelect;
export type InsertFoodItem = z.infer<typeof insertFoodItemSchema>;
export type FoodLog = typeof foodLogsTable.$inferSelect;
export type InsertFoodLog = z.infer<typeof insertFoodLogSchema>;
