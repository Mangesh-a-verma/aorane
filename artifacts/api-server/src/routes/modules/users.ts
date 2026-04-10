import { Router } from "express";
import { db, usersTable, userProfilesTable, userPreferencesTable, userPrivacySettingsTable, userMedicalConditionsTable, userHealthGoalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import type { AuthRequest } from "../../middlewares/user-auth";

const router = Router();

router.get("/users/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, req.userId!));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
    const conditions = await db.select().from(userMedicalConditionsTable).where(eq(userMedicalConditionsTable.userId, req.userId!));
    const [goals] = await db.select().from(userHealthGoalsTable).where(eq(userHealthGoalsTable.userId, req.userId!));

    res.json({ profile, user: { plan: user?.plan, phone: user?.phone, email: user?.email }, preferences: prefs, conditions, goals });
  } catch {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.patch("/users/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      fullName, dateOfBirth, gender, heightCm, weightKg, bloodGroup,
      foodPreference, foodAllergies, workProfile, activityLevel,
      exerciseFrequency, exerciseTypes, sleepHoursAvg, wakeTime,
      sleepTime, stressLevelSelf, profilePhotoUrl,
    } = req.body as Record<string, unknown>;

    const bmi = heightCm && weightKg
      ? Number((Number(weightKg) / Math.pow(Number(heightCm) / 100, 2)).toFixed(1))
      : undefined;

    const updateData: Record<string, unknown> = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (gender !== undefined) updateData.gender = gender;
    if (heightCm !== undefined) updateData.heightCm = String(heightCm);
    if (weightKg !== undefined) updateData.weightKg = String(weightKg);
    if (bmi !== undefined) updateData.bmi = String(bmi);
    if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
    if (foodPreference !== undefined) updateData.foodPreference = foodPreference;
    if (foodAllergies !== undefined) updateData.foodAllergies = foodAllergies;
    if (workProfile !== undefined) updateData.workProfile = workProfile;
    if (activityLevel !== undefined) updateData.activityLevel = activityLevel;
    if (exerciseFrequency !== undefined) updateData.exerciseFrequency = exerciseFrequency;
    if (exerciseTypes !== undefined) updateData.exerciseTypes = exerciseTypes;
    if (sleepHoursAvg !== undefined) updateData.sleepHoursAvg = String(sleepHoursAvg);
    if (wakeTime !== undefined) updateData.wakeTime = wakeTime;
    if (sleepTime !== undefined) updateData.sleepTime = sleepTime;
    if (stressLevelSelf !== undefined) updateData.stressLevelSelf = stressLevelSelf;
    if (profilePhotoUrl !== undefined) updateData.profilePhotoUrl = profilePhotoUrl;

    const [updated] = await db
      .update(userProfilesTable)
      .set(updateData as Parameters<typeof db.update>[0] extends infer T ? T : never)
      .where(eq(userProfilesTable.userId, req.userId!))
      .returning();

    res.json({ profile: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.patch("/users/onboarding/step", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { step } = req.body as { step: number };
    await db.update(userProfilesTable).set({ onboardingStep: step }).where(eq(userProfilesTable.userId, req.userId!));
    res.json({ success: true, step });
  } catch {
    res.status(500).json({ error: "Failed to update onboarding step" });
  }
});

router.post("/users/medical-conditions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { conditions } = req.body as { conditions: Array<{ condition: string; conditionType?: string }> };
    await db.delete(userMedicalConditionsTable).where(eq(userMedicalConditionsTable.userId, req.userId!));
    if (conditions?.length) {
      await db.insert(userMedicalConditionsTable).values(
        conditions.map((c) => ({ userId: req.userId!, ...c }))
      );
    }
    const saved = await db.select().from(userMedicalConditionsTable).where(eq(userMedicalConditionsTable.userId, req.userId!));
    res.json({ conditions: saved });
  } catch {
    res.status(500).json({ error: "Failed to save conditions" });
  }
});

router.post("/users/health-goals", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { primaryGoal, currentWeightKg, targetWeightKg, targetDate, secondaryGoals } = req.body as {
      primaryGoal: string; currentWeightKg?: number; targetWeightKg?: number; targetDate?: string; secondaryGoals?: string[];
    };
    const existing = await db.select().from(userHealthGoalsTable).where(eq(userHealthGoalsTable.userId, req.userId!));
    if (existing.length) {
      const [updated] = await db.update(userHealthGoalsTable).set({
        primaryGoal,
        currentWeightKg: currentWeightKg ? String(currentWeightKg) : undefined,
        targetWeightKg: targetWeightKg ? String(targetWeightKg) : undefined,
        targetDate,
        secondaryGoals,
      }).where(eq(userHealthGoalsTable.userId, req.userId!)).returning();
      res.json({ goals: updated });
    } else {
      const [created] = await db.insert(userHealthGoalsTable).values({
        userId: req.userId!,
        primaryGoal,
        currentWeightKg: currentWeightKg ? String(currentWeightKg) : undefined,
        targetWeightKg: targetWeightKg ? String(targetWeightKg) : undefined,
        targetDate,
        secondaryGoals,
      }).returning();
      res.json({ goals: created });
    }
  } catch {
    res.status(500).json({ error: "Failed to save goals" });
  }
});

router.get("/users/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
    res.json({ preferences: prefs });
  } catch {
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.patch("/users/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowedFields = [
      "languageCode", "darkMode", "waterGoalGlasses", "calorieGoal",
      "notificationsEnabled", "medicineReminders", "waterReminders",
      "weeklyReportEmail", "appLockEnabled", "appLockMethod", "adsEnabled",
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    const [updated] = await db.update(userPreferencesTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never).where(eq(userPreferencesTable.userId, req.userId!)).returning();
    res.json({ preferences: updated });
  } catch {
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

router.get("/users/privacy", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [privacy] = await db.select().from(userPrivacySettingsTable).where(eq(userPrivacySettingsTable.userId, req.userId!));
    res.json({ privacy });
  } catch {
    res.status(500).json({ error: "Failed to fetch privacy settings" });
  }
});

router.patch("/users/privacy", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowedFields = [
      "shareBasicProfile", "shareBmi", "shareExerciseData", "shareWaterIntake",
      "shareSleepData", "shareStressLevel", "shareMedicineDetails",
      "shareMedicalConditions", "shareFoodData",
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    const [updated] = await db.update(userPrivacySettingsTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never).where(eq(userPrivacySettingsTable.userId, req.userId!)).returning();
    res.json({ privacy: updated });
  } catch {
    res.status(500).json({ error: "Failed to update privacy settings" });
  }
});

export default router;
