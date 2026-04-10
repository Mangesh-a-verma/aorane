import type { Request, Response, NextFunction } from "express";
import { verifyUserToken } from "../lib/jwt";

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
  userPhone?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyUserToken(token);
    req.userId = payload.userId;
    req.userPlan = payload.plan;
    req.userPhone = payload.phone;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = verifyUserToken(token);
      req.userId = payload.userId;
      req.userPlan = payload.plan;
    } catch {
    }
  }
  next();
}
