import { pool } from "@workspace/db";
import { logger } from "./logger";

// Safe startup migration — adds any missing columns using IF NOT EXISTS
// Run once at server startup; safe to re-run multiple times
export async function runStartupMigrations(): Promise<void> {
  const migrations: string[] = [
    // user_profiles missing columns
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS city TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS state TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS aorane_id TEXT UNIQUE`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS food_allergies TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exercise_types TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_profile TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sleep_hours_avg NUMERIC(3,1)`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wake_time TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sleep_time TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stress_level_self TEXT`,
    `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exercise_frequency TEXT`,

    // user_preferences missing columns
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS calorie_goal INTEGER`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS period_reminders BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS suggestion_notifications BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS water_reminder_times TEXT DEFAULT '09:00,13:00,18:00,21:00'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS food_reminder_time TEXT DEFAULT '07:30,12:30,19:30'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS medicine_reminder_time TEXT DEFAULT '08:00,14:00,21:00'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS wake_up_time TEXT DEFAULT '07:00'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS bed_time TEXT DEFAULT '22:30'`,

    // user_health_goals unique constraint
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='user_health_goals_user_id_key'
        AND conrelid='user_health_goals'::regclass
      ) THEN
        ALTER TABLE user_health_goals ADD CONSTRAINT user_health_goals_user_id_key UNIQUE (user_id);
      END IF;
    END $$`,

    // exercise_logs missing columns (met_value, input_method, notes may not exist in older DBs)
    `ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS met_value NUMERIC(5,2)`,
    `ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS input_method TEXT DEFAULT 'manual'`,
    `ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS notes TEXT`,

    // daily_health_scores table (if not exists)
    `CREATE TABLE IF NOT EXISTS daily_health_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score_date TEXT NOT NULL,
      health_score INTEGER NOT NULL DEFAULT 0,
      data_confidence_pct TEXT,
      food_score INTEGER NOT NULL DEFAULT 0,
      exercise_score INTEGER NOT NULL DEFAULT 0,
      water_score INTEGER NOT NULL DEFAULT 0,
      medicine_score INTEGER NOT NULL DEFAULT 0,
      total_calories_in TEXT,
      water_glasses INTEGER DEFAULT 0,
      exercise_minutes INTEGER DEFAULT 0,
      fields_logged INTEGER DEFAULT 0,
      total_possible_fields INTEGER DEFAULT 3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, score_date)
    )`,
  ];

  let ok = 0; let fail = 0;
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      ok++;
    } catch (e) {
      fail++;
      logger.warn({ sql: sql.slice(0, 80), err: (e as Error).message }, "Migration skipped");
    }
  }
  logger.info({ ok, fail, total: migrations.length }, "Startup migrations complete");
}
