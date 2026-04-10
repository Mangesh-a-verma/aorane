import { Router } from "express";
import { db, foodLogsTable, foodItemsTable, foodScanCacheTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";

const router = Router();

router.get("/food/logs", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date, startDate, endDate } = req.query as Record<string, string>;
    const conditions = [eq(foodLogsTable.userId, req.userId!)];
    if (date) {
      conditions.push(gte(foodLogsTable.loggedAt, new Date(date + "T00:00:00Z")));
      conditions.push(lte(foodLogsTable.loggedAt, new Date(date + "T23:59:59Z")));
    } else if (startDate && endDate) {
      conditions.push(gte(foodLogsTable.loggedAt, new Date(startDate)));
      conditions.push(lte(foodLogsTable.loggedAt, new Date(endDate)));
    }
    const logs = await db.select().from(foodLogsTable).where(and(...conditions)).orderBy(foodLogsTable.loggedAt);
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Failed to fetch food logs" });
  }
});

router.post("/food/log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { foodNameEn, mealType, quantityG, quantityDescription, calories, proteinG, carbsG, fatG, fiberG, inputMethod, foodItemId, loggedAt } = req.body as Record<string, unknown>;
    const [log] = await db.insert(foodLogsTable).values({
      userId: req.userId!,
      foodNameEn: foodNameEn as string,
      mealType: mealType as "breakfast" | "lunch" | "dinner" | "snack" | "other",
      quantityG: quantityG ? String(quantityG) : undefined,
      quantityDescription: quantityDescription as string | undefined,
      calories: String(calories),
      proteinG: proteinG ? String(proteinG) : undefined,
      carbsG: carbsG ? String(carbsG) : undefined,
      fatG: fatG ? String(fatG) : undefined,
      fiberG: fiberG ? String(fiberG) : undefined,
      inputMethod: (inputMethod as "photo" | "text" | "voice" | "manual") || "text",
      foodItemId: foodItemId as string | undefined,
      loggedAt: loggedAt ? new Date(loggedAt as string) : new Date(),
    }).returning();
    res.status(201).json({ log });
  } catch (err) {
    res.status(500).json({ error: "Failed to log food" });
  }
});

router.delete("/food/log/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.delete(foodLogsTable)
      .where(and(eq(foodLogsTable.id, req.params.id), eq(foodLogsTable.userId, req.userId!)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete food log" });
  }
});

router.get("/food/search", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { q, limit = "20" } = req.query as { q: string; limit?: string };
    if (!q || q.length < 2) {
      res.json({ items: [] });
      return;
    }
    const items = await db.select().from(foodItemsTable)
      .where(ilike(foodItemsTable.foodNameEn, `%${q}%`))
      .limit(parseInt(limit));
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Food search failed" });
  }
});

router.post("/food/scan", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { foodName, imageBase64 } = req.body as { foodName?: string; imageBase64?: string };
    const searchTerm = foodName?.toLowerCase().trim();

    if (searchTerm) {
      const [cached] = await db.select().from(foodScanCacheTable)
        .where(eq(foodScanCacheTable.foodNameEn, searchTerm));
      if (cached) {
        await db.update(foodScanCacheTable)
          .set({ hitCount: cached.hitCount + 1, lastUsedAt: new Date() })
          .where(eq(foodScanCacheTable.id, cached.id));
        res.json({ result: cached.aiResult, fromCache: true });
        return;
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    let prompt = "";
    if (searchTerm) {
      prompt = `Analyze this Indian food: "${searchTerm}". Return JSON with: foodNameEn, calories, proteinG, carbsG, fatG, fiberG, servingSizeG, servingDescription, category, dietaryTags (array: veg/nonveg/vegan/jain/gluten-free etc).`;
    } else {
      prompt = "Analyze this food image. Return JSON with: foodNameEn, calories, proteinG, carbsG, fatG, fiberG, servingSizeG, servingDescription, category, dietaryTags.";
    }

    const geminiBody = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
    );
    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    if (searchTerm) {
      await db.insert(foodScanCacheTable).values({
        foodNameEn: searchTerm,
        aiResult: result,
      }).onConflictDoNothing();
    }

    res.json({ result, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: "Food scan failed" });
  }
});

router.get("/food/summary/:date", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const logs = await db.select().from(foodLogsTable).where(
      and(
        eq(foodLogsTable.userId, req.userId!),
        gte(foodLogsTable.loggedAt, new Date(date + "T00:00:00Z")),
        lte(foodLogsTable.loggedAt, new Date(date + "T23:59:59Z"))
      )
    );
    const summary = {
      date,
      totalCalories: logs.reduce((sum, l) => sum + Number(l.calories), 0),
      totalProteinG: logs.reduce((sum, l) => sum + Number(l.proteinG || 0), 0),
      totalCarbsG: logs.reduce((sum, l) => sum + Number(l.carbsG || 0), 0),
      totalFatG: logs.reduce((sum, l) => sum + Number(l.fatG || 0), 0),
      mealCount: logs.length,
      breakdown: {
        breakfast: logs.filter((l) => l.mealType === "breakfast"),
        lunch: logs.filter((l) => l.mealType === "lunch"),
        dinner: logs.filter((l) => l.mealType === "dinner"),
        snack: logs.filter((l) => l.mealType === "snack"),
      },
    };
    res.json({ summary });
  } catch {
    res.status(500).json({ error: "Failed to fetch food summary" });
  }
});

export default router;
