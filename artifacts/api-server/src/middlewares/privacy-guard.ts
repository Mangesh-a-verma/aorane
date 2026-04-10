import { db, userPrivacySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type SensitiveField =
  | "basicProfile"
  | "bmi"
  | "exerciseData"
  | "waterIntake"
  | "sleepData"
  | "stressLevel"
  | "medicineDetails"
  | "medicalConditions"
  | "foodData";

const FIELD_TO_COLUMN: Record<SensitiveField, string> = {
  basicProfile: "share_basic_profile",
  bmi: "share_bmi",
  exerciseData: "share_exercise_data",
  waterIntake: "share_water_intake",
  sleepData: "share_sleep_data",
  stressLevel: "share_stress_level",
  medicineDetails: "share_medicine_details",
  medicalConditions: "share_medical_conditions",
  foodData: "share_food_data",
};

export async function checkPrivacy(
  targetUserId: string,
  field: SensitiveField
): Promise<boolean> {
  try {
    const [settings] = await db
      .select()
      .from(userPrivacySettingsTable)
      .where(eq(userPrivacySettingsTable.userId, targetUserId));
    if (!settings) return false;
    const key = field + "Share" as keyof typeof settings;
    const columnKey = field === "basicProfile" ? "shareBasicProfile"
      : field === "bmi" ? "shareBmi"
      : field === "exerciseData" ? "shareExerciseData"
      : field === "waterIntake" ? "shareWaterIntake"
      : field === "sleepData" ? "shareSleepData"
      : field === "stressLevel" ? "shareStressLevel"
      : field === "medicineDetails" ? "shareMedicineDetails"
      : field === "medicalConditions" ? "shareMedicalConditions"
      : "shareFoodData";
    return (settings as Record<string, unknown>)[columnKey] === true;
  } catch {
    return false;
  }
}

export function stripPrivateFields<T extends Record<string, unknown>>(
  data: T,
  privacy: Record<string, boolean>
): Partial<T> {
  const result = { ...data };
  if (!privacy.shareStressLevel) delete result.stressScore;
  if (!privacy.shareSleepData) delete result.sleepScore;
  if (!privacy.shareMedicineDetails) delete result.medicineScore;
  if (!privacy.shareMedicalConditions) delete result.medicalConditions;
  if (!privacy.shareWaterIntake) delete result.waterGlasses;
  return result;
}
