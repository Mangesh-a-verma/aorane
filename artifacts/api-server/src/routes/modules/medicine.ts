import { Router } from "express";
import { upsertDailyActivityScore } from "../../lib/activityScore";
import { db, medicineSchedulesTable, medicineLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";

const router = Router();

router.get("/medicine/schedules", requireAuth, async (req: AuthRequest, res) => {
  try {
    const schedules = await db.select().from(medicineSchedulesTable)
      .where(and(eq(medicineSchedulesTable.userId, req.userId!), eq(medicineSchedulesTable.isActive, true)))
      .orderBy(medicineSchedulesTable.medicineName);
    res.json({ schedules });
  } catch {
    res.status(500).json({ error: "Failed to fetch medicine schedules" });
  }
});

router.post("/medicine/schedule", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { medicineName, dosage, doseCount, mealTiming, frequency, customDays, reminderTimes, startDate, endDate, refillAlertDays, notes } = req.body as Record<string, unknown>;
    if (!medicineName) return void res.status(400).json({ error: "medicineName is required" });
    if (!startDate) return void res.status(400).json({ error: "startDate is required" });
    const [schedule] = await db.insert(medicineSchedulesTable).values({
      userId: req.userId!,
      medicineName: medicineName as string,
      dosage: dosage as string | undefined,
      doseCount: Number(doseCount) || 1,
      mealTiming: (mealTiming as "before_meal" | "after_meal" | "with_meal" | "anytime" | "empty_stomach" | "bedtime") || "anytime",
      frequency: (frequency as "daily" | "alternate" | "weekly" | "custom") || "daily",
      customDays: customDays as string[] | undefined,
      reminderTimes: (reminderTimes as string[]) || [],
      startDate: startDate as string,
      endDate: endDate as string | undefined,
      refillAlertDays: Number(refillAlertDays) || 7,
      notes: notes as string | undefined,
    }).returning();
    res.status(201).json({ schedule });
  } catch (err) {
    console.error("[medicine] create error:", err);
    res.status(500).json({ error: "Failed to create medicine schedule" });
  }
});

router.patch("/medicine/schedule/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const allowedFields = ["medicineName", "dosage", "doseCount", "mealTiming", "frequency", "customDays", "reminderTimes", "endDate", "isActive", "refillAlertDays", "notes"];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined) updates[field] = req.body[field];
    }
    const [updated] = await db.update(medicineSchedulesTable).set(updates as Partial<typeof medicineSchedulesTable.$inferInsert>)
      .where(and(eq(medicineSchedulesTable.id, id), eq(medicineSchedulesTable.userId, req.userId!)))
      .returning();
    res.json({ schedule: updated });
  } catch {
    res.status(500).json({ error: "Failed to update medicine schedule" });
  }
});

router.delete("/medicine/schedule/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(medicineSchedulesTable).set({ isActive: false })
      .where(and(eq(medicineSchedulesTable.id, String(req.params.id)), eq(medicineSchedulesTable.userId, req.userId!)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete schedule" });
  }
});

router.post("/medicine/log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { scheduleId, status, scheduledAt, takenAt } = req.body as Record<string, unknown>;
    if (!scheduleId || !status) {
      res.status(400).json({ error: "scheduleId and status are required" }); return;
    }
    const [log] = await db.insert(medicineLogsTable).values({
      userId: req.userId!,
      scheduleId: scheduleId as string,
      status: status as string,
      scheduledAt: scheduledAt ? new Date(scheduledAt as string) : new Date(),
      takenAt: takenAt ? new Date(takenAt as string) : (status === "taken" ? new Date() : undefined),
    }).returning();
    upsertDailyActivityScore(req.userId!).catch(() => {});
    res.status(201).json({ log });
  } catch {
    res.status(500).json({ error: "Failed to log medicine" });
  }
});

router.get("/medicine/logs", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query as { date?: string };
    const conditions = [eq(medicineLogsTable.userId, req.userId!)];
    if (date) {
      conditions.push(gte(medicineLogsTable.scheduledAt, new Date(date + "T00:00:00Z")));
      conditions.push(lte(medicineLogsTable.scheduledAt, new Date(date + "T23:59:59Z")));
    }
    const logs = await db.select().from(medicineLogsTable).where(and(...conditions)).orderBy(desc(medicineLogsTable.scheduledAt));
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Failed to fetch medicine logs" });
  }
});

router.get("/medicine/today", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const schedules = await db.select().from(medicineSchedulesTable)
      .where(and(eq(medicineSchedulesTable.userId, req.userId!), eq(medicineSchedulesTable.isActive, true)))
      .orderBy(medicineSchedulesTable.medicineName);
    const logs = await db.select().from(medicineLogsTable)
      .where(and(
        eq(medicineLogsTable.userId, req.userId!),
        gte(medicineLogsTable.scheduledAt, new Date(today + "T00:00:00Z")),
        lte(medicineLogsTable.scheduledAt, new Date(today + "T23:59:59Z"))
      ));
    const takenIds = new Set(logs.filter(l => l.status === "taken").map(l => l.scheduleId));
    const result = schedules.map(s => ({
      ...s,
      todayStatus: takenIds.has(s.id) ? "taken" : "pending",
    }));
    const taken = result.filter(s => s.todayStatus === "taken").length;
    const pending = result.filter(s => s.todayStatus === "pending").length;
    res.json({ schedules: result, summary: { total: result.length, taken, pending, adherencePercent: result.length ? Math.round((taken / result.length) * 100) : 100 } });
  } catch (err) {
    console.error("[medicine/today] error:", err);
    res.status(500).json({ error: "Failed to fetch today's medicines" });
  }
});

export default router;
