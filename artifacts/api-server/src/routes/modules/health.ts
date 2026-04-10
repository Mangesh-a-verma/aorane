import { Router } from "express";
import { db, exerciseLogsTable, waterLogsTable, dailyHealthScoresTable, userProfilesTable, userPreferencesTable, foodLogsTable, medicineLogsTable, stressLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";

const router = Router();

router.post("/health/exercise", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { exerciseType, durationMinutes, intensity, caloriesBurned, inputMethod, notes, loggedAt } = req.body as Record<string, unknown>;
    const [log] = await db.insert(exerciseLogsTable).values({
      userId: req.userId!,
      exerciseType: exerciseType as string,
      durationMinutes: Number(durationMinutes),
      intensity: (intensity as "light" | "moderate" | "intense") || "moderate",
      caloriesBurned: caloriesBurned ? String(caloriesBurned) : undefined,
      inputMethod: (inputMethod as "photo" | "text" | "voice" | "manual") || "manual",
      notes: notes as string | undefined,
      loggedAt: loggedAt ? new Date(loggedAt as string) : new Date(),
    }).returning();
    res.status(201).json({ log });
  } catch {
    res.status(500).json({ error: "Failed to log exercise" });
  }
});

router.get("/health/exercise", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query as { date?: string };
    const conditions = [eq(exerciseLogsTable.userId, req.userId!)];
    if (date) {
      conditions.push(gte(exerciseLogsTable.loggedAt, new Date(date + "T00:00:00Z")));
      conditions.push(lte(exerciseLogsTable.loggedAt, new Date(date + "T23:59:59Z")));
    }
    const logs = await db.select().from(exerciseLogsTable).where(and(...conditions)).orderBy(desc(exerciseLogsTable.loggedAt));
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Failed to fetch exercise logs" });
  }
});

router.post("/health/water", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { glassesCount = 1, mlAmount = 250, drinkType = "water", loggedAt } = req.body as Record<string, unknown>;
    const [log] = await db.insert(waterLogsTable).values({
      userId: req.userId!,
      glassesCount: Number(glassesCount),
      mlAmount: Number(mlAmount),
      drinkType: drinkType as string,
      loggedAt: loggedAt ? new Date(loggedAt as string) : new Date(),
    }).returning();
    res.status(201).json({ log });
  } catch {
    res.status(500).json({ error: "Failed to log water" });
  }
});

router.get("/health/water/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const logs = await db.select().from(waterLogsTable).where(
      and(
        eq(waterLogsTable.userId, req.userId!),
        gte(waterLogsTable.loggedAt, new Date(date + "T00:00:00Z")),
        lte(waterLogsTable.loggedAt, new Date(date + "T23:59:59Z"))
      )
    ).orderBy(waterLogsTable.loggedAt);
    const total = logs.reduce((sum, l) => sum + l.glassesCount, 0);
    const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
    res.json({ logs, totalGlasses: total, goal: prefs?.waterGoalGlasses || 8 });
  } catch {
    res.status(500).json({ error: "Failed to fetch water logs" });
  }
});

router.get("/health/score/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const [existing] = await db.select().from(dailyHealthScoresTable).where(
      and(eq(dailyHealthScoresTable.userId, req.userId!), eq(dailyHealthScoresTable.scoreDate, date))
    );
    if (existing) {
      res.json({ score: existing });
      return;
    }
    const score = await computeDailyScore(req.userId!, date);
    res.json({ score });
  } catch {
    res.status(500).json({ error: "Failed to fetch health score" });
  }
});

router.post("/health/score/:date/compute", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const score = await computeDailyScore(req.userId!, date);
    res.json({ score });
  } catch {
    res.status(500).json({ error: "Failed to compute health score" });
  }
});

router.get("/health/scores/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { days = "30" } = req.query as { days?: string };
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const scores = await db.select().from(dailyHealthScoresTable).where(
      and(
        eq(dailyHealthScoresTable.userId, req.userId!),
        gte(dailyHealthScoresTable.createdAt, startDate)
      )
    ).orderBy(dailyHealthScoresTable.scoreDate);
    res.json({ scores });
  } catch {
    res.status(500).json({ error: "Failed to fetch score history" });
  }
});

async function computeDailyScore(userId: string, date: string): Promise<typeof dailyHealthScoresTable.$inferSelect> {
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59Z");

  const [foodLogs, exerciseLogs, waterLogs, medicineLogs, stressLogs, prefs] = await Promise.all([
    db.select().from(foodLogsTable).where(and(eq(foodLogsTable.userId, userId), gte(foodLogsTable.loggedAt, startOfDay), lte(foodLogsTable.loggedAt, endOfDay))),
    db.select().from(exerciseLogsTable).where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.loggedAt, startOfDay), lte(exerciseLogsTable.loggedAt, endOfDay))),
    db.select().from(waterLogsTable).where(and(eq(waterLogsTable.userId, userId), gte(waterLogsTable.loggedAt, startOfDay), lte(waterLogsTable.loggedAt, endOfDay))),
    db.select().from(medicineLogsTable).where(and(eq(medicineLogsTable.userId, userId), gte(medicineLogsTable.scheduledAt, startOfDay), lte(medicineLogsTable.scheduledAt, endOfDay))),
    db.select().from(stressLogsTable).where(and(eq(stressLogsTable.userId, userId), gte(stressLogsTable.loggedAt, startOfDay), lte(stressLogsTable.loggedAt, endOfDay))),
    db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId)),
  ]);

  const waterGoal = prefs[0]?.waterGoalGlasses || 8;
  const calorieGoal = prefs[0]?.calorieGoal || 2000;
  const totalCalories = foodLogs.reduce((s, l) => s + Number(l.calories), 0);
  const totalWater = waterLogs.reduce((s, l) => s + l.glassesCount, 0);
  const totalExercise = exerciseLogs.reduce((s, l) => s + l.durationMinutes, 0);

  const foodScore = foodLogs.length > 0 ? Math.min(100, Math.round((Math.min(totalCalories, calorieGoal) / calorieGoal) * 100)) : 0;
  const waterScore = Math.min(100, Math.round((totalWater / waterGoal) * 100));
  const exerciseScore = Math.min(100, Math.round((totalExercise / 30) * 100));

  const takeMedicines = medicineLogs.filter((m) => m.status === "taken").length;
  const totalMedicines = medicineLogs.length;
  const medicineScore = totalMedicines > 0 ? Math.round((takeMedicines / totalMedicines) * 100) : 50;

  const fieldsLogged = [foodLogs.length > 0, waterLogs.length > 0, exerciseLogs.length > 0].filter(Boolean).length;
  const healthScore = Math.round((foodScore + waterScore + exerciseScore + medicineScore) / 4);
  const dataConfidencePct = (fieldsLogged / 3) * 100;

  const [existing] = await db.select().from(dailyHealthScoresTable).where(
    and(eq(dailyHealthScoresTable.userId, userId), eq(dailyHealthScoresTable.scoreDate, date))
  );

  if (existing) {
    const [updated] = await db.update(dailyHealthScoresTable).set({
      healthScore,
      dataConfidencePct: String(dataConfidencePct),
      foodScore,
      exerciseScore,
      waterScore,
      medicineScore,
      totalCaloriesIn: String(totalCalories),
      waterGlasses: totalWater,
      exerciseMinutes: totalExercise,
      fieldsLogged,
    }).where(and(eq(dailyHealthScoresTable.userId, userId), eq(dailyHealthScoresTable.scoreDate, date))).returning();
    return updated;
  }

  const [created] = await db.insert(dailyHealthScoresTable).values({
    userId,
    scoreDate: date,
    healthScore,
    dataConfidencePct: String(dataConfidencePct),
    foodScore,
    exerciseScore,
    waterScore,
    medicineScore,
    totalCaloriesIn: String(totalCalories),
    waterGlasses: totalWater,
    exerciseMinutes: totalExercise,
    fieldsLogged,
    totalPossibleFields: 3,
  }).returning();
  return created;
}

export default router;
