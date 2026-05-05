import { Router } from "express";
import { upsertDailyActivityScore } from "../../lib/activityScore";
import { db, stressLogsTable, userProfilesTable, exerciseLogsTable, waterLogsTable, foodLogsTable, medicineLogsTable, medicineSchedulesTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";
import { aiRateLimit } from "../../middlewares/ai-rate-limit";
import { callAI } from "../../lib/ai";

// ── Work profile → estimated daily work hours map ───────────────────────────
const WORK_HOURS_MAP: Record<string, number> = {
  "Office/Desk Job":    9,
  "IT/Software":        10,
  "Call Center/BPO":    9,
  "Field/Sales":        10,
  "Doctor/Healthcare":  12,
  "Teacher/Professor":  7,
  "Army/Defence":       10,
  "Police/CRPF":        10,
  "Farmer/Agriculture": 10,
  "Housewife":          8,
  "Student":            7,
  "Business Owner":     11,
  "Driver/Delivery":    10,
  "Factory Worker":     9,
  "Athlete/Sports":     7,
  "Other":              8,
};

const router = Router();

// ─────────────────────────────────────────────────────────
// POST /stress/log  — log a stress check-in
// Supports: mood, five_pillar, full_assessment
// ─────────────────────────────────────────────────────────
router.post("/stress/log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      stressType, mood, heartRateAvg, pillars, aiInsight,
      stressScore: manualScore,
      moodScore, energyScore, pssScores, symptoms,
    } = req.body as Record<string, unknown>;

    let stressScore = Number(manualScore) || 0;
    let pillarData = pillars;
    let dbStressType: "ppg" | "mood" | "five_pillar" = "mood";

    // ── Full Assessment (3-step clinical check-in) ──────────────────────────
    if (stressType === "full_assessment" && moodScore !== undefined) {
      dbStressType = "mood";

      // moodScore: 1=Excellent, 2=Good, 3=Fair, 4=Low, 5=Very Low
      // energyScore: 1=High energy, 5=Exhausted
      const moodNum   = Math.max(1, Math.min(5, Number(moodScore)));
      const energyNum = Math.max(1, Math.min(5, Number(energyScore) || 3));

      // Component 1: Mood + Energy → 0-50
      const moodBase   = ((moodNum - 1) / 4) * 35;
      const energyBase = ((energyNum - 1) / 4) * 15;

      // Component 2: 3 PSS-style clinical questions (each 0-3) → 0-35
      const pssArr = Array.isArray(pssScores) ? (pssScores as number[]) : [0, 0, 0];
      const pssTotal   = pssArr.reduce((s, q) => s + Math.max(0, Math.min(3, q)), 0);
      const pssComponent = (pssTotal / 9) * 35;

      // Component 3: Body symptoms (each +3, max 15) → 0-15
      const sympList = Array.isArray(symptoms) ? symptoms as string[] : [];
      const sympComponent = Math.min(sympList.length * 3, 15);

      stressScore = Math.round(moodBase + energyBase + pssComponent + sympComponent);
      stressScore = Math.max(5, Math.min(98, stressScore));

      pillarData = {
        mode: "full_assessment",
        moodScore: moodNum,
        energyScore: energyNum,
        pssScores: pssArr,
        symptoms: sympList,
        components: {
          mood: Math.round(moodBase),
          energy: Math.round(energyBase),
          pss: Math.round(pssComponent),
          symptoms: sympComponent,
        },
      };

    // ── Five-Pillar (auto from today's activity data) ───────────────────────
    } else if (stressType === "five_pillar") {
      dbStressType = "five_pillar";
      const today      = new Date().toISOString().split("T")[0];
      const todayStart = new Date(`${today}T00:00:00Z`);
      const todayEnd   = new Date(`${today}T23:59:59Z`);

      const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, req.userId!));

      // Fetch all 5 data sources in parallel
      const [waterLogs, exerciseLogs, foodLogs, medSchedules, medLogs] = await Promise.all([
        db.select().from(waterLogsTable).where(and(eq(waterLogsTable.userId, req.userId!), gte(waterLogsTable.loggedAt, todayStart))),
        db.select().from(exerciseLogsTable).where(and(eq(exerciseLogsTable.userId, req.userId!), gte(exerciseLogsTable.loggedAt, todayStart))),
        db.select().from(foodLogsTable).where(and(eq(foodLogsTable.userId, req.userId!), gte(foodLogsTable.loggedAt, todayStart))),
        db.select().from(medicineSchedulesTable).where(and(eq(medicineSchedulesTable.userId, req.userId!), eq(medicineSchedulesTable.isActive, true))),
        db.select().from(medicineLogsTable).where(and(eq(medicineLogsTable.userId, req.userId!), gte(medicineLogsTable.scheduledAt, todayStart), lte(medicineLogsTable.scheduledAt, todayEnd))),
      ]);

      const waterGlasses = waterLogs.reduce((s, l) => s + (l.glassesCount || 0), 0);
      const exerciseMin  = exerciseLogs.reduce((s, l) => s + (l.durationMinutes || 0), 0);
      const sleepHours   = Number(profile?.sleepHoursAvg) || 7;
      const mealCount    = foodLogs.length;

      // ── 5 Wellness scores (0-100, higher = healthier = less stress) ─────────
      const sleepScore    = Math.min(100, Math.round((sleepHours / 8) * 100));
      const waterScore    = Math.min(100, Math.round((waterGlasses / 8) * 100));
      const exerciseScore = Math.min(100, Math.round((exerciseMin / 30) * 100));

      // FIXED: Real food score from actual logs (not hardcoded 65)
      const foodScore = mealCount >= 3 ? 100 : mealCount === 2 ? 70 : mealCount === 1 ? 40 : 15;

      // FIXED: Real medicine score from actual logs (not hardcoded 70)
      let medicineScore = 85; // neutral when no schedules
      if (medSchedules.length > 0) {
        const takenToday = medLogs.filter(l => (l as unknown as Record<string, unknown>)["status"] === "taken").length;
        medicineScore = Math.min(100, Math.round((takenToday / medSchedules.length) * 100));
        if (medicineScore < 10) medicineScore = 10; // floor
      }

      // NEW: Work profile → work hours → stress penalty (max +15 points)
      const workProfileStr = (profile?.workProfile as string) || "Other";
      const workHours      = WORK_HOURS_MAP[workProfileStr] ?? 8;
      const workPenalty    = workHours > 8 ? Math.min(15, Math.round((workHours - 8) * 3.75)) : 0;

      const wellnessAvg = (sleepScore + waterScore + exerciseScore + medicineScore + foodScore) / 5;
      stressScore = Math.round(100 - wellnessAvg + workPenalty);
      stressScore = Math.max(10, Math.min(95, stressScore));

      pillarData = {
        sleep: sleepScore, water: waterScore, exercise: exerciseScore,
        medicine: medicineScore, food: foodScore,
        workHours, workPenalty, mealCount,
        waterGlasses, exerciseMin, sleepHours,
      };

    // ── Simple Mood Log ─────────────────────────────────────────────────────
    } else if (stressType === "mood") {
      dbStressType = "mood";
      const moodScores: Record<string, number> = { excellent: 10, good: 20, fair: 45, low: 68, very_low: 85, happy: 15, neutral: 40, stressed: 72, sad: 65 };
      stressScore = moodScores[mood as string] ?? 40;
    }

    // Normalise free-text mood strings → DB enum values to prevent constraint violations
    const MOOD_MAP: Record<string, "happy" | "neutral" | "stressed" | "sad"> = {
      happy: "happy", excellent: "happy", great: "happy", good: "happy",
      neutral: "neutral", okay: "neutral", fair: "neutral", moderate: "neutral",
      stressed: "stressed", elevated: "stressed", "very high": "stressed", high: "stressed",
      sad: "sad", low: "sad", "very low": "sad", bad: "sad",
    };
    const normMood = mood ? (MOOD_MAP[(mood as string).toLowerCase()] ?? undefined) : undefined;

    const [log] = await db.insert(stressLogsTable).values({
      userId:       req.userId!,
      stressType:   dbStressType,
      stressScore,
      mood:         normMood,
      heartRateAvg: heartRateAvg ? Number(heartRateAvg) : undefined,
      pillars:      pillarData || undefined,
      aiInsight:    aiInsight as string || undefined,
      loggedAt:     new Date(),
    }).returning();

    upsertDailyActivityScore(req.userId!).catch(() => {});
    res.status(201).json({ success: true, log, stressScore });
  } catch (err) {
    res.status(500).json({ error: "Failed to log stress", detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /stress/today  — today's stress summary + burnout risk
// ─────────────────────────────────────────────────────────
router.get("/stress/today", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today      = new Date().toISOString().split("T")[0]!;
    const todayStart = new Date(`${today}T00:00:00Z`);

    const logs = await db.select().from(stressLogsTable)
      .where(and(eq(stressLogsTable.userId, req.userId!), gte(stressLogsTable.loggedAt, todayStart)))
      .orderBy(desc(stressLogsTable.loggedAt));

    const latestScore = logs[0]?.stressScore ?? null;
    const avgScore    = logs.length ? Math.round(logs.reduce((s, l) => s + l.stressScore, 0) / logs.length) : null;

    // Burnout risk check — last 3 calendar days all avg > 65
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    threeDaysAgo.setHours(0, 0, 0, 0);

    const recentLogs = await db.select().from(stressLogsTable)
      .where(and(eq(stressLogsTable.userId, req.userId!), gte(stressLogsTable.loggedAt, threeDaysAgo)))
      .orderBy(desc(stressLogsTable.loggedAt));

    const dayMap: Record<string, number[]> = {};
    recentLogs.forEach(l => {
      const day = l.loggedAt.toISOString().split("T")[0]!;
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day]!.push(l.stressScore);
    });

    const dayAvgs = Object.values(dayMap).map(scores => Math.round(scores.reduce((s, n) => s + n, 0) / scores.length));
    const burnoutRisk = dayAvgs.length >= 3 && dayAvgs.every(avg => avg > 65);

    // Get latest pillar details for mode detection
    const latestPillars = logs[0]?.pillars as Record<string, unknown> | null ?? null;
    const latestMode    = latestPillars?.mode as string || logs[0]?.stressType || null;

    res.json({
      checkedIn:   logs.length > 0,
      latestScore,
      avgScore,
      count:       logs.length,
      latestMood:  logs[0]?.mood ?? null,
      latestMode,
      burnoutRisk,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch today's stress" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /stress/logs  — recent logs (with limit)
// ─────────────────────────────────────────────────────────
router.get("/stress/logs", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Number(req.query["limit"]) || 30;
    const logs  = await db.select().from(stressLogsTable)
      .where(eq(stressLogsTable.userId, req.userId!))
      .orderBy(desc(stressLogsTable.loggedAt))
      .limit(limit);

    const avgScore = logs.length ? Math.round(logs.reduce((s, l) => s + l.stressScore, 0) / logs.length) : 0;
    res.json({ logs, avgScore, count: logs.length });
  } catch {
    res.status(500).json({ error: "Failed to get stress logs" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /stress/weekly  — last 7 days daily avg + burnout risk
// ─────────────────────────────────────────────────────────
router.get("/stress/weekly", requireAuth, async (req: AuthRequest, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const logs = await db.select().from(stressLogsTable)
      .where(and(eq(stressLogsTable.userId, req.userId!), gte(stressLogsTable.loggedAt, sevenDaysAgo)))
      .orderBy(desc(stressLogsTable.loggedAt));

    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const days: Array<{
      date: string; dayLabel: string; dayLabelHi: string;
      avgScore: number; count: number; dominantMood: string | null;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d       = new Date();
      d.setDate(d.getDate() - i);
      const dateStr  = d.toISOString().split("T")[0]!;
      const dayLogs  = logs.filter(l => l.loggedAt.toISOString().split("T")[0] === dateStr);
      const avg      = dayLogs.length ? Math.round(dayLogs.reduce((s, l) => s + l.stressScore, 0) / dayLogs.length) : 0;

      const moods     = dayLogs.filter(l => l.mood).map(l => l.mood!);
      const moodCount: Record<string, number> = {};
      moods.forEach(m => { moodCount[m] = (moodCount[m] || 0) + 1; });
      const dominantMood = moods.length ? Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;

      days.push({ date: dateStr, dayLabel: DAY_NAMES[d.getDay()]!, dayLabelHi: DAY_NAMES[d.getDay()]!, avgScore: avg, count: dayLogs.length, dominantMood });
    }

    const activeDays = days.filter(d => d.count > 0);
    const weekAvg    = activeDays.length ? Math.round(activeDays.reduce((s, d) => s + d.avgScore, 0) / activeDays.length) : 0;

    // Consecutive high-stress streak
    let highStreakDays = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i]!.count > 0 && days[i]!.avgScore > 65) highStreakDays++;
      else break;
    }

    // NEW: Personal 30-day baseline (needs ≥5 logs to be meaningful)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const baselineLogs = await db.select().from(stressLogsTable)
      .where(and(eq(stressLogsTable.userId, req.userId!), gte(stressLogsTable.loggedAt, thirtyDaysAgo)));

    const personalBaseline = baselineLogs.length >= 5
      ? Math.round(baselineLogs.reduce((s, l) => s + l.stressScore, 0) / baselineLogs.length)
      : null;

    // vs baseline signal: positive = worse than usual, negative = better than usual
    const vsBaseline = (personalBaseline !== null && weekAvg > 0)
      ? weekAvg - personalBaseline
      : null;

    res.json({
      days, weekAvg, totalLogs: logs.length, highStreakDays,
      burnoutRisk: highStreakDays >= 3,
      personalBaseline,
      vsBaseline,
      baselineLogsCount: baselineLogs.length,
    });
  } catch {
    res.status(500).json({ error: "Failed to get weekly data" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /stress/insight  — AI-powered personalized insight
// ─────────────────────────────────────────────────────────
router.get("/stress/insight", requireAuth, aiRateLimit("stress_insight", 5), async (req: AuthRequest, res) => {
  try {
    const recentLogs = await db.select().from(stressLogsTable)
      .where(eq(stressLogsTable.userId, req.userId!))
      .orderBy(desc(stressLogsTable.loggedAt))
      .limit(14);

    const avg = recentLogs.length
      ? Math.round(recentLogs.reduce((s, l) => s + l.stressScore, 0) / recentLogs.length)
      : 40;

    let insight  = "";
    let aiTips: string[] = [];

    if (recentLogs.length > 0) {
      const logSummary = recentLogs.slice(0, 7).map(l => {
        const pData = l.pillars as Record<string, unknown> | null;
        const mode  = pData?.mode as string || l.stressType;
        return `${l.loggedAt.toISOString().split("T")[0]}: score=${l.stressScore}, type=${mode}${l.mood ? `, mood=${l.mood}` : ""}`;
      }).join("\n");

      const prompt = `You are an Indian health AI assistant for the Aorane health app. Analyze this user's stress data and give personalized advice in English.

Stress logs (last 7 entries):
${logSummary}

Average stress score: ${avg}/100 (0=no stress, 100=extreme stress)

Categories: 0-25 Low, 26-50 Moderate, 51-75 Elevated, 76-100 High Risk

Give:
1. One SHORT insight sentence (1-2 lines) about their stress pattern
2. Three specific actionable tips in English (each tip max 1 line, Indian context preferred — yoga, pranayama, food, etc.)

Format as JSON exactly:
{"insight": "...", "tips": ["tip1", "tip2", "tip3"]}`;

      try {
        const raw        = await callAI("stress_ai", [{ role: "user", content: prompt }], { maxTokens: 600 });
        const jsonMatch  = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { insight?: string; tips?: string[] };
          insight  = parsed.insight || "";
          aiTips   = parsed.tips || [];
        }
      } catch { }
    }

    if (!insight) {
      if (avg < 26) insight = "Your stress level is low — you are managing daily pressures well. Keep this routine.";
      else if (avg < 51) insight = "Moderate stress detected. Small daily habits like morning walks can help significantly.";
      else if (avg < 76) insight = "Elevated stress detected. Prioritize sleep and take short breaks during the day.";
      else insight = "Your stress is very high. Please consider speaking to a doctor or counselor.";
    }
    if (!aiTips.length) {
      if (avg < 26) aiTips = ["Continue your current sleep and exercise routine", "Try 5 minutes of gratitude journaling daily", "Stay hydrated — aim for 8 glasses of water"];
      else if (avg < 51) aiTips = ["Practice Anulom Vilom pranayama for 5 minutes each morning", "Take a 10-minute walk after lunch", "Reduce screen time 1 hour before bed"];
      else if (avg < 76) aiTips = ["Start 4-7-8 breathing immediately — 4 cycles twice a day", "Get at least 7 hours of sleep tonight", "Talk to someone you trust about what is on your mind"];
      else aiTips = ["Contact a doctor or counselor today", "Avoid caffeine — drink warm water with lemon", "Practice box breathing: 4 sec in, 4 hold, 4 out, 4 hold"];
    }

    res.json({ avgScore: avg, insight, tips: aiTips, logsCount: recentLogs.length, aiPowered: recentLogs.length > 0 });
  } catch {
    res.status(500).json({ error: "Failed to get insight" });
  }
});

export default router;
