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
import { inputMethodEnum } from "./health-food";

export const exerciseIntensityEnum = pgEnum("exercise_intensity", ["light", "moderate", "intense"]);
export const medicineFrequencyEnum = pgEnum("medicine_frequency", ["daily", "alternate", "weekly", "custom"]);
export const medicineMealTimingEnum = pgEnum("medicine_meal_timing", ["before_meal", "after_meal", "with_meal", "anytime"]);
export const stressTypeEnum = pgEnum("stress_type", ["ppg", "mood", "five_pillar"]);
export const moodEnum = pgEnum("mood", ["happy", "neutral", "stressed", "sad"]);

export const exerciseLogsTable = pgTable("exercise_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  exerciseType: text("exercise_type").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  intensity: exerciseIntensityEnum("intensity").notNull().default("moderate"),
  caloriesBurned: decimal("calories_burned", { precision: 7, scale: 2 }),
  metValue: decimal("met_value", { precision: 4, scale: 2 }),
  inputMethod: inputMethodEnum("input_method").notNull().default("manual"),
  source: text("source").notNull().default("manual"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  isOfflineEntry: boolean("is_offline_entry").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waterLogsTable = pgTable("water_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  glassesCount: integer("glasses_count").notNull().default(1),
  mlAmount: integer("ml_amount").notNull().default(250),
  drinkType: text("drink_type").notNull().default("water"),
  isOfflineEntry: boolean("is_offline_entry").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicineSchedulesTable = pgTable("medicine_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  medicineName: text("medicine_name").notNull(),
  dosage: text("dosage"),
  doseCount: integer("dose_count").notNull().default(1),
  mealTiming: medicineMealTimingEnum("meal_timing").notNull().default("anytime"),
  frequency: medicineFrequencyEnum("frequency").notNull().default("daily"),
  customDays: text("custom_days").array(),
  reminderTimes: text("reminder_times").array().notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  refillAlertDays: integer("refill_alert_days").notNull().default(7),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const medicineLogsTable = pgTable("medicine_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  scheduleId: uuid("schedule_id").notNull().references(() => medicineSchedulesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  isOfflineEntry: boolean("is_offline_entry").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stressLogsTable = pgTable("stress_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  stressType: stressTypeEnum("stress_type").notNull(),
  stressScore: integer("stress_score").notNull(),
  mood: moodEnum("mood"),
  heartRateAvg: integer("heart_rate_avg"),
  hrvScore: decimal("hrv_score", { precision: 5, scale: 2 }),
  sleepHours: decimal("sleep_hours", { precision: 3, scale: 1 }),
  foodQualityScore: integer("food_quality_score"),
  exerciseMinutes: integer("exercise_minutes"),
  waterGlasses: integer("water_glasses"),
  medicineAdherence: decimal("medicine_adherence", { precision: 5, scale: 2 }),
  pillars: jsonb("pillars"),
  aiInsight: text("ai_insight"),
  isOfflineEntry: boolean("is_offline_entry").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const periodLogsTable = pgTable("period_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  cycleLength: integer("cycle_length"),
  symptoms: text("symptoms").array(),
  flow: text("flow"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const medicalReportsTable = pgTable("medical_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull(),
  reportDate: text("report_date"),
  labName: text("lab_name"),
  findings: jsonb("findings").notNull(),
  criticalValues: jsonb("critical_values"),
  aiAdvice: text("ai_advice"),
  dietRecommendations: text("diet_recommendations").array(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyHealthScoresTable = pgTable("daily_health_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  scoreDate: text("score_date").notNull(),
  healthScore: integer("health_score").notNull().default(0),
  dataConfidencePct: decimal("data_confidence_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  foodScore: integer("food_score").notNull().default(0),
  exerciseScore: integer("exercise_score").notNull().default(0),
  waterScore: integer("water_score").notNull().default(0),
  medicineScore: integer("medicine_score").notNull().default(0),
  sleepScore: integer("sleep_score").notNull().default(0),
  stressScore: integer("stress_score"),
  totalCaloriesIn: decimal("total_calories_in", { precision: 8, scale: 2 }),
  totalCaloriesOut: decimal("total_calories_out", { precision: 8, scale: 2 }),
  waterGlasses: integer("water_glasses").notNull().default(0),
  exerciseMinutes: integer("exercise_minutes").notNull().default(0),
  medicineAdherencePct: decimal("medicine_adherence_pct", { precision: 5, scale: 2 }),
  fieldsLogged: integer("fields_logged").notNull().default(0),
  totalPossibleFields: integer("total_possible_fields").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertExerciseLogSchema = createInsertSchema(exerciseLogsTable).omit({ id: true, createdAt: true });
export const insertWaterLogSchema = createInsertSchema(waterLogsTable).omit({ id: true, createdAt: true });
export const insertMedicineScheduleSchema = createInsertSchema(medicineSchedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMedicineLogSchema = createInsertSchema(medicineLogsTable).omit({ id: true, createdAt: true });
export const insertStressLogSchema = createInsertSchema(stressLogsTable).omit({ id: true, createdAt: true });

export type ExerciseLog = typeof exerciseLogsTable.$inferSelect;
export type WaterLog = typeof waterLogsTable.$inferSelect;
export type MedicineSchedule = typeof medicineSchedulesTable.$inferSelect;
export type MedicineLog = typeof medicineLogsTable.$inferSelect;
export type StressLog = typeof stressLogsTable.$inferSelect;
export type PeriodLog = typeof periodLogsTable.$inferSelect;
export type MedicalReport = typeof medicalReportsTable.$inferSelect;
export type DailyHealthScore = typeof dailyHealthScoresTable.$inferSelect;
