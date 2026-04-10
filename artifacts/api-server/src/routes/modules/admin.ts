import { Router } from "express";
import { db, adminUsersTable, usersTable, organizationsTable, featureFlagsTable, adCampaignsTable, foodItemsTable, promoCodesTable, announcementsTable, adminAuditLogsTable, bloodEmergencyRequestsTable, languagesTable } from "@workspace/db";
import { eq, desc, ilike, count, or } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/admin-auth";
import { signAdminToken } from "../../lib/jwt";
import type { AdminRequest } from "../../middlewares/admin-auth";
import crypto from "crypto";

const router = Router();

router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
    if (!admin || !admin.isActive) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    if (admin.passwordHash !== passwordHash) { res.status(401).json({ error: "Invalid credentials" }); return; }
    await db.update(adminUsersTable).set({ lastLoginAt: new Date() }).where(eq(adminUsersTable.id, admin.id));
    const token = signAdminToken({ adminId: admin.id, role: admin.role });
    res.json({ token, admin: { id: admin.id, fullName: admin.fullName, role: admin.role } });
  } catch {
    res.status(500).json({ error: "Admin login failed" });
  }
});

router.get("/admin/overview", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const [userCount] = await db.select({ count: count() }).from(usersTable);
    const [orgCount] = await db.select({ count: count() }).from(organizationsTable);
    res.json({ stats: { totalUsers: userCount.count, totalOrganizations: orgCount.count } });
  } catch {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

router.get("/admin/users", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { search, limit = "50", offset = "0" } = req.query as Record<string, string>;
    let query = db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(parseInt(limit)).offset(parseInt(offset));
    const users = await query;
    res.json({ users });
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { plan, isActive, isBanned } = req.body as { plan?: string; isActive?: boolean; isBanned?: boolean };
    const updates: Record<string, unknown> = {};
    if (plan !== undefined) updates.plan = plan;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isBanned !== undefined) updates.isBanned = isBanned;
    const [updated] = await db.update(usersTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never).where(eq(usersTable.id, req.params.id)).returning();
    await db.insert(adminAuditLogsTable).values({ adminId: req.adminId!, action: "update_user", targetType: "user", targetId: req.params.id, details: updates });
    res.json({ user: updated });
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/admin/organizations", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const orgs = await db.select().from(organizationsTable).orderBy(desc(organizationsTable.createdAt));
    res.json({ organizations: orgs });
  } catch {
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.get("/admin/feature-flags", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const flags = await db.select().from(featureFlagsTable);
    res.json({ flags });
  } catch {
    res.status(500).json({ error: "Failed to fetch feature flags" });
  }
});

router.post("/admin/feature-flags", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { key, label, description, isEnabled, enabledForPlans, config } = req.body as Record<string, unknown>;
    const [flag] = await db.insert(featureFlagsTable).values({ key: key as string, label: label as string, description: description as string, isEnabled: Boolean(isEnabled), enabledForPlans: enabledForPlans as string[], config }).returning();
    res.status(201).json({ flag });
  } catch {
    res.status(500).json({ error: "Failed to create feature flag" });
  }
});

router.patch("/admin/feature-flags/:key", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { isEnabled, enabledForPlans, config } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (enabledForPlans !== undefined) updates.enabledForPlans = enabledForPlans;
    if (config !== undefined) updates.config = config;
    const [updated] = await db.update(featureFlagsTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never).where(eq(featureFlagsTable.key, req.params.key)).returning();
    await db.insert(adminAuditLogsTable).values({ adminId: req.adminId!, action: "toggle_feature_flag", targetType: "feature_flag", targetId: req.params.key, details: { isEnabled } });
    res.json({ flag: updated });
  } catch {
    res.status(500).json({ error: "Failed to update feature flag" });
  }
});

router.get("/admin/food-items", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { search, limit = "50" } = req.query as Record<string, string>;
    const items = await db.select().from(foodItemsTable).limit(parseInt(limit));
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Failed to fetch food items" });
  }
});

router.post("/admin/food-items", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const [item] = await db.insert(foodItemsTable).values({ ...body as Parameters<typeof db.insert>[1], addedByAdmin: true, isVerified: true } as Parameters<typeof db.insert>[1]).returning();
    res.status(201).json({ item });
  } catch {
    res.status(500).json({ error: "Failed to create food item" });
  }
});

router.get("/admin/promo-codes", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const codes = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
    res.json({ codes });
  } catch {
    res.status(500).json({ error: "Failed to fetch promo codes" });
  }
});

router.post("/admin/promo-codes", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { code, discountPct, applicablePlans, usageLimit, expiresAt } = req.body as Record<string, unknown>;
    const [created] = await db.insert(promoCodesTable).values({ code: code as string, discountPct: Number(discountPct), applicablePlans: applicablePlans as string[], usageLimit: usageLimit ? Number(usageLimit) : undefined, expiresAt: expiresAt ? new Date(expiresAt as string) : undefined }).returning();
    res.status(201).json({ code: created });
  } catch {
    res.status(500).json({ error: "Failed to create promo code" });
  }
});

router.get("/admin/announcements", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
    res.json({ announcements });
  } catch {
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

router.post("/admin/announcements", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { title, body, imageUrl, linkUrl, targetPlans, startsAt, endsAt } = req.body as Record<string, unknown>;
    const [announcement] = await db.insert(announcementsTable).values({ title: title as string, body: body as string, imageUrl: imageUrl as string, linkUrl: linkUrl as string, targetPlans: targetPlans as string[], startsAt: startsAt ? new Date(startsAt as string) : undefined, endsAt: endsAt ? new Date(endsAt as string) : undefined }).returning();
    res.status(201).json({ announcement });
  } catch {
    res.status(500).json({ error: "Failed to create announcement" });
  }
});

router.get("/admin/blood-requests", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const requests = await db.select().from(bloodEmergencyRequestsTable).orderBy(desc(bloodEmergencyRequestsTable.createdAt)).limit(100);
    res.json({ requests });
  } catch {
    res.status(500).json({ error: "Failed to fetch blood requests" });
  }
});

router.patch("/admin/blood-requests/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { status, isFlagged } = req.body as { status?: string; isFlagged?: boolean };
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (isFlagged !== undefined) updates.isFlagged = isFlagged;
    const [updated] = await db.update(bloodEmergencyRequestsTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never).where(eq(bloodEmergencyRequestsTable.id, req.params.id)).returning();
    res.json({ request: updated });
  } catch {
    res.status(500).json({ error: "Failed to update blood request" });
  }
});

router.get("/admin/languages", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const langs = await db.select().from(languagesTable);
    res.json({ languages: langs });
  } catch {
    res.status(500).json({ error: "Failed to fetch languages" });
  }
});

router.post("/admin/languages", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { code, nameEn, nameLocal, direction = "ltr" } = req.body as Record<string, string>;
    const [lang] = await db.insert(languagesTable).values({ code, nameEn, nameLocal, direction, isActive: false, completionPct: 0 }).returning();
    res.status(201).json({ language: lang });
  } catch {
    res.status(500).json({ error: "Failed to create language" });
  }
});

router.get("/admin/audit-logs", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const logs = await db.select().from(adminAuditLogsTable).orderBy(desc(adminAuditLogsTable.createdAt)).limit(100);
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
