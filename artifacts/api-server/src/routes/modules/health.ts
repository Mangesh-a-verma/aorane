import { Router } from "express";
import { upsertDailyActivityScore } from "../../lib/activityScore";
import { getCumulativeActivePercent } from "../../lib/activityScore";
import { pool } from "@workspace/db";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";
import { computeScientificScore } from "../../lib/scoring";

const router = Router();

// ─────────────────────────────────────────────────────────
// MET values for each exercise (per kg per hour)
// ─────────────────────────────────────────────────────────
const MET_VALUES: Record<string, { light: number; moderate: number; intense: number }> = {
  // ── Cardio ────────────────────────────────────────────────────────────────
  "Walking":            { light: 2.5,  moderate: 3.5,  intense: 4.5  },
  "Running":            { light: 7.0,  moderate: 9.8,  intense: 13.5 },
  "Cycling":            { light: 4.0,  moderate: 7.5,  intense: 10.0 },
  "Swimming":           { light: 5.0,  moderate: 8.0,  intense: 11.0 },
  "Skipping":           { light: 8.0,  moderate: 11.0, intense: 13.5 },
  "HIIT":               { light: 7.0,  moderate: 10.0, intense: 14.0 },
  "Treadmill":          { light: 3.5,  moderate: 7.0,  intense: 10.0 },
  "Elliptical":         { light: 4.5,  moderate: 7.0,  intense: 9.5  },
  "Rowing":             { light: 4.5,  moderate: 7.0,  intense: 10.0 },
  "Stair Climbing":     { light: 4.0,  moderate: 7.5,  intense: 10.0 },
  // ── Strength / Gym ────────────────────────────────────────────────────────
  "Weight Training":    { light: 3.0,  moderate: 5.0,  intense: 7.0  },
  "Bench Press":        { light: 3.0,  moderate: 4.5,  intense: 6.0  },
  "Squats":             { light: 3.5,  moderate: 5.0,  intense: 7.0  },
  "Deadlifts":          { light: 4.0,  moderate: 5.5,  intense: 7.5  },
  "Shoulder Press":     { light: 3.0,  moderate: 4.5,  intense: 6.0  },
  "Bicep Curls":        { light: 2.5,  moderate: 3.5,  intense: 5.0  },
  "Pull-ups":           { light: 4.0,  moderate: 6.0,  intense: 8.5  },
  "Push-ups":           { light: 3.5,  moderate: 5.0,  intense: 7.0  },
  "Lunges":             { light: 3.0,  moderate: 4.5,  intense: 6.0  },
  "Plank":              { light: 2.5,  moderate: 3.5,  intense: 4.5  },
  "Leg Press":          { light: 3.0,  moderate: 4.5,  intense: 6.5  },
  "Lat Pulldown":       { light: 3.0,  moderate: 4.5,  intense: 6.0  },
  "Cable Rows":         { light: 3.0,  moderate: 4.5,  intense: 6.0  },
  "Tricep Dips":        { light: 3.0,  moderate: 4.5,  intense: 6.5  },
  // ── Yoga / Flexibility ────────────────────────────────────────────────────
  "Yoga":               { light: 2.0,  moderate: 2.5,  intense: 4.0  },
  "Pilates":            { light: 2.5,  moderate: 3.5,  intense: 5.0  },
  "Surya Namaskar":     { light: 3.5,  moderate: 5.0,  intense: 7.0  },
  // ── Dance / Group ─────────────────────────────────────────────────────────
  "Dancing":            { light: 3.0,  moderate: 4.5,  intense: 7.0  },
  "Zumba":              { light: 4.0,  moderate: 6.0,  intense: 8.0  },
  // ── Sports ────────────────────────────────────────────────────────────────
  "Cricket":            { light: 3.5,  moderate: 5.0,  intense: 7.0  },
  "Badminton":          { light: 4.0,  moderate: 5.5,  intense: 7.5  },
  "Football":           { light: 5.0,  moderate: 7.0,  intense: 10.0 },
  "Basketball":         { light: 4.5,  moderate: 6.5,  intense: 9.0  },
  "Volleyball":         { light: 3.0,  moderate: 4.5,  intense: 6.5  },
  "Climbing":           { light: 5.0,  moderate: 7.5,  intense: 11.0 },
};

function calculateCalories(
  exerciseType: string,
  durationMinutes: number,
  intensity: "light" | "moderate" | "intense",
  weightKg: number,
  gender: string,
): { calories: number; met: number } {
  const metMap = MET_VALUES[exerciseType] || { light: 3.0, moderate: 5.0, intense: 7.0 };
  let met = metMap[intensity] || metMap.moderate;

  // Gender correction factor: women burn ~10-15% fewer calories at same intensity
  const genderFactor = gender === "female" ? 0.9 : 1.0;

  // Formula: Calories = MET × weight(kg) × duration(hours) × gender_factor
  const durationHours = durationMinutes / 60;
  const calories = Math.round(met * weightKg * durationHours * genderFactor);

  return { calories, met };
}

// ─────────────────────────────────────────────────────────
// Calculate calorie burn estimate
// ─────────────────────────────────────────────────────────
router.post("/health/exercise/calculate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const exerciseType = (body.exerciseType as string) || "walking";
    // Accept both durationMinutes and durationMin (mobile alias)
    const durationMinutes = Number(body.durationMinutes ?? body.durationMin ?? 30);
    const intensity = (body.intensity as string) || "moderate";

    if (!exerciseType) {
      res.status(400).json({ error: "exerciseType is required" });
      return;
    }
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      res.status(400).json({ error: "durationMinutes must be a positive number" });
      return;
    }

    const profRes = await pool.query(`SELECT weight_kg, gender FROM user_profiles WHERE user_id=$1`, [req.userId!]);
    const profileWeight = profRes.rows[0]?.weight_kg ? Number(profRes.rows[0].weight_kg) : null;
    const weightKg = profileWeight && !isNaN(profileWeight) && profileWeight > 0 ? profileWeight : 70;
    const isDefaultWeight = !profileWeight;
    const gender = profRes.rows[0]?.gender || "male";

    const { calories, met } = calculateCalories(
      exerciseType, durationMinutes,
      intensity as "light" | "moderate" | "intense",
      weightKg, gender,
    );
    const safeCalories = isNaN(calories) || calories < 0 ? 0 : calories;
    res.json({
      exerciseType, durationMinutes, intensity, weightKg, gender,
      metValue: met, caloriesBurned: safeCalories,
      isDefaultWeight,
      formula: `MET(${met}) × ${weightKg}kg × ${(durationMinutes/60).toFixed(2)}h × gender(${gender === "female" ? "0.9" : "1.0"}) = ${safeCalories} kcal`,
    });
  } catch (e) {
    res.status(500).json({ error: "Calculation failed", detail: (e as Error).message });
  }
});

router.post("/health/exercise", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { exerciseType, durationMinutes, intensity, caloriesBurned, inputMethod, notes, sets, reps, steps } = req.body as Record<string, unknown>;

    const profRes = await pool.query(`SELECT weight_kg, gender FROM user_profiles WHERE user_id=$1`, [req.userId!]);
    const weightKg = Number(profRes.rows[0]?.weight_kg || 70);
    const gender = profRes.rows[0]?.gender || "male";

    let finalCalories: number;
    let finalMet: number;

    if (caloriesBurned) {
      finalCalories = Number(caloriesBurned);
      finalMet = MET_VALUES[exerciseType as string]?.moderate || 5.0;
    } else {
      const calc = calculateCalories(
        exerciseType as string, Number(durationMinutes),
        (intensity as "light" | "moderate" | "intense") || "moderate",
        weightKg, gender,
      );
      finalCalories = calc.calories;
      finalMet = calc.met;
    }

    const result = await pool.query(
      `INSERT INTO exercise_logs (user_id, exercise_type, duration_minutes, intensity, sets, reps, steps, calories_burned, met_value, input_method, notes, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *`,
      [req.userId!, exerciseType, Number(durationMinutes), intensity || "moderate",
       sets ? Number(sets) : null, reps ? Number(reps) : null, steps ? Number(steps) : null,
       String(finalCalories), String(finalMet), inputMethod || "manual", notes || null]
    );
    upsertDailyActivityScore(req.userId!).catch(() => {});
    res.status(201).json({
      log: result.rows[0],
      calculation: { weightKg, gender, metValue: finalMet, caloriesBurned: finalCalories },
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to log exercise", detail: (e as Error).message });
  }
});

router.get("/health/exercise", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query as { date?: string };
    let query = `SELECT * FROM exercise_logs WHERE user_id=$1`;
    const params: unknown[] = [req.userId!];
    if (date) {
      query += ` AND logged_at >= $2 AND logged_at <= $3`;
      params.push(date + "T00:00:00Z", date + "T23:59:59Z");
    }
    query += ` ORDER BY logged_at DESC`;
    const result = await pool.query(query, params);
    // Map snake_case DB columns → camelCase for mobile client
    const logs = result.rows.map((r: Record<string, unknown>) => ({
      id:              r.id,
      userId:          r.user_id,
      exerciseType:    r.exercise_type,
      durationMinutes: r.duration_minutes,
      intensity:       r.intensity,
      sets:            r.sets,
      reps:            r.reps,
      steps:           r.steps,
      caloriesBurned:  r.calories_burned,
      metValue:        r.met_value,
      inputMethod:     r.input_method,
      notes:           r.notes,
      photoUrl:        r.photo_url,
      loggedAt:        r.logged_at,
    }));
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch exercise logs", detail: (e as Error).message });
  }
});

router.post("/health/water", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { glassesCount = 1, mlAmount = 250, drinkType = "water" } = req.body as Record<string, unknown>;
    if (Number(mlAmount) <= 0) {
      res.status(400).json({ error: "Water amount must be greater than 0ml" });
      return;
    }
    const result = await pool.query(
      `INSERT INTO water_logs (user_id, glasses_count, ml_amount, drink_type, logged_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [req.userId!, Number(glassesCount), Number(mlAmount), drinkType]
    );
    upsertDailyActivityScore(req.userId!).catch(() => {});
    res.status(201).json({ log: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "Failed to log water", detail: (e as Error).message });
  }
});

router.get("/health/water/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const logsRes = await pool.query(
      `SELECT * FROM water_logs WHERE user_id=$1 AND logged_at >= $2 AND logged_at <= $3 ORDER BY logged_at`,
      [req.userId!, date + "T00:00:00Z", date + "T23:59:59Z"]
    );
    const prefsRes = await pool.query(`SELECT water_goal_glasses FROM user_preferences WHERE user_id=$1`, [req.userId!]);
    const logs = logsRes.rows;
    const total = logs.reduce((sum: number, l: any) => sum + (l.glasses_count || 0), 0);
    const goal = prefsRes.rows[0]?.water_goal_glasses || 8;
    res.json({ logs, totalGlasses: total, goal });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch water logs", detail: (e as Error).message });
  }
});

router.get("/health/score/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    let date = String(req.params.date);
    // IST auto-correction: old APK sends UTC date via toISOString().slice(0,10)
    // Between 00:00–05:30 IST, UTC date is 1 day behind the actual IST date.
    // If client sent "yesterday" in IST, silently correct to today's IST date.
    const nowIST  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const prevIST = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (date === prevIST) date = nowIST;
    const score = await computeDailyScore(req.userId!, date);
    res.json({ score });
  } catch (e) {
    // Return safe default instead of 500 so mobile never shows 0 due to a transient error
    res.json({
      score: {
        userId: req.userId,
        scoreDate: req.params.date,
        healthScore: 0,
        grade: "—",
        gradeLabel: "No data yet",
        dataConfidence: 0,
        foodScore: 0, exerciseScore: 0, waterScore: 0,
        medicineScore: 75, sleepScore: 50, bmiScore: 50,
        food: { calories: 0, calorieGoal: 2000, proteinG: 0, proteinGoalG: 50, carbsG: 0, fatG: 0, fiberG: 0, fiberGoalG: 25, meals: 0, mealGoal: 3, micronutrients: { dataAvailable: false, compositeScore: 0, calcium: { mg: 0, goalMg: 800, score: 0 }, iron: { mg: 0, goalMg: 17, score: 0 }, vitaminC: { mg: 0, goalMg: 40, score: 0 }, vitaminB12: { mcg: 0, goalMcg: 1, score: 0 }, vitaminD: { mcg: 0, goalMcg: 10, score: 0 } } },
        exercise: { metMinutesToday: 0, metMinutesGoal: 85.7, durationMinutes: 0, caloriesBurned: 0, sessions: 0 },
        water: { mlConsumed: 0, mlGoal: 2500, glasses: 0 },
        medicine: { taken: 0, scheduled: 0 },
        sleep: { hoursLogged: 0, isOptimal: false, quality: null, isLogged: false },
        bmi: { value: null, category: "Unknown" },
        _error: (e as Error).message,
      }
    });
  }
});

router.post("/health/score/:date/compute", requireAuth, async (req: AuthRequest, res) => {
  try {
    let date = String(req.params.date);
    const nowIST  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const prevIST = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (date === prevIST) date = nowIST;
    const score = await computeDailyScore(req.userId!, date);
    res.json({ score });
  } catch (e) {
    res.status(500).json({ error: "Failed to compute health score", detail: (e as Error).message });
  }
});

router.get("/health/scores/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { days = "30" } = req.query as { days?: string };
    const result = await pool.query(
      `SELECT * FROM daily_health_scores WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '${parseInt(days)} days' ORDER BY score_date`,
      [req.userId!]
    );
    res.json({ scores: result.rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch score history", detail: (e as Error).message });
  }
});

// ─── Sleep Logging ────────────────────────────────────────────────────────────
router.post("/health/sleep", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { sleepDate, sleepHours, bedtime, wakeTime, quality, notes, isOfflineEntry } = req.body as Record<string, unknown>;
    if (!sleepDate || !sleepHours) {
      res.status(400).json({ error: "sleepDate and sleepHours are required" });
      return;
    }
    const hours = parseFloat(String(sleepHours));
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      res.status(400).json({ error: "sleepHours must be between 0.1 and 24" });
      return;
    }
    const validQualities = ["poor", "fair", "good", "excellent"];
    if (quality && !validQualities.includes(String(quality))) {
      res.status(400).json({ error: `quality must be one of: ${validQualities.join(", ")}` });
      return;
    }
    const result = await pool.query(
      `INSERT INTO sleep_logs (user_id, sleep_date, sleep_hours, bedtime, wake_time, quality, notes, is_offline_entry, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        req.userId!,
        String(sleepDate),
        hours,
        bedtime ? String(bedtime) : null,
        wakeTime ? String(wakeTime) : null,
        quality ? String(quality) : null,
        notes ? String(notes) : null,
        Boolean(isOfflineEntry ?? false),
      ]
    );
    const log = result.rows[0];
    if (!log) {
      const existing = await pool.query(
        `SELECT * FROM sleep_logs WHERE user_id=$1 AND sleep_date=$2 ORDER BY logged_at DESC LIMIT 1`,
        [req.userId!, String(sleepDate)]
      );
      res.status(200).json({ success: true, log: existing.rows[0], updated: false });
      return;
    }
    res.status(201).json({ success: true, log, sleepHours: hours });
  } catch (e) {
    res.status(500).json({ error: "Failed to log sleep", detail: (e as Error).message });
  }
});

router.put("/health/sleep/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { sleepHours, bedtime, wakeTime, quality, notes } = req.body as Record<string, unknown>;
    if (!sleepHours) {
      res.status(400).json({ error: "sleepHours is required" });
      return;
    }
    const hours = parseFloat(String(sleepHours));
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      res.status(400).json({ error: "sleepHours must be between 0.1 and 24" });
      return;
    }
    const existing = await pool.query(
      `SELECT id FROM sleep_logs WHERE user_id=$1 AND sleep_date=$2 ORDER BY logged_at DESC LIMIT 1`,
      [req.userId!, date]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "No sleep log found for this date. Use POST /health/sleep to create one." });
      return;
    }
    const result = await pool.query(
      `UPDATE sleep_logs SET sleep_hours=$1, bedtime=$2, wake_time=$3, quality=$4, notes=$5, logged_at=NOW()
       WHERE id=$6 RETURNING *`,
      [hours, bedtime ?? null, wakeTime ?? null, quality ?? null, notes ?? null, existing.rows[0].id]
    );
    res.json({ success: true, log: result.rows[0], sleepHours: hours });
  } catch (e) {
    res.status(500).json({ error: "Failed to update sleep log", detail: (e as Error).message });
  }
});

router.get("/health/sleep/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { days = "7" } = req.query as { days?: string };
    const limit = Math.min(parseInt(days), 90);
    const result = await pool.query(
      `SELECT * FROM sleep_logs WHERE user_id=$1 ORDER BY sleep_date DESC LIMIT $2`,
      [req.userId!, limit]
    );
    const logs = result.rows;
    const avgHours = logs.length > 0
      ? Math.round((logs.reduce((sum: number, l: Record<string, unknown>) => sum + parseFloat(String(l.sleep_hours || "0")), 0) / logs.length) * 10) / 10
      : null;
    res.json({ logs, count: logs.length, avgHours });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch sleep history", detail: (e as Error).message });
  }
});

router.get("/health/sleep/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const result = await pool.query(
      `SELECT * FROM sleep_logs WHERE user_id=$1 AND sleep_date=$2 ORDER BY logged_at DESC LIMIT 1`,
      [req.userId!, date]
    );
    const log = result.rows[0] || null;
    res.json({
      log,
      sleepHours: log ? parseFloat(log.sleep_hours) : null,
      quality: log?.quality || null,
      isLogged: !!log,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch sleep log", detail: (e as Error).message });
  }
});

router.get("/health/active-percent", requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getCumulativeActivePercent(req.userId!);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch active percent", detail: (e as Error).message });
  }
});

async function computeDailyScore(userId: string, date: string): Promise<Record<string, unknown>> {
  const s = await computeScientificScore(userId, date);
  return {
    userId,
    scoreDate:          date,
    healthScore:        s.overallScore,
    grade:              s.grade,
    gradeLabel:         s.gradeLabel,
    dataConfidence:     s.dataConfidence,
    dataConfidencePct:  String(s.dataConfidence),
    // Component scores
    foodScore:          s.foodScore,
    exerciseScore:      s.exerciseScore,
    waterScore:         s.waterScore,
    medicineScore:      s.medicineScore,
    sleepScore:         s.sleepScore,
    bmiScore:           s.bmiScore,
    // Detail breakdowns
    food:               s.food,
    exercise:           s.exercise,
    water:              s.water,
    medicine:           s.medicine,
    sleep:              s.sleep,
    bmi:                s.bmi,
    // Backward compat fields for existing mobile screens
    totalCaloriesIn:    String(s.food.calories),
    waterGlasses:       s.water.glasses,
    exerciseMinutes:    s.exercise.durationMinutes,
    fieldsLogged:       [s.food.meals > 0, s.exercise.sessions > 0, s.water.glasses > 0].filter(Boolean).length,
    totalPossibleFields: 3,
    // Scientific transparency
    methodology:        s.methodology,
    // Personalisation metadata (v2 engine)
    personalisation:    s.personalisation,
  };
}

export default router;
