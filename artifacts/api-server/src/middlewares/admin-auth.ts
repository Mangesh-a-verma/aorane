import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../lib/jwt";

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: string;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authorization required" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAdminToken(token);
    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired admin token" });
  }
}
