import type { Request, Response, NextFunction } from "express";
import { verifyBusinessToken } from "../lib/jwt";

export interface BusinessRequest extends Request {
  orgAdminId?: string;
  orgId?: string;
  orgRole?: string;
}

export function requireBusinessAuth(req: BusinessRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Business authorization required" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyBusinessToken(token);
    req.orgAdminId = payload.orgAdminId;
    req.orgId = payload.orgId;
    req.orgRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired business token" });
  }
}
