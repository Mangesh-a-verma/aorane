import { pool } from "@workspace/db";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Recalculate and upsert a user's daily activity score.
 * Call this after ANY log action (food, water, exercise, medicine, stress).
 */
export async function upsertDailyActivityScore(userId: string): Promise<void> {
  const date = todayIST();
  const dayStart = `${date}T00:00:00+05:30`;
  const dayEnd   = `${date}T23:59:59+05:30`;

  const [foodR, waterR, exR, medSchedR, medTakenR, stressR, prefR] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS meal_count FROM food_logs WHERE user_id=$1 AND logged_at>=$2 AND logged_at<=$3`,
      [userId, dayStart, dayEnd]
    ),
    pool.query(
      `SELECT COALESCE(SUM(glasses_count),0) AS glasses FROM water_logs WHERE user_id=$1 AND logged_at>=$2 AND logged_at<=$3`,
      [userId, dayStart, dayEnd]
    ),
    pool.query(
      `SELECT COUNT(*) AS sessions FROM exercise_logs WHERE user_id=$1 AND logged_at>=$2 AND logged_at<=$3`,
      [userId, dayStart, dayEnd]
    ),
    pool.query(
      `SELECT COUNT(*) AS scheduled FROM medicine_schedules WHERE user_id=$1 AND is_active=true`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) AS taken FROM medicine_logs WHERE user_id=$1 AND status='taken' AND scheduled_at>=$2 AND scheduled_at<=$3`,
      [userId, dayStart, dayEnd]
    ),
    pool.query(
      `SELECT COUNT(*) AS checked FROM stress_logs WHERE user_id=$1 AND logged_at>=$2 AND logged_at<=$3`,
      [userId, dayStart, dayEnd]
    ),
    pool.query(
      `SELECT water_goal_glasses FROM user_preferences WHERE user_id=$1`,
      [userId]
    ),
  ]);

  const meals     = parseInt(foodR.rows[0]?.meal_count || "0");
  const glasses   = parseFloat(waterR.rows[0]?.glasses || "0");
  const sessions  = parseInt(exR.rows[0]?.sessions || "0");
  const scheduled = parseInt(medSchedR.rows[0]?.scheduled || "0");
  const taken     = parseInt(medTakenR.rows[0]?.taken || "0");
  const stressChk = parseInt(stressR.rows[0]?.checked || "0");
  const waterGoal = parseInt(prefR.rows[0]?.water_goal_glasses || "8");

  // ── Scores per category ─────────────────────────────────────────────────────
  // Food: 3 meals = 30pts, 2 = 20pts, 1 = 10pts, 0 = 0pts
  const foodScore     = meals >= 3 ? 30 : meals === 2 ? 20 : meals === 1 ? 10 : 0;
  // Water: (glasses / goal) × 20, capped at 20
  const waterScore    = Math.min(20, Math.round((glasses / Math.max(waterGoal, 1)) * 20));
  // Exercise: any session = 20pts
  const exerciseScore = sessions > 0 ? 20 : 0;
  // Stress: any check-in = 10pts
  const stressScore   = stressChk > 0 ? 10 : 0;
  // Medicine: only counted if user HAS schedules
  const medicineScore = scheduled > 0
    ? Math.min(15, Math.round((taken / scheduled) * 15))
    : null;

  // Max possible: 100 if medicine scheduled, 85 if no schedules
  const maxPossible  = scheduled > 0 ? 100 : 85;
  const rawTotal     = foodScore + waterScore + exerciseScore + stressScore + (medicineScore ?? 0);
  const normalizedPct = Math.round((rawTotal / maxPossible) * 100);

  await pool.query(
    `INSERT INTO daily_activity_scores
       (user_id, activity_date, food_score, water_score, exercise_score, medicine_score,
        stress_score, total_score, max_possible, normalized_pct, app_opened)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     ON CONFLICT (user_id, activity_date) DO UPDATE SET
       food_score=$3, water_score=$4, exercise_score=$5, medicine_score=$6,
       stress_score=$7, total_score=$8, max_possible=$9, normalized_pct=$10,
       app_opened=true, calculated_at=NOW()`,
    [userId, date, foodScore, waterScore, exerciseScore, medicineScore,
     stressScore, rawTotal, maxPossible, normalizedPct]
  );
}

/**
 * Mark that user opened the app today (score may be 0 but day should count).
 */
export async function markAppOpened(userId: string): Promise<void> {
  const date = todayIST();
  await pool.query(
    `INSERT INTO daily_activity_scores (user_id, activity_date, app_opened)
     VALUES ($1, $2, true)
     ON CONFLICT (user_id, activity_date) DO UPDATE SET app_opened=true`,
    [userId, date]
  );
}

/**
 * Get cumulative active percentage (all-time average over app-opened days).
 * Also returns today's and this week's percentage.
 */
export async function getCumulativeActivePercent(userId: string): Promise<{
  pct: number;
  todayPct: number;
  weekPct: number;
  daysTracked: number;
  trend: "improving" | "declining" | "stable";
}> {
  const today   = todayIST();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const [allR, weekR, prevWeekR, todayR] = await Promise.all([
    pool.query(
      `SELECT ROUND(AVG(normalized_pct)) AS avg_pct, COUNT(*) AS days
       FROM daily_activity_scores
       WHERE user_id=$1 AND app_opened=true`,
      [userId]
    ),
    pool.query(
      `SELECT ROUND(AVG(normalized_pct)) AS avg_pct
       FROM daily_activity_scores
       WHERE user_id=$1 AND app_opened=true AND activity_date >= $2`,
      [userId, weekAgo]
    ),
    pool.query(
      `SELECT ROUND(AVG(normalized_pct)) AS avg_pct
       FROM daily_activity_scores
       WHERE user_id=$1 AND app_opened=true AND activity_date >= $2 AND activity_date < $3`,
      [userId, twoWeeksAgo, weekAgo]
    ),
    pool.query(
      `SELECT normalized_pct FROM daily_activity_scores
       WHERE user_id=$1 AND activity_date=$2`,
      [userId, today]
    ),
  ]);

  const weekPct     = Math.round(parseFloat(weekR.rows[0]?.avg_pct    || "0"));
  const prevWeekPct = Math.round(parseFloat(prevWeekR.rows[0]?.avg_pct || "0"));
  const diff = weekPct - prevWeekPct;
  const trend: "improving" | "declining" | "stable" =
    diff >= 5 ? "improving" : diff <= -5 ? "declining" : "stable";

  return {
    pct:         Math.round(parseFloat(allR.rows[0]?.avg_pct   || "0")),
    weekPct,
    todayPct:    todayR.rows[0] ? parseInt(todayR.rows[0].normalized_pct || "0") : 0,
    daysTracked: parseInt(allR.rows[0]?.days || "0"),
    trend,
  };
}
