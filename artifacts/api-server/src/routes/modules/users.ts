import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";
import { getCumulativeActivePercent } from "../../lib/activityScore";

// ── AORANE ID Generation (12 chars, alphanumeric uppercase, immutable) ────────
// Format: [G][YY][CCC][XXXXXXX]
//   G       = Gender letter  (M=Male, F=Female, O=Other)
//   YY      = Last 2 digits of birth year (e.g. "98" for 1998)
//   CCC     = First 3 uppercase letters of city name (e.g. "MUM" for Mumbai)
//   XXXXXXX = 7 random chars from CAPS_ALPHANUM (no 0/O/I/1 to avoid confusion)
//   Total   = 1+2+3+7 = 13 → trimmed to 12 to stay exact
// Example: "M98MUM7K3XPQA" → "M98MUM7K3XPQ" (12 chars)
const CAPS_ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 safe chars
function generateAoraneId(gender: string | null, dateOfBirth: string | null, city: string | null): string {
  const gCode = gender === "male" ? "M" : gender === "female" ? "F" : "O";
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  const yearCode = dob && !isNaN(dob.getTime())
    ? String(dob.getFullYear()).slice(-2)
    : String(new Date().getFullYear()).slice(-2);
  const cityName = (city || "OTH").toUpperCase().replace(/[^A-Z]/g, "");
  const cityCode = (cityName + "OTH").slice(0, 3);
  const randomPart = Array.from({ length: 7 }, () =>
    CAPS_ALPHANUM[Math.floor(Math.random() * CAPS_ALPHANUM.length)]
  ).join("");
  return `${gCode}${yearCode}${cityCode}${randomPart}`.slice(0, 12); // exactly 12 chars
}

// ── Daily Active Percentage Calculation ───────────────────────────────────────
async function calculateActivePercent(userId: string) {
  return getCumulativeActivePercent(userId);
}

const router = Router();

router.get("/users/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.userId!;

    // Ensure rows exist for this user (safe — raw SQL bypasses Drizzle ORM for pooler compat)
    await pool.query(`INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [uid]).catch(() => {});
    await pool.query(`INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [uid]).catch(() => {});
    await pool.query(`INSERT INTO user_privacy_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [uid]).catch(() => {});

    const [profileRes, userRes, prefsRes, condRes, goalsRes] = await Promise.all([
      pool.query(`SELECT * FROM user_profiles WHERE user_id = $1`, [uid]),
      pool.query(`SELECT id, phone, email, plan, language_code, created_at FROM users WHERE id = $1`, [uid]),
      pool.query(`SELECT * FROM user_preferences WHERE user_id = $1`, [uid]),
      pool.query(`SELECT * FROM user_medical_conditions WHERE user_id = $1`, [uid]),
      pool.query(`SELECT * FROM user_health_goals WHERE user_id = $1`, [uid]),
    ]);

    res.json({
      profile: profileRes.rows[0] ?? null,
      user: userRes.rows[0] ? { plan: userRes.rows[0].plan, phone: userRes.rows[0].phone, email: userRes.rows[0].email } : null,
      preferences: prefsRes.rows[0] ?? null,
      conditions: condRes.rows,
      goals: goalsRes.rows[0] ?? null,
    });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const cause = (err as any)?.cause?.message || "";
    console.error("[PROFILE ERROR]", msg, cause);
    res.status(500).json({ error: "Failed to fetch profile", detail: msg });
  }
});

router.patch("/users/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      fullName, dateOfBirth, gender, heightCm, weightKg, bloodGroup,
      foodPreference, foodAllergies, workProfile, activityLevel,
      exerciseFrequency, exerciseTypes, sleepHoursAvg, wakeTime,
      sleepTime, stressLevelSelf, profilePhotoUrl, city, state,
    } = req.body as Record<string, unknown>;

    const bmi = heightCm && weightKg
      ? Number((Number(weightKg) / Math.pow(Number(heightCm) / 100, 2)).toFixed(1))
      : undefined;

    // Build SET clause dynamically — raw SQL to bypass Drizzle ORM Transaction Pooler issues
    const fields: string[] = [];
    const vals: unknown[]  = [];
    let   idx              = 1;
    const set = (col: string, val: unknown) => { fields.push(`${col}=$${idx++}`); vals.push(val); };

    if (fullName          !== undefined) set("full_name",         fullName);
    if (dateOfBirth       !== undefined) set("date_of_birth",     dateOfBirth);
    if (gender            !== undefined) set("gender",            gender);
    if (heightCm          !== undefined) set("height_cm",         String(heightCm));
    if (weightKg          !== undefined) set("weight_kg",         String(weightKg));
    if (bmi               !== undefined) set("bmi",               String(bmi));
    if (bloodGroup        !== undefined) set("blood_group",       bloodGroup);
    if (foodPreference    !== undefined) set("food_preference",   foodPreference);
    if (foodAllergies     !== undefined) set("food_allergies",    JSON.stringify(foodAllergies));
    if (workProfile       !== undefined) set("work_profile",      workProfile);
    if (activityLevel     !== undefined) set("activity_level",    activityLevel);
    if (exerciseFrequency !== undefined) set("exercise_frequency",exerciseFrequency);
    if (exerciseTypes     !== undefined) set("exercise_types",    JSON.stringify(exerciseTypes));
    if (sleepHoursAvg     !== undefined) set("sleep_hours_avg",   String(sleepHoursAvg));
    if (wakeTime          !== undefined) set("wake_time",         wakeTime);
    if (sleepTime         !== undefined) set("sleep_time",        sleepTime);
    if (stressLevelSelf   !== undefined) set("stress_level_self", stressLevelSelf);
    if (profilePhotoUrl   !== undefined) set("profile_photo_url", profilePhotoUrl);
    if (city              !== undefined) set("city",              city);
    if (state             !== undefined) set("state",             state);

    if (fields.length === 0) { res.json({ profile: null }); return; }

    // UPSERT: create row if missing, else update existing fields
    const colNames = fields.map((f) => f.split("=")[0]);
    const colPlaceholders = colNames.map((_, i) => `$${i + 1}`).join(",");
    const setClause = fields.join(",");
    vals.push(req.userId!);
    const result = await pool.query(
      `INSERT INTO user_profiles (user_id,${colNames.join(",")}) VALUES ($${idx},${colPlaceholders})
       ON CONFLICT (user_id) DO UPDATE SET ${setClause} RETURNING *`,
      vals
    );
    res.json({ profile: result.rows[0] ?? null });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    res.status(500).json({ error: "Failed to update profile", detail: msg });
  }
});

router.patch("/users/onboarding/step", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { step } = req.body as { step: number };
    await pool.query(`UPDATE user_profiles SET onboarding_step=$1 WHERE user_id=$2`, [step, req.userId!]);
    res.json({ success: true, step });
  } catch (e) {
    res.status(500).json({ error: "Failed to update onboarding step" });
  }
});

router.post("/users/medical-conditions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { conditions } = req.body as { conditions: Array<{ condition: string; conditionType?: string }> };
    await pool.query(`DELETE FROM user_medical_conditions WHERE user_id=$1`, [req.userId!]);
    if (conditions?.length) {
      for (const c of conditions) {
        await pool.query(
          `INSERT INTO user_medical_conditions (user_id, condition, condition_type) VALUES ($1,$2,$3)`,
          [req.userId!, c.condition, c.conditionType || "chronic"]
        );
      }
    }
    const saved = await pool.query(`SELECT * FROM user_medical_conditions WHERE user_id=$1`, [req.userId!]);
    res.json({ conditions: saved.rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to save conditions" });
  }
});

router.post("/users/health-goals", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { primaryGoal, currentWeightKg, targetWeightKg, targetDate, secondaryGoals } = req.body as {
      primaryGoal: string; currentWeightKg?: number; targetWeightKg?: number; targetDate?: string; secondaryGoals?: string[];
    };
    const result = await pool.query(
      `INSERT INTO user_health_goals (user_id, primary_goal, current_weight_kg, target_weight_kg, target_date, secondary_goals)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET
         primary_goal=$2, current_weight_kg=$3, target_weight_kg=$4, target_date=$5, secondary_goals=$6
       RETURNING *`,
      [req.userId!, primaryGoal,
       currentWeightKg ? String(currentWeightKg) : null,
       targetWeightKg  ? String(targetWeightKg)  : null,
       targetDate || null,
       secondaryGoals ? JSON.stringify(secondaryGoals) : null]
    );
    res.json({ goals: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "Failed to save goals" });
  }
});

router.get("/users/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const r = await pool.query(`SELECT * FROM user_preferences WHERE user_id=$1`, [req.userId!]);
    res.json({ preferences: r.rows[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.patch("/users/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const colMap: Record<string, string> = {
      languageCode: "language_code", darkMode: "dark_mode",
      waterGoalGlasses: "water_goal_glasses", calorieGoal: "calorie_goal",
      notificationsEnabled: "notifications_enabled", medicineReminders: "medicine_reminders",
      waterReminders: "water_reminders", weeklyReportEmail: "weekly_report_email",
      appLockEnabled: "app_lock_enabled", appLockMethod: "app_lock_method", adsEnabled: "ads_enabled",
    };
    const fields: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [jsKey, col] of Object.entries(colMap)) {
      if (Object.prototype.hasOwnProperty.call(req.body, jsKey) && req.body[jsKey] !== undefined) {
        fields.push(`${col}=$${idx++}`); vals.push(req.body[jsKey]);
      }
    }
    if (fields.length === 0) { res.json({ preferences: null }); return; }
    vals.push(req.userId!);
    const result = await pool.query(`UPDATE user_preferences SET ${fields.join(",")} WHERE user_id=$${idx} RETURNING *`, vals);
    res.json({ preferences: result.rows[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

router.get("/users/privacy", requireAuth, async (req: AuthRequest, res) => {
  try {
    const r = await pool.query(`SELECT * FROM user_privacy_settings WHERE user_id=$1`, [req.userId!]);
    res.json({ privacy: r.rows[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch privacy settings" });
  }
});

router.patch("/users/privacy", requireAuth, async (req: AuthRequest, res) => {
  try {
    const colMap: Record<string, string> = {
      shareBasicProfile: "share_basic_profile", shareBmi: "share_bmi",
      shareExerciseData: "share_exercise_data", shareWaterIntake: "share_water_intake",
      shareSleepData: "share_sleep_data", shareStressLevel: "share_stress_level",
      shareMedicineDetails: "share_medicine_details", shareMedicalConditions: "share_medical_conditions",
      shareFoodData: "share_food_data",
    };
    const fields: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [jsKey, col] of Object.entries(colMap)) {
      if (Object.prototype.hasOwnProperty.call(req.body, jsKey) && req.body[jsKey] !== undefined) {
        fields.push(`${col}=$${idx++}`); vals.push(req.body[jsKey]);
      }
    }
    if (fields.length === 0) { res.json({ privacy: null }); return; }
    vals.push(req.userId!);
    const result = await pool.query(`UPDATE user_privacy_settings SET ${fields.join(",")} WHERE user_id=$${idx} RETURNING *`, vals);
    res.json({ privacy: result.rows[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: "Failed to update privacy settings" });
  }
});

// ─── Health Scorecard — stores AORANE ID on first generation (immutable) ─────
router.get("/users/scorecard", requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.userId!;
    const [userRes, profileRes] = await Promise.all([
      pool.query(`SELECT id, plan, created_at FROM users WHERE id=$1`, [uid]),
      pool.query(`SELECT * FROM user_profiles WHERE user_id=$1`, [uid]),
    ]);
    const user    = userRes.rows[0] ?? null;
    const profile = profileRes.rows[0] ?? null;

    // Generate and save AORANE ID if missing
    let aoraneId = profile?.aorane_id ? (profile.aorane_id as string).toUpperCase() : null;
    if (!aoraneId) {
      let generated = "";
      for (let i = 0; i < 5; i++) {
        generated = generateAoraneId(profile?.gender || null, profile?.date_of_birth || null, profile?.city || null);
        try {
          await pool.query(`UPDATE user_profiles SET aorane_id=$1 WHERE user_id=$2 AND aorane_id IS NULL`, [generated, uid]);
          aoraneId = generated;
          break;
        } catch { /* collision — retry */ }
      }
      if (!aoraneId) aoraneId = generated;
    }

    const bmi = profile?.bmi || null;
    let bmiCategory = "Normal";
    if (bmi) {
      const b = Number(bmi);
      if (b < 18.5) bmiCategory = "Underweight";
      else if (b < 25) bmiCategory = "Normal";
      else if (b < 30) bmiCategory = "Overweight";
      else bmiCategory = "Obese";
    }
    const age = profile?.date_of_birth
      ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (86400000 * 365.25))
      : null;

    const activeData = await calculateActivePercent(uid).catch(() => ({
      pct: 0, todayPct: 0, weekPct: 0, daysTracked: 0, trend: "stable" as const,
    }));

    res.json({
      aoraneId,
      name: profile?.full_name || "Aorane User",
      bloodGroup: profile?.blood_group || "Unknown",
      bmi: bmi || "N/A",
      bmiCategory,
      plan: user?.plan || "free",
      gender: profile?.gender || "other",
      age,
      city: profile?.city || null,
      state: profile?.state || null,
      workProfile: profile?.work_profile || null,
      memberSince: user?.created_at,
      qrData: JSON.stringify({ aoraneId, name: profile?.full_name, bloodGroup: profile?.blood_group }),
      activePercent: {
        overall: activeData.pct,
        todayPct: activeData.todayPct,
        weekPct: activeData.weekPct,
        daysTracked: activeData.daysTracked,
        trend: activeData.trend,
      },
      healthScore: activeData.pct,
    });
  } catch (e) {
    console.error("[SCORECARD ERROR]", (e as Error).message);
    res.status(500).json({ error: "Failed to fetch scorecard" });
  }
});

// ─── Daily Active Percentage ──────────────────────────────────────────────────
router.get("/users/activity-score", requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getCumulativeActivePercent(req.userId!);
    res.json({
      overall: result.pct,
      pct: result.pct,
      todayPct: result.todayPct,
      weekPct: result.weekPct,
      daysTracked: result.daysTracked,
      trend: result.trend,
      label: getActiveLabel(result.pct),
    });
  } catch {
    res.status(500).json({ error: "Failed to calculate activity score" });
  }
});

function getActiveLabel(pct: number): string {
  if (pct >= 90) return "Excellent 🌟";
  if (pct >= 70) return "Good 👍";
  if (pct >= 50) return "Average 📊";
  if (pct >= 30) return "Low ⚡";
  return "Inactive 😴";
}

// ─── Search user by AORANE ID (for Admin + Business Portal) ──────────────────
// Also supports search by name/phone for admin
router.get("/users/search", requireAuth, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 4) { res.status(400).json({ error: "Minimum 4 characters required" }); return; }

    const isAoraneId = /^\d{12}$/.test(q);

    let profileRows: Record<string, unknown>[] = [];
    if (isAoraneId) {
      const r = await pool.query(
        `SELECT up.*, u.plan, u.phone FROM user_profiles up JOIN users u ON u.id = up.user_id WHERE up.aorane_id = $1 LIMIT 5`,
        [q]
      );
      profileRows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT up.*, u.plan, u.phone FROM user_profiles up JOIN users u ON u.id = up.user_id WHERE LOWER(up.full_name) LIKE $1 LIMIT 10`,
        [`%${q.toLowerCase()}%`]
      );
      profileRows = r.rows;
    }

    const results = await Promise.all(profileRows.map(async (p) => {
      const activeData = await getCumulativeActivePercent(String(p.user_id)).catch(() => ({ pct: 0, todayPct: 0, weekPct: 0, daysTracked: 0, trend: "stable" as const }));
      const dob = p.date_of_birth as string | null;
      const rawPhone = String(p.phone || "");
      const maskedPhone = rawPhone.length >= 10
        ? rawPhone.slice(0, 2) + "******" + rawPhone.slice(-2)
        : undefined;
      return {
        userId: p.user_id,
        aoraneId: p.aorane_id,
        name: p.full_name,
        bloodGroup: p.blood_group,
        gender: p.gender,
        age: dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (86400000 * 365.25)) : null,
        city: p.city,
        state: p.state,
        bmi: p.bmi,
        plan: p.plan,
        phone: maskedPhone,
        activePercent: activeData.pct,
      };
    }));

    res.json({ results, count: results.length, query: q });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
