import { Router } from "express";
import { db, bloodDonorsTable, bloodEmergencyRequestsTable, bloodEmergencyResponsesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "../../middlewares/user-auth";
import { cache } from "../../lib/redis";
import { generateOtp, hashOtp, verifyOtpHash, sendSmsOtp } from "../../lib/otp";
import type { AuthRequest } from "../../middlewares/user-auth";

const COMPATIBLE_DONORS: Record<string, string[]> = {
  "A+": ["A+", "A-", "O+", "O-"],
  "A-": ["A-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "O+": ["O+", "O-"],
  "O-": ["O-"],
  "AB+": ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
  "AB-": ["A-", "B-", "O-", "AB-"],
};

const router = Router();

router.post("/blood/donor/register", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { bloodGroup, city, state, countryCode = "IN", lat, lng, phone } = req.body as Record<string, string>;
    if (!bloodGroup || !city || !state) {
      res.status(400).json({ error: "Blood group, city, state required" });
      return;
    }
    const otp = generateOtp(6);
    const hashed = hashOtp(otp);
    cache.setOtp(`blood_donor:${req.userId}`, hashed);
    if (phone) await sendSmsOtp(phone, otp);
    const existing = await db.select().from(bloodDonorsTable).where(eq(bloodDonorsTable.userId, req.userId!));
    if (existing.length) {
      res.json({ success: true, requiresOtp: true, message: "OTP sent for verification" });
      return;
    }
    await db.insert(bloodDonorsTable).values({
      userId: req.userId!,
      bloodGroup: bloodGroup as "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-",
      city, state, countryCode, lat, lng,
    });
    res.json({ success: true, requiresOtp: true, message: "OTP sent for verification" });
  } catch {
    res.status(500).json({ error: "Failed to register donor" });
  }
});

router.post("/blood/donor/verify-otp", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { otp } = req.body as { otp: string };
    const stored = cache.getOtp(`blood_donor:${req.userId}`);
    if (!stored || !verifyOtpHash(otp, stored)) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }
    cache.deleteOtp(`blood_donor:${req.userId}`);
    await db.update(bloodDonorsTable).set({ otpVerified: true, verifiedAt: new Date() }).where(eq(bloodDonorsTable.userId, req.userId!));
    res.json({ success: true, message: "Donor verified successfully" });
  } catch {
    res.status(500).json({ error: "OTP verification failed" });
  }
});

router.post("/blood/request", requireAuth, async (req: AuthRequest, res) => {
  try {
    const monthKey = `blood_req:${req.userId}:${new Date().toISOString().slice(0, 7)}`;
    const monthCount = cache.getRateLimit(monthKey);
    if (monthCount >= 2) {
      res.status(429).json({ error: "Maximum 2 blood requests per month allowed" });
      return;
    }
    const { patientName, bloodGroupNeeded, hospitalName, hospitalCity, hospitalState, unitsNeeded, contactPhone, contactName, notes } = req.body as Record<string, unknown>;

    const otp = generateOtp(6);
    const hashed = hashOtp(otp);
    cache.setOtp(`blood_req:${req.userId}`, hashed);
    if (contactPhone) await sendSmsOtp(contactPhone as string, otp);

    cache.set(`blood_req_pending:${req.userId}`, JSON.stringify({ patientName, bloodGroupNeeded, hospitalName, hospitalCity, hospitalState, unitsNeeded, contactPhone, contactName, notes }), 600);
    res.json({ success: true, requiresOtp: true, message: "OTP sent for verification" });
  } catch {
    res.status(500).json({ error: "Failed to create blood request" });
  }
});

router.post("/blood/request/verify-otp", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { otp } = req.body as { otp: string };
    const stored = cache.getOtp(`blood_req:${req.userId}`);
    if (!stored || !verifyOtpHash(otp, stored)) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }
    cache.deleteOtp(`blood_req:${req.userId}`);

    const pendingStr = cache.get(`blood_req_pending:${req.userId}`);
    if (!pendingStr) {
      res.status(400).json({ error: "Request session expired. Please start again." });
      return;
    }
    const pending = JSON.parse(pendingStr);
    cache.delete(`blood_req_pending:${req.userId}`);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const [request] = await db.insert(bloodEmergencyRequestsTable).values({
      requesterId: req.userId!,
      ...pending,
      otpVerified: true,
      expiresAt,
    }).returning();

    const monthKey = `blood_req:${req.userId}:${new Date().toISOString().slice(0, 7)}`;
    cache.incrementRateLimit(monthKey, 31 * 24 * 3600);

    res.status(201).json({ success: true, request });
  } catch {
    res.status(500).json({ error: "Failed to create verified blood request" });
  }
});

router.get("/blood/requests/active", async (req, res) => {
  try {
    const requests = await db.select().from(bloodEmergencyRequestsTable)
      .where(and(eq(bloodEmergencyRequestsTable.status, "active"), eq(bloodEmergencyRequestsTable.otpVerified, true)));
    res.json({ requests });
  } catch {
    res.status(500).json({ error: "Failed to fetch blood requests" });
  }
});

router.post("/blood/request/:id/respond", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { response } = req.body as { response: "can_help" | "later" | "unavailable" };
    const [existing] = await db.select().from(bloodEmergencyResponsesTable)
      .where(and(eq(bloodEmergencyResponsesTable.requestId, req.params.id), eq(bloodEmergencyResponsesTable.donorId, req.userId!)));
    if (existing) {
      await db.update(bloodEmergencyResponsesTable).set({ response }).where(eq(bloodEmergencyResponsesTable.id, existing.id));
    } else {
      await db.insert(bloodEmergencyResponsesTable).values({
        requestId: req.params.id,
        donorId: req.userId!,
        response,
      });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to submit response" });
  }
});

router.post("/blood/request/:id/flag", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [request] = await db.select().from(bloodEmergencyRequestsTable).where(eq(bloodEmergencyRequestsTable.id, req.params.id));
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    const newCount = request.flagCount + 1;
    await db.update(bloodEmergencyRequestsTable).set({
      flagCount: newCount,
      isFlagged: newCount >= 3,
    }).where(eq(bloodEmergencyRequestsTable.id, req.params.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to flag request" });
  }
});

export default router;
