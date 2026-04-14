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

    // ── food_items table (needed for food scan + food logs) ──────────────────
    `CREATE TABLE IF NOT EXISTS food_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      food_name_en TEXT NOT NULL,
      food_name_local JSONB,
      category TEXT,
      subcategory TEXT,
      cuisine_type TEXT,
      country_code TEXT NOT NULL DEFAULT 'IN',
      region_code TEXT,
      is_global BOOLEAN NOT NULL DEFAULT FALSE,
      dietary_tags TEXT[],
      calories NUMERIC(7,2) NOT NULL,
      protein_g NUMERIC(6,2),
      carbs_g NUMERIC(6,2),
      fat_g NUMERIC(6,2),
      fiber_g NUMERIC(6,2),
      sugar_g NUMERIC(6,2),
      sodium_mg NUMERIC(7,2),
      potassium_mg NUMERIC(7,2),
      calcium_mg NUMERIC(7,2),
      iron_mg NUMERIC(6,2),
      vitamin_c_mg NUMERIC(6,2),
      vitamin_d_mcg NUMERIC(6,2),
      serving_size_g NUMERIC(6,2),
      serving_description TEXT,
      barcode TEXT,
      tags TEXT[],
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      added_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── food_scan_cache table (AI scan cache to save tokens) ─────────────────
    `CREATE TABLE IF NOT EXISTS food_scan_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      food_name_en TEXT NOT NULL UNIQUE,
      ai_result JSONB NOT NULL,
      food_item_id UUID REFERENCES food_items(id),
      hit_count INTEGER NOT NULL DEFAULT 1,
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── Add food_item_id FK to food_logs if missing ──────────────────────────
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS food_item_id UUID REFERENCES food_items(id)`,
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS photo_url TEXT`,
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,2)`,
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS is_offline_entry BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ`,
    `ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS quantity_description TEXT`,

    // ── Safe enum creation (DO $$ pattern prevents error if enum already exists) ──
    `DO $$ BEGIN CREATE TYPE stress_type AS ENUM ('ppg','mood','five_pillar'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE mood_type AS ENUM ('happy','neutral','stressed','sad'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','success','failed','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('active','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`,

    // ── stress_logs table ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS stress_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stress_type TEXT NOT NULL,
      stress_score INTEGER NOT NULL,
      mood TEXT,
      heart_rate_avg INTEGER,
      hrv_score NUMERIC(5,2),
      sleep_hours NUMERIC(3,1),
      food_quality_score INTEGER,
      exercise_minutes INTEGER,
      water_glasses INTEGER,
      medicine_adherence NUMERIC(5,2),
      pillars JSONB,
      ai_insight TEXT,
      is_offline_entry BOOLEAN NOT NULL DEFAULT FALSE,
      synced_at TIMESTAMPTZ,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── period_logs table ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS period_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT,
      cycle_length INTEGER,
      symptoms TEXT[],
      flow TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── medical_reports table ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS medical_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      report_date TEXT,
      lab_name TEXT,
      findings JSONB NOT NULL DEFAULT '{}',
      critical_values JSONB,
      ai_advice TEXT,
      diet_recommendations TEXT[],
      analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── family_groups table ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS family_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_code TEXT NOT NULL UNIQUE,
      max_members INTEGER NOT NULL DEFAULT 4,
      plan_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── family_members table ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS family_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── subscriptions table ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'razorpay',
      seats INTEGER NOT NULL DEFAULT 1,
      amount_paid NUMERIC(10,2),
      discount_pct INTEGER NOT NULL DEFAULT 0,
      promo_code_used TEXT,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── payments table ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      subscription_id UUID REFERENCES subscriptions(id),
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'pending',
      plan TEXT NOT NULL,
      seats INTEGER NOT NULL DEFAULT 1,
      gateway_fee NUMERIC(8,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── promo_codes table ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS promo_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      discount_pct INTEGER NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      applicable_plans TEXT[],
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_lifetime_upgrade BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── plan_pricing table ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS plan_pricing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'individual',
      monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      yearly_price NUMERIC(10,2),
      max_seats INTEGER,
      features JSONB NOT NULL DEFAULT '[]',
      badge_text TEXT,
      badge_color TEXT DEFAULT '#0077B6',
      gradient_colors JSONB,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // ── Seed plan_pricing with default plans ─────────────────────────────────
    `INSERT INTO plan_pricing (plan_key, display_name, type, monthly_price, yearly_price, max_seats, features, badge_text, badge_color, sort_order)
     VALUES
       ('free',   'Free',       'individual', 0,    null, 1, '["Basic health tracking","Food & water logs","Exercise logging"]', null, '#6B7280', 0),
       ('pro',    'Pro',        'individual', 199,  1999, 1, '["Everything in Free","AI food scan","Health score","Medicine tracker","Stress tracking","Period tracker"]', 'Most Popular', '#0077B6', 1),
       ('max',    'Max',        'individual', 399,  3999, 1, '["Everything in Pro","Family group (4 members)","Blood donation","Wearable sync","Priority support"]', 'Best Value', '#7C3AED', 2),
       ('family', 'Family',     'family',     599,  5999, 6, '["6 family members","All Max features","Family health dashboard","Shared insights"]', 'For Families', '#DC2626', 3)
     ON CONFLICT (plan_key) DO NOTHING`,

    // ── blood_donors table (community feature) ────────────────────────────────
    `CREATE TABLE IF NOT EXISTS blood_donors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      blood_group TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'IN',
      lat TEXT,
      lng TEXT,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      last_donated_at TEXT,
      next_eligible_at TEXT,
      donation_count INTEGER NOT NULL DEFAULT 0,
      badges TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

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
