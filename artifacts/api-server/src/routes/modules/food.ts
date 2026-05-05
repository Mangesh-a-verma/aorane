import { Router } from "express";
import { upsertDailyActivityScore } from "../../lib/activityScore";
import { db, foodLogsTable, foodItemsTable, foodScanCacheTable, userProfilesTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, desc, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";
import { aiRateLimit, planAiRateLimit } from "../../middlewares/ai-rate-limit";
import { callAI } from "../../lib/ai";
import { getWeatherContext } from "../../lib/weather";
import { cache } from "../../lib/redis";

const WEATHER_CACHE_TTL = 6 * 60 * 60; // 6 hours

// ── Fuzzy dedup helpers ──────────────────────────────────────────────────────
/** Normalize food name for fuzzy matching: lowercase, trim, collapse spaces */
function normalizeFoodName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\u0900-\u097f ]/g, "") // keep alphanumeric, Hindi chars, spaces
    .replace(/\s+/g, " ");
}

/** Simple similarity: check if two normalized names are close enough */
function isSimilarName(a: string, b: string): boolean {
  if (a === b) return true;
  // Check if one contains the other (handles "poha" vs "poha with peanuts")
  if (a.includes(b) || b.includes(a)) return true;
  // Levenshtein distance for short names
  if (Math.abs(a.length - b.length) > 4) return false;
  let matches = 0;
  const shorter = a.length < b.length ? a : b;
  const longer  = a.length < b.length ? b : a;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i]!)) matches++;
  }
  return (matches / longer.length) >= 0.8;
}

/** Safely convert AI result value to decimal string — handles 0 correctly */
function toDecStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return String(n);
}

/** Extract vitamins object from AI result */
function getVitamins(aiResult: Record<string, unknown>) {
  return (aiResult.vitamins as Record<string, unknown>) ?? {};
}

/** Auto-promote a cache entry to food_items if it meets quality threshold */
async function maybeAutoPromote(cacheId: string, hitCount: number, aiResult: Record<string, unknown>, foodNameEn: string): Promise<void> {
  if (hitCount < 5) return; // Only auto-promote after 5+ searches
  // Check not already promoted
  const [entry] = await db.select({ isPromoted: foodScanCacheTable.isPromoted })
    .from(foodScanCacheTable).where(eq(foodScanCacheTable.id, cacheId));
  if (!entry || entry.isPromoted) return;
  // Insert into food_items
  try {
    const r = aiResult;
    const vs = getVitamins(r);
    const [newItem] = await db.insert(foodItemsTable).values({
      foodNameEn: (r.foodNameEn as string) || foodNameEn,
      category:   (r.category as string)   || "other",
      cuisineType: "indian",
      calories:    toDecStr(r.calories) ?? "0",
      proteinG:    toDecStr(r.proteinG),
      carbsG:      toDecStr(r.carbsG),
      fatG:        toDecStr(r.fatG),
      fiberG:      toDecStr(r.fiberG),
      sugarG:      toDecStr(r.sugarG),
      sodiumMg:    toDecStr(r.sodiumMg),
      potassiumMg: toDecStr(r.potassiumMg) ?? toDecStr(vs.potassium_mg),
      vitaminCMg:   toDecStr(vs.vitaminC_mg),
      vitaminB12Mcg: toDecStr(vs.vitaminB12_mcg),
      vitaminDMcg:  toDecStr(vs.vitaminD_mcg),
      calciumMg:    toDecStr(vs.calcium_mg),
      ironMg:       toDecStr(vs.iron_mg),
      servingSizeG:      toDecStr(r.servingSizeG) ?? "100",
      servingDescription: (r.servingDescription as string) || null,
      dietaryTags: Array.isArray(r.dietaryTags) ? r.dietaryTags as string[] : [],
      isVerified:    false,
      addedByAdmin:  false,
      aiGenerated:   true,
      aiSourceCacheId: cacheId,
    }).returning({ id: foodItemsTable.id });
    // Mark cache entry as promoted
    await db.update(foodScanCacheTable).set({
      isPromoted: true,
      reviewedAt: new Date(),
      promotedFoodItemId: newItem?.id ?? null,
    }).where(eq(foodScanCacheTable.id, cacheId));
  } catch { /* ignore promote errors — don't break main flow */ }
}

const router = Router();

// ── Food Database Stats (internal debug) ──────────────────────────────────────
router.get("/food/db-stats", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const [totals] = await db.select({
      total:       sql<number>`COUNT(*)`,
      indian:      sql<number>`COUNT(CASE WHEN cuisine_type='indian' THEN 1 END)`,
      global:      sql<number>`COUNT(CASE WHEN is_global=true THEN 1 END)`,
      drinks:      sql<number>`COUNT(CASE WHEN category='beverage' THEN 1 END)`,
      grains:      sql<number>`COUNT(CASE WHEN category='grain' THEN 1 END)`,
      vegetables:  sql<number>`COUNT(CASE WHEN category='vegetable' THEN 1 END)`,
      fruits:      sql<number>`COUNT(CASE WHEN category='fruit' THEN 1 END)`,
      dairy:       sql<number>`COUNT(CASE WHEN category='dairy' THEN 1 END)`,
      protein:     sql<number>`COUNT(CASE WHEN category='protein' THEN 1 END)`,
      snacks:      sql<number>`COUNT(CASE WHEN category='snack' THEN 1 END)`,
      sweets:      sql<number>`COUNT(CASE WHEN category='sweet' THEN 1 END)`,
      legumes:     sql<number>`COUNT(CASE WHEN category='legume' THEN 1 END)`,
      condiments:  sql<number>`COUNT(CASE WHEN category='condiment' THEN 1 END)`,
      fats:        sql<number>`COUNT(CASE WHEN category='fat' THEN 1 END)`,
    }).from(foodItemsTable);
    res.json({ stats: totals });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Food Logs ──────────────────────────────────────────────────────────────────
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
    const { foodNameEn, mealType, quantityG, quantityDescription, calories, proteinG, carbsG, fatG, fiberG, sodiumMg, calciumMg, ironMg, vitaminCMg, vitaminB12Mcg, vitaminDMcg, inputMethod, foodItemId } = req.body as Record<string, unknown>;
    if (!foodNameEn || !calories) {
      res.status(400).json({ error: "foodNameEn and calories are required" });
      return;
    }
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
      sodiumMg: sodiumMg ? String(sodiumMg) : undefined,
      calciumMg: calciumMg ? String(calciumMg) : undefined,
      ironMg: ironMg ? String(ironMg) : undefined,
      vitaminCMg: vitaminCMg ? String(vitaminCMg) : undefined,
      vitaminB12Mcg: vitaminB12Mcg ? String(vitaminB12Mcg) : undefined,
      vitaminDMcg: vitaminDMcg ? String(vitaminDMcg) : undefined,
      inputMethod: (inputMethod as "photo" | "text" | "voice" | "manual") || "text",
      foodItemId: foodItemId as string | undefined,
      loggedAt: new Date(),
    }).returning();
    upsertDailyActivityScore(req.userId!).catch(() => {});
    res.status(201).json({ log });
  } catch {
    res.status(500).json({ error: "Failed to log food" });
  }
});

router.delete("/food/log/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.delete(foodLogsTable)
      .where(and(eq(foodLogsTable.id, String(req.params.id)), eq(foodLogsTable.userId, req.userId!)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete food log" });
  }
});

// ── DB Search ─────────────────────────────────────────────────────────────────
router.get("/food/search", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { q, limit = "15" } = req.query as { q: string; limit?: string };
    if (!q || q.length < 2) { res.json({ items: [] }); return; }
    const items = await db.select().from(foodItemsTable)
      .where(ilike(foodItemsTable.foodNameEn, `%${q}%`))
      .limit(parseInt(limit));
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Food search failed" });
  }
});

// ── Personal History Search (search in user's own logs — ZERO AI cost) ───────
router.get("/food/history-search", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { q } = req.query as { q: string };
    if (!q || q.length < 1) { res.json({ items: [] }); return; }

    // Get distinct foods from user's history matching the query
    const rows = await db.select({
      foodNameEn: foodLogsTable.foodNameEn,
      calories: sql<number>`AVG(${foodLogsTable.calories}::numeric)`.as("calories"),
      proteinG: sql<number>`AVG(${foodLogsTable.proteinG}::numeric)`.as("proteinG"),
      carbsG: sql<number>`AVG(${foodLogsTable.carbsG}::numeric)`.as("carbsG"),
      fatG: sql<number>`AVG(${foodLogsTable.fatG}::numeric)`.as("fatG"),
      fiberG: sql<number>`AVG(${foodLogsTable.fiberG}::numeric)`.as("fiberG"),
      calciumMg: sql<number>`AVG(${foodLogsTable.calciumMg}::numeric)`.as("calciumMg"),
      vitaminB12Mcg: sql<number>`AVG(${foodLogsTable.vitaminB12Mcg}::numeric)`.as("vitaminB12Mcg"),
      vitaminCMg: sql<number>`AVG(${foodLogsTable.vitaminCMg}::numeric)`.as("vitaminCMg"),
      ironMg: sql<number>`AVG(${foodLogsTable.ironMg}::numeric)`.as("ironMg"),
      count: sql<number>`COUNT(*)`.as("count"),
      lastEaten: sql<Date>`MAX(${foodLogsTable.loggedAt})`.as("lastEaten"),
    })
      .from(foodLogsTable)
      .where(and(
        eq(foodLogsTable.userId, req.userId!),
        ilike(foodLogsTable.foodNameEn, `%${q}%`)
      ))
      .groupBy(foodLogsTable.foodNameEn)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    res.json({ items: rows });
  } catch {
    res.status(500).json({ error: "History search failed" });
  }
});

// ── Favorites — top 12 most frequently eaten foods ────────────────────────────
router.get("/food/favorites", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db.select({
      foodNameEn: foodLogsTable.foodNameEn,
      calories: sql<number>`AVG(${foodLogsTable.calories}::numeric)`.as("calories"),
      proteinG: sql<number>`AVG(${foodLogsTable.proteinG}::numeric)`.as("proteinG"),
      carbsG: sql<number>`AVG(${foodLogsTable.carbsG}::numeric)`.as("carbsG"),
      fatG: sql<number>`AVG(${foodLogsTable.fatG}::numeric)`.as("fatG"),
      fiberG: sql<number>`AVG(${foodLogsTable.fiberG}::numeric)`.as("fiberG"),
      calciumMg: sql<number>`AVG(${foodLogsTable.calciumMg}::numeric)`.as("calciumMg"),
      vitaminB12Mcg: sql<number>`AVG(${foodLogsTable.vitaminB12Mcg}::numeric)`.as("vitaminB12Mcg"),
      vitaminCMg: sql<number>`AVG(${foodLogsTable.vitaminCMg}::numeric)`.as("vitaminCMg"),
      ironMg: sql<number>`AVG(${foodLogsTable.ironMg}::numeric)`.as("ironMg"),
      count: sql<number>`COUNT(*)`.as("count"),
      lastEaten: sql<Date>`MAX(${foodLogsTable.loggedAt})`.as("lastEaten"),
    })
      .from(foodLogsTable)
      .where(eq(foodLogsTable.userId, req.userId!))
      .groupBy(foodLogsTable.foodNameEn)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(12);

    res.json({ favorites: rows });
  } catch {
    res.status(500).json({ error: "Failed to get favorites" });
  }
});

// ── AI Food Scan — 4-level lookup: History → DB → AI-Cache → Gemini AI ───────
// This is the core of AI cost reduction: personal history is checked FIRST
router.post("/food/scan", requireAuth, planAiRateLimit("food_scan", { free: 5, paid: 50 }), async (req: AuthRequest, res) => {
  try {
    const { foodName, imageBase64, mimeType } = req.body as { foodName?: string; imageBase64?: string; mimeType?: string };
    const searchTerm = foodName?.toLowerCase().trim();

    if (!searchTerm && !imageBase64) {
      res.status(400).json({ error: "foodName or imageBase64 is required" });
      return;
    }

    // ── Level 1: Personal History (ZERO AI cost — fastest) ──────────────────
    if (searchTerm) {
      const [historyMatch] = await db.select({
        foodNameEn: foodLogsTable.foodNameEn,
        calories: sql<number>`AVG(${foodLogsTable.calories}::numeric)`.as("calories"),
        proteinG: sql<number>`AVG(${foodLogsTable.proteinG}::numeric)`.as("proteinG"),
        carbsG: sql<number>`AVG(${foodLogsTable.carbsG}::numeric)`.as("carbsG"),
        fatG: sql<number>`AVG(${foodLogsTable.fatG}::numeric)`.as("fatG"),
        fiberG: sql<number>`AVG(${foodLogsTable.fiberG}::numeric)`.as("fiberG"),
        calciumMg: sql<number>`AVG(${foodLogsTable.calciumMg}::numeric)`.as("calciumMg"),
        vitaminB12Mcg: sql<number>`AVG(${foodLogsTable.vitaminB12Mcg}::numeric)`.as("vitaminB12Mcg"),
        vitaminCMg: sql<number>`AVG(${foodLogsTable.vitaminCMg}::numeric)`.as("vitaminCMg"),
        ironMg: sql<number>`AVG(${foodLogsTable.ironMg}::numeric)`.as("ironMg"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
        .from(foodLogsTable)
        .where(and(
          eq(foodLogsTable.userId, req.userId!),
          ilike(foodLogsTable.foodNameEn, searchTerm)
        ))
        .groupBy(foodLogsTable.foodNameEn)
        .limit(1);

      if (historyMatch) {
        res.json({
          result: {
            foodNameEn: historyMatch.foodNameEn,
            calories: Math.round(Number(historyMatch.calories)),
            proteinG: Math.round(Number(historyMatch.proteinG || 0) * 10) / 10,
            carbsG: Math.round(Number(historyMatch.carbsG || 0) * 10) / 10,
            fatG: Math.round(Number(historyMatch.fatG || 0) * 10) / 10,
            fiberG: Math.round(Number(historyMatch.fiberG || 0) * 10) / 10,
            servingSizeG: 100,
            servingDescription: "100g / 1 serving",
            category: "food",
            dietaryTags: [],
            vitamins: {
              ...(historyMatch.calciumMg    ? { calcium_mg:     Math.round(Number(historyMatch.calciumMg) * 10) / 10 }    : {}),
              ...(historyMatch.vitaminB12Mcg ? { vitaminB12_mcg: Math.round(Number(historyMatch.vitaminB12Mcg) * 100) / 100 } : {}),
              ...(historyMatch.vitaminCMg   ? { vitaminC_mg:    Math.round(Number(historyMatch.vitaminCMg) * 10) / 10 }   : {}),
              ...(historyMatch.ironMg       ? { iron_mg:        Math.round(Number(historyMatch.ironMg) * 10) / 10 }       : {}),
            },
            healthTip: `You have eaten this ${historyMatch.count} times before — data loaded from your history.`,
          },
          fromHistory: true,
          fromDb: false,
          fromCache: false,
          historyCount: Number(historyMatch.count),
        }); return;
      }

      // ── Level 2: Main Curated DB ─────────────────────────────────────────
      const [dbItem] = await db.select().from(foodItemsTable)
        .where(ilike(foodItemsTable.foodNameEn, `%${searchTerm}%`))
        .limit(1);

      if (dbItem) {
        res.json({
          result: {
            foodNameEn: dbItem.foodNameEn,
            calories: Number(dbItem.calories),
            proteinG: Number(dbItem.proteinG || 0),
            carbsG: Number(dbItem.carbsG || 0),
            fatG: Number(dbItem.fatG || 0),
            fiberG: Number(dbItem.fiberG || 0),
            sodiumMg: Number(dbItem.sodiumMg || 0),
            servingSizeG: Number(dbItem.servingSizeG || 100),
            servingDescription: dbItem.servingDescription || "100g",
            category: dbItem.category || "food",
            dietaryTags: (dbItem.dietaryTags as string[]) || [],
            vitamins: {
              vitaminC_mg:   dbItem.vitaminCMg   ? Number(dbItem.vitaminCMg)   : undefined,
              vitaminB12_mcg: dbItem.vitaminB12Mcg ? Number(dbItem.vitaminB12Mcg) : undefined,
              vitaminD_mcg:  dbItem.vitaminDMcg  ? Number(dbItem.vitaminDMcg)  : undefined,
              calcium_mg:    dbItem.calciumMg    ? Number(dbItem.calciumMg)    : undefined,
              iron_mg:       dbItem.ironMg       ? Number(dbItem.ironMg)       : undefined,
              potassium_mg:  dbItem.potassiumMg  ? Number(dbItem.potassiumMg)  : undefined,
            },
          },
          fromDb: true,
          fromHistory: false,
          fromCache: false,
        }); return;
      }

      // ── Level 3: AI-Discovered Foods Cache (saved from previous AI calls) ─
      const [cached] = await db.select().from(foodScanCacheTable)
        .where(ilike(foodScanCacheTable.foodNameEn, searchTerm));
      if (cached) {
        const newHitCount = cached.hitCount + 1;
        await db.update(foodScanCacheTable)
          .set({ hitCount: newHitCount, lastUsedAt: new Date() })
          .where(eq(foodScanCacheTable.id, cached.id));
        // Auto-promote if threshold reached
        void maybeAutoPromote(cached.id, newHitCount, cached.aiResult as Record<string, unknown>, cached.foodNameEn);
        res.json({ result: cached.aiResult, fromCache: true, fromDb: false, fromHistory: false, hitCount: newHitCount }); return;
      }
    }

    // ── Level 4: AI fallback ──────────────────────────────────────────────────
    // Text search → NVIDIA LLaMA 3.3 70B (fast, no quota issues)
    // Image scan → Gemini (vision support needed, food images only, no personal data)
    // IMPORTANT: If AI fails (key missing / server down), return a generic estimate
    // so the user can still log food rather than seeing a hard error.
    let result: Record<string, unknown>;

    if (searchTerm) {
      const prompt = `You are a certified Indian dietitian. The user typed "${searchTerm}" — this could be in Hindi, Hinglish, regional language or English. Identify the food and provide complete nutrition data.

Return ONLY a valid JSON object (no markdown) with these exact fields:
{
  "foodNameEn": "string (English name of the food)",
  "calories": number (per 100g),
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "fiberG": number,
  "sodiumMg": number,
  "sugarG": number,
  "servingSizeG": number,
  "servingDescription": "string (e.g. 1 bowl = 200g)",
  "category": "string (grain/protein/vegetable/fruit/dairy/snack/beverage/sweet)",
  "dietaryTags": ["veg" or "nonveg" or "vegan" or "jain" or "gluten-free"],
  "vitamins": {
    "vitaminA_mcg": number,
    "vitaminC_mg": number,
    "vitaminD_mcg": number,
    "vitaminB12_mcg": number,
    "iron_mg": number,
    "calcium_mg": number,
    "potassium_mg": number,
    "zinc_mg": number
  },
  "glycemicIndex": number or null,
  "healthTip": "1 sentence health tip in English"
}`;

      try {
        const jsonStr = await callAI("food_ai", [{ role: "user", content: prompt }], { maxTokens: 1500, temperature: 0.3 });
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { foodNameEn: searchTerm, calories: 150, proteinG: 4, carbsG: 25, fatG: 3, fiberG: 2, servingSizeG: 100, servingDescription: "~100g (estimate)", category: "food", dietaryTags: [], vitamins: {}, healthTip: "Nutrition values are estimated — please verify." };
      } catch {
        // AI unavailable — return a generic estimate so user can still log food
        result = {
          foodNameEn: searchTerm,
          calories: 150,
          proteinG: 4,
          carbsG: 25,
          fatG: 3,
          fiberG: 2,
          sodiumMg: 100,
          sugarG: 2,
          servingSizeG: 100,
          servingDescription: "~100g (estimated)",
          category: "food",
          dietaryTags: [],
          vitamins: {},
          glycemicIndex: null,
          healthTip: "AI analysis unavailable — nutrition values are estimated. Please update manually if needed.",
          _aiEstimate: true,
        };
      }
    } else if (imageBase64) {
      // Image-based food scan — Gemini only (NVIDIA LLaMA does not support vision)
      const geminiKey = process.env["GOOGLE_GEMINI_API_KEY"];
      if (!geminiKey) { res.status(503).json({ error: "Image AI service not configured" }); return; }

      const promptText = `You are a certified Indian dietitian. Identify this food from the image and provide complete nutrition data. Return ONLY valid JSON with: foodNameEn, calories (per 100g), proteinG, carbsG, fatG, fiberG, sodiumMg, sugarG, servingSizeG, servingDescription, category, dietaryTags (array), vitamins (object with vitaminA_mcg, vitaminC_mg, vitaminD_mcg, vitaminB12_mcg, iron_mg, calcium_mg, potassium_mg, zinc_mg), glycemicIndex, healthTip.`;
      const geminiBody = { contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }] }] };
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
      );
      const geminiData = await geminiRes.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { foodNameEn: "Unknown Food", calories: 100, proteinG: 0, carbsG: 25, fatG: 2, fiberG: 0, servingSizeG: 100, servingDescription: "100g", category: "food", dietaryTags: [], vitamins: {} };
    } else {
      res.status(400).json({ error: "searchTerm or imageBase64 required" }); return;
    }

    // Save to AI-discovered foods cache (with fuzzy dedup + auto-promote)
    if (searchTerm) {
      const normalizedSearch = normalizeFoodName(searchTerm);
      // Load recent cache entries to check for fuzzy duplicates (last 200)
      const recentEntries = await db.select({
        id: foodScanCacheTable.id,
        foodNameEn: foodScanCacheTable.foodNameEn,
        nameNormalized: foodScanCacheTable.nameNormalized,
        hitCount: foodScanCacheTable.hitCount,
        isPromoted: foodScanCacheTable.isPromoted,
        aiResult: foodScanCacheTable.aiResult,
      }).from(foodScanCacheTable).orderBy(desc(foodScanCacheTable.lastUsedAt)).limit(200);

      const similarEntry = recentEntries.find((e) =>
        isSimilarName(normalizedSearch, e.nameNormalized || normalizeFoodName(e.foodNameEn))
      );

      if (similarEntry) {
        // Increment hit_count of existing similar entry
        const newHitCount = (similarEntry.hitCount || 1) + 1;
        await db.update(foodScanCacheTable).set({
          hitCount: newHitCount,
          lastUsedAt: new Date(),
        }).where(eq(foodScanCacheTable.id, similarEntry.id));
        // Auto-promote if threshold reached
        void maybeAutoPromote(similarEntry.id, newHitCount, similarEntry.aiResult as Record<string, unknown>, similarEntry.foodNameEn);
      } else {
        // Insert new entry
        const sourceAi = process.env.GEMINI_API_KEY ? "gemini" : "nvidia";
        const [inserted] = await db.insert(foodScanCacheTable).values({
          foodNameEn: searchTerm,
          nameNormalized: normalizedSearch,
          aiResult: result,
          sourceAi,
          hitCount: 1,
        }).onConflictDoNothing().returning({ id: foodScanCacheTable.id, hitCount: foodScanCacheTable.hitCount });
        // Auto-promote if already at threshold (unlikely but safe)
        if (inserted) void maybeAutoPromote(inserted.id, inserted.hitCount ?? 1, result, searchTerm);
      }
    }

    res.json({ result, fromCache: false, fromDb: false, fromHistory: false });
  } catch (err) {
    console.error("Food scan error:", err);
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
      totalFiberG: logs.reduce((sum, l) => sum + Number(l.fiberG || 0), 0),
      totalCalciumMg: logs.reduce((sum, l) => sum + Number(l.calciumMg || 0), 0),
      totalVitaminB12Mcg: logs.reduce((sum, l) => sum + Number(l.vitaminB12Mcg || 0), 0),
      totalVitaminCMg: logs.reduce((sum, l) => sum + Number(l.vitaminCMg || 0), 0),
      totalIronMg: logs.reduce((sum, l) => sum + Number(l.ironMg || 0), 0),
      mealCount: logs.length,
    };
    res.json({ summary });
  } catch {
    res.status(500).json({ error: "Failed to fetch food summary" });
  }
});

// ── Weekly Nutrition Summary (last 7 days) ────────────────────────────────────
router.get("/food/weekly-nutrition", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    const days: { date: string; totalCalories: number; totalProteinG: number; totalCarbsG: number; totalFatG: number; totalCalciumMg: number; totalVitaminB12Mcg: number; totalVitaminCMg: number; totalIronMg: number; mealCount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const logs = await db.select().from(foodLogsTable).where(
        and(
          eq(foodLogsTable.userId, req.userId!),
          gte(foodLogsTable.loggedAt, new Date(dateStr + "T00:00:00Z")),
          lte(foodLogsTable.loggedAt, new Date(dateStr + "T23:59:59Z"))
        )
      );
      days.push({
        date: dateStr,
        totalCalories: logs.reduce((s, l) => s + Number(l.calories), 0),
        totalProteinG: logs.reduce((s, l) => s + Number(l.proteinG || 0), 0),
        totalCarbsG: logs.reduce((s, l) => s + Number(l.carbsG || 0), 0),
        totalFatG: logs.reduce((s, l) => s + Number(l.fatG || 0), 0),
        totalCalciumMg: logs.reduce((s, l) => s + Number(l.calciumMg || 0), 0),
        totalVitaminB12Mcg: logs.reduce((s, l) => s + Number(l.vitaminB12Mcg || 0), 0),
        totalVitaminCMg: logs.reduce((s, l) => s + Number(l.vitaminCMg || 0), 0),
        totalIronMg: logs.reduce((s, l) => s + Number(l.ironMg || 0), 0),
        mealCount: logs.length,
      });
    }
    const totals = days.reduce((acc, d) => ({
      totalCalories: acc.totalCalories + d.totalCalories,
      totalProteinG: acc.totalProteinG + d.totalProteinG,
      totalCarbsG: acc.totalCarbsG + d.totalCarbsG,
      totalFatG: acc.totalFatG + d.totalFatG,
      totalCalciumMg: acc.totalCalciumMg + d.totalCalciumMg,
      totalVitaminB12Mcg: acc.totalVitaminB12Mcg + d.totalVitaminB12Mcg,
      totalVitaminCMg: acc.totalVitaminCMg + d.totalVitaminCMg,
      totalIronMg: acc.totalIronMg + d.totalIronMg,
    }), { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0, totalCalciumMg: 0, totalVitaminB12Mcg: 0, totalVitaminCMg: 0, totalIronMg: 0 });
    res.json({ days, weeklyTotals: totals, weeklyAverages: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round((v / 7) * 10) / 10])) });
  } catch {
    res.status(500).json({ error: "Failed to fetch weekly nutrition" });
  }
});

// ── Monthly Nutrition Summary (last 30 days, grouped by week) ────────────────
router.get("/food/monthly-nutrition", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    const weeks: Array<{
      weekLabel: string; startDate: string; endDate: string;
      totalCalories: number; totalProteinG: number; totalCarbsG: number; totalFatG: number;
      totalCalciumMg: number; totalVitaminB12Mcg: number; totalVitaminCMg: number; totalIronMg: number;
      mealCount: number;
    }> = [];

    for (let w = 3; w >= 0; w--) {
      const endD = new Date(today);
      endD.setDate(endD.getDate() - w * 7);
      const startD = new Date(endD);
      startD.setDate(startD.getDate() - 6);
      const startStr = startD.toISOString().slice(0, 10);
      const endStr = endD.toISOString().slice(0, 10);

      const logs = await db.select().from(foodLogsTable).where(
        and(
          eq(foodLogsTable.userId, req.userId!),
          gte(foodLogsTable.loggedAt, new Date(startStr + "T00:00:00Z")),
          lte(foodLogsTable.loggedAt, new Date(endStr + "T23:59:59Z"))
        )
      );

      const weekNum = 4 - w;
      weeks.push({
        weekLabel: `Week ${weekNum} (${startD.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${endD.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`,
        startDate: startStr,
        endDate: endStr,
        totalCalories: Math.round(logs.reduce((s, l) => s + Number(l.calories), 0)),
        totalProteinG: Math.round(logs.reduce((s, l) => s + Number(l.proteinG || 0), 0) * 10) / 10,
        totalCarbsG: Math.round(logs.reduce((s, l) => s + Number(l.carbsG || 0), 0) * 10) / 10,
        totalFatG: Math.round(logs.reduce((s, l) => s + Number(l.fatG || 0), 0) * 10) / 10,
        totalCalciumMg: Math.round(logs.reduce((s, l) => s + Number(l.calciumMg || 0), 0) * 10) / 10,
        totalVitaminB12Mcg: Math.round(logs.reduce((s, l) => s + Number(l.vitaminB12Mcg || 0), 0) * 100) / 100,
        totalVitaminCMg: Math.round(logs.reduce((s, l) => s + Number(l.vitaminCMg || 0), 0) * 10) / 10,
        totalIronMg: Math.round(logs.reduce((s, l) => s + Number(l.ironMg || 0), 0) * 10) / 10,
        mealCount: logs.length,
      });
    }

    const monthlyTotals = weeks.reduce((acc, w) => ({
      totalCalories: acc.totalCalories + w.totalCalories,
      totalProteinG: Math.round((acc.totalProteinG + w.totalProteinG) * 10) / 10,
      totalCarbsG: Math.round((acc.totalCarbsG + w.totalCarbsG) * 10) / 10,
      totalFatG: Math.round((acc.totalFatG + w.totalFatG) * 10) / 10,
      totalCalciumMg: Math.round((acc.totalCalciumMg + w.totalCalciumMg) * 10) / 10,
      totalVitaminB12Mcg: Math.round((acc.totalVitaminB12Mcg + w.totalVitaminB12Mcg) * 100) / 100,
      totalVitaminCMg: Math.round((acc.totalVitaminCMg + w.totalVitaminCMg) * 10) / 10,
      totalIronMg: Math.round((acc.totalIronMg + w.totalIronMg) * 10) / 10,
    }), { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0, totalCalciumMg: 0, totalVitaminB12Mcg: 0, totalVitaminCMg: 0, totalIronMg: 0 });

    res.json({
      weeks,
      monthlyTotals,
      monthlyAverages: Object.fromEntries(Object.entries(monthlyTotals).map(([k, v]) => [k, Math.round((v / 30) * 100) / 100])),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch monthly nutrition" });
  }
});

// ── Weather-based Food Suggestions ───────────────────────────────────────────
router.post("/food/weather-suggestions", requireAuth, aiRateLimit("weather_suggestions", 4), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // ── 6-hour server-side cache (per user) — prevents AI call on every food screen open ──
    const cacheKey = `weather:sug:${userId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.json({ ...JSON.parse(cached), fromCache: true });
      return;
    }

    const { city, state } = req.body as { city?: string; state?: string };

    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);

    const profileData = profile as unknown as Record<string, string>;
    const userCity = profileData?.city ?? city ?? "India";
    const userState = profileData?.state ?? state ?? "";

    const weather = await getWeatherContext(userCity, userState || undefined);

    const prompt = `You are a certified Indian dietitian. Based on the current weather and season, suggest 6 ideal Indian foods for an Indian person.

Weather & Season Context: ${weather}

Return ONLY valid JSON:
{
  "weatherContext": "short description of current weather/season",
  "season": "Winter|Summer|Monsoon|Autumn",
  "suggestions": [
    {
      "name": "Food name in English",
      "nameHindi": "Hindi name",
      "emoji": "single food emoji",
      "reason": "Why this food is ideal right now (1 sentence in English)",
      "calories": number,
      "benefit": "Main health benefit",
      "category": "breakfast|lunch|dinner|snack|beverage",
      "isSeasonalSpecial": true
    }
  ],
  "weatherTip": "1 practical weather-appropriate health tip in English"
}`;

    try {
      const jsonStr = await callAI("food_ai", [{ role: "user", content: prompt }], { maxTokens: 1200 });
      const result = JSON.parse(jsonStr);
      const response = { ...result, weatherContext: weather, fromCache: false };
      cache.set(cacheKey, JSON.stringify(response), WEATHER_CACHE_TTL);
      res.json(response);
    } catch {
      const month = new Date().getMonth() + 1;
      let season = "Autumn";
      let suggestions: unknown[] = [];

      if ([12, 1, 2].includes(month)) {
        season = "Winter";
        suggestions = [
          { name: "Sarson Ka Saag", nameHindi: "सरसों का साग", emoji: "🥬", reason: "Keeps the body warm during winter", calories: 120, benefit: "Iron & Vitamin A", category: "lunch", isSeasonalSpecial: true },
          { name: "Makki Di Roti", nameHindi: "मक्की की रोटी", emoji: "🌽", reason: "Provides sustained energy during winter", calories: 180, benefit: "Complex carbs", category: "lunch", isSeasonalSpecial: true },
          { name: "Tilgud Laddoo", nameHindi: "तिलगुड लड्डू", emoji: "🍡", reason: "Sesame seeds help warm the body", calories: 220, benefit: "Calcium & healthy fats", category: "snack", isSeasonalSpecial: true },
          { name: "Masala Chai", nameHindi: "मसाला चाय", emoji: "☕", reason: "Ginger and cardamom are ideal for winter", calories: 60, benefit: "Anti-inflammatory ginger", category: "beverage", isSeasonalSpecial: true },
          { name: "Gajar Halwa", nameHindi: "गाजर का हलवा", emoji: "🥕", reason: "Carrots peak in winter and are rich in Vitamin A", calories: 300, benefit: "Vitamin A & antioxidants", category: "snack", isSeasonalSpecial: true },
          { name: "Moong Dal Khichdi", nameHindi: "मूंग दाल खिचड़ी", emoji: "🍲", reason: "Easy to digest, helps sustain energy in winter", calories: 280, benefit: "Protein & minerals", category: "dinner", isSeasonalSpecial: false },
        ];
      } else if ([3, 4, 5].includes(month)) {
        season = "Summer";
        suggestions = [
          { name: "Aam Panna", nameHindi: "आम पन्ना", emoji: "🥭", reason: "Helps prevent heatstroke during summer", calories: 80, benefit: "Electrolytes & Vitamin C", category: "beverage", isSeasonalSpecial: true },
          { name: "Lassi", nameHindi: "लस्सी", emoji: "🥛", reason: "Keeps the body cool and refreshed", calories: 150, benefit: "Probiotics & calcium", category: "beverage", isSeasonalSpecial: true },
          { name: "Watermelon / Tarbuz", nameHindi: "तरबूज", emoji: "🍉", reason: "95% water content, keeps the body hydrated", calories: 30, benefit: "Hydration & lycopene", category: "snack", isSeasonalSpecial: true },
          { name: "Coconut Water", nameHindi: "नारियल पानी", emoji: "🥥", reason: "Natural electrolytes, ideal for summer", calories: 45, benefit: "Potassium & hydration", category: "beverage", isSeasonalSpecial: true },
          { name: "Raita", nameHindi: "रायता", emoji: "🥗", reason: "Yogurt cools the body from within", calories: 90, benefit: "Probiotics & cooling", category: "lunch", isSeasonalSpecial: true },
          { name: "Sattu Sharbat", nameHindi: "सत्तू शर्बत", emoji: "🧊", reason: "A traditional summer drink from Bihar and UP", calories: 120, benefit: "Protein & energy", category: "beverage", isSeasonalSpecial: true },
        ];
      } else if ([6, 7, 8, 9].includes(month)) {
        season = "Monsoon";
        suggestions = [
          { name: "Khichdi", nameHindi: "खिचड़ी", emoji: "🍲", reason: "Best for the digestive system during monsoon", calories: 280, benefit: "Easy to digest & warming", category: "dinner", isSeasonalSpecial: true },
          { name: "Ginger Tea", nameHindi: "अदरक की चाय", emoji: "☕", reason: "Boosts immunity during the monsoon season", calories: 50, benefit: "Anti-inflammatory", category: "beverage", isSeasonalSpecial: true },
          { name: "Haldi Doodh", nameHindi: "हल्दी दूध", emoji: "🥛", reason: "Protects against infections during monsoon", calories: 120, benefit: "Immunity & anti-bacterial", category: "beverage", isSeasonalSpecial: true },
          { name: "Corn Bhutta", nameHindi: "भुट्टा", emoji: "🌽", reason: "A classic Indian monsoon-season snack!", calories: 130, benefit: "Fiber & antioxidants", category: "snack", isSeasonalSpecial: true },
          { name: "Pakora", nameHindi: "पकोड़ा", emoji: "🍘", reason: "The ultimate Indian comfort food during rain", calories: 200, benefit: "Energy boost (occasionally)", category: "snack", isSeasonalSpecial: true },
          { name: "Moong Dal Soup", nameHindi: "मूंग दाल सूप", emoji: "🍵", reason: "Light and nutritious, easy on digestion during monsoon", calories: 150, benefit: "Protein & easy digestion", category: "dinner", isSeasonalSpecial: true },
        ];
      } else {
        season = "Autumn";
        suggestions = [
          { name: "Pomegranate", nameHindi: "अनार", emoji: "🍎", reason: "Peak season in autumn, excellent blood purifier", calories: 80, benefit: "Iron & antioxidants", category: "snack", isSeasonalSpecial: true },
          { name: "Guava", nameHindi: "अमरूद", emoji: "🍐", reason: "Rich in Vitamin C, great for boosting immunity", calories: 60, benefit: "Vitamin C & fiber", category: "snack", isSeasonalSpecial: true },
          { name: "Apple", nameHindi: "सेब", emoji: "🍏", reason: "Fresh autumn apples — an apple a day keeps the doctor away", calories: 80, benefit: "Fiber & quercetin", category: "snack", isSeasonalSpecial: true },
          { name: "Pumpkin Sabzi", nameHindi: "कद्दू की सब्जी", emoji: "🎃", reason: "Highly nutritious seasonal vegetable", calories: 90, benefit: "Beta-carotene & fiber", category: "dinner", isSeasonalSpecial: true },
          { name: "Bajra Roti", nameHindi: "बाजरे की रोटी", emoji: "🫓", reason: "As winter begins, bajra helps keep the body warm", calories: 170, benefit: "Iron & magnesium", category: "lunch", isSeasonalSpecial: false },
          { name: "Moong Dal Khichdi", nameHindi: "मूंग दाल खिचड़ी", emoji: "🍲", reason: "Light and nutritious, supports digestion in autumn", calories: 250, benefit: "Protein & minerals", category: "lunch", isSeasonalSpecial: false },
        ];
      }

      res.json({
        weatherContext: weather,
        season,
        suggestions,
        weatherTip: "Eat according to the season — seasonal foods are the most nutritious! 🌿",
        fallback: true,
      });
    }
  } catch (err) {
    console.error("Weather suggestions error:", err);
    res.status(500).json({ error: "Failed to get weather suggestions" });
  }
});

export default router;
