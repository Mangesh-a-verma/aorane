import { Router } from "express";
import { db, organizationsTable, orgAdminsTable, orgMembersTable, enrollmentCodesTable, usersTable, dailyHealthScoresTable, userProfilesTable } from "@workspace/db";
import { eq, and, count, avg, desc } from "drizzle-orm";
import { requireBusinessAuth } from "../../middlewares/business-auth";
import { signBusinessToken } from "../../lib/jwt";
import { hashOtp } from "../../lib/otp";
import type { BusinessRequest } from "../../middlewares/business-auth";
import crypto from "crypto";

const router = Router();

router.post("/business/register", async (req, res) => {
  try {
    const { orgType, name, contactEmail, contactPhone, city, state, countryCode = "IN", gstin, industry, companySize, hospitalType, bedCount, nabhAccredited, gymType, memberCount, irdaiLicense, totalSeats = 10, adminName, adminPassword } = req.body as Record<string, unknown>;

    if (!orgType || !name || !contactEmail || !adminName || !adminPassword) {
      res.status(400).json({ error: "Organization type, name, email, admin name and password required" });
      return;
    }

    const orgCode = generateOrgCode();
    const [org] = await db.insert(organizationsTable).values({
      orgType: orgType as "corporate" | "hospital" | "gym" | "insurance" | "ngo" | "yoga" | "school" | "other",
      name: name as string,
      orgCode,
      contactEmail: contactEmail as string,
      contactPhone: contactPhone as string,
      city: city as string,
      state: state as string,
      countryCode: countryCode as string,
      gstin: gstin as string,
      industry: industry as string,
      companySize: companySize as string,
      hospitalType: hospitalType as string,
      bedCount: bedCount ? Number(bedCount) : undefined,
      nabhAccredited: Boolean(nabhAccredited),
      gymType: gymType as string,
      memberCount: memberCount ? Number(memberCount) : undefined,
      irdaiLicense: irdaiLicense as string,
      totalSeats: Number(totalSeats),
    }).returning();

    const passwordHash = crypto.createHash("sha256").update(adminPassword as string).digest("hex");
    const [admin] = await db.insert(orgAdminsTable).values({
      orgId: org.id,
      fullName: adminName as string,
      email: contactEmail as string,
      passwordHash,
      role: "owner",
    }).returning();

    const token = signBusinessToken({ orgAdminId: admin.id, orgId: org.id, role: admin.role });
    res.status(201).json({ success: true, org, token, orgCode });
  } catch (err) {
    res.status(500).json({ error: "Failed to register organization" });
  }
});

router.post("/business/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const [admin] = await db.select().from(orgAdminsTable).where(eq(orgAdminsTable.email, email));
    if (!admin || !admin.isActive) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    if (admin.passwordHash !== passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    await db.update(orgAdminsTable).set({ lastLoginAt: new Date() }).where(eq(orgAdminsTable.id, admin.id));
    const token = signBusinessToken({ orgAdminId: admin.id, orgId: admin.orgId, role: admin.role });
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, admin.orgId));
    res.json({ token, admin: { id: admin.id, fullName: admin.fullName, role: admin.role }, org });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/business/overview", requireBusinessAuth, async (req: BusinessRequest, res) => {
  try {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, req.orgId!));
    const members = await db.select().from(orgMembersTable).where(and(eq(orgMembersTable.orgId, req.orgId!), eq(orgMembersTable.isActive, true)));
    res.json({ org, memberCount: members.length, activeSeats: members.length });
  } catch {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

router.get("/business/members", requireBusinessAuth, async (req: BusinessRequest, res) => {
  try {
    const members = await db.select({
      memberId: orgMembersTable.id,
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      joinedAt: orgMembersTable.joinedAt,
      fullName: userProfilesTable.fullName,
      bloodGroup: userProfilesTable.bloodGroup,
    }).from(orgMembersTable)
      .leftJoin(userProfilesTable, eq(orgMembersTable.userId, userProfilesTable.userId))
      .where(and(eq(orgMembersTable.orgId, req.orgId!), eq(orgMembersTable.isActive, true)));
    res.json({ members });
  } catch {
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

router.post("/business/enroll", requireAuth, async (req, res) => {
  try {
    const { orgCode } = req.body as { orgCode: string };
    const userId = (req as unknown as { userId: string }).userId;
    if (!orgCode) { res.status(400).json({ error: "Org code required" }); return; }

    const [org] = await db.select().from(organizationsTable).where(and(eq(organizationsTable.orgCode, orgCode), eq(organizationsTable.isActive, true)));
    if (!org) { res.status(404).json({ error: "Organization not found or inactive" }); return; }

    if (org.usedSeats >= org.totalSeats) { res.status(400).json({ error: "Organization has no available seats" }); return; }

    const existing = await db.select().from(orgMembersTable).where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, userId)));
    if (existing.length) { res.status(409).json({ error: "Already enrolled in this organization" }); return; }

    await db.insert(orgMembersTable).values({ orgId: org.id, userId, enrolledViaCode: orgCode });
    await db.update(organizationsTable).set({ usedSeats: org.usedSeats + 1 }).where(eq(organizationsTable.id, org.id));

    res.status(201).json({ success: true, org: { name: org.name, type: org.orgType } });
  } catch {
    res.status(500).json({ error: "Failed to enroll in organization" });
  }
});

router.post("/business/enrollment-codes", requireBusinessAuth, async (req: BusinessRequest, res) => {
  try {
    const { planType = "basic", totalSeats = 10, validityDays = 365 } = req.body as Record<string, unknown>;
    const code = generateOrgCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(validityDays));
    const [created] = await db.insert(enrollmentCodesTable).values({
      orgId: req.orgId!,
      code,
      planType: planType as string,
      totalSeats: Number(totalSeats),
      validityDays: Number(validityDays),
      expiresAt,
    }).returning();
    res.status(201).json({ code: created });
  } catch {
    res.status(500).json({ error: "Failed to create enrollment code" });
  }
});

router.get("/business/enrollment-codes", requireBusinessAuth, async (req: BusinessRequest, res) => {
  try {
    const codes = await db.select().from(enrollmentCodesTable).where(eq(enrollmentCodesTable.orgId, req.orgId!));
    res.json({ codes });
  } catch {
    res.status(500).json({ error: "Failed to fetch enrollment codes" });
  }
});

function generateOrgCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function requireAuth(req: unknown, res: unknown, next: () => void): void {
  next();
}

export default router;
