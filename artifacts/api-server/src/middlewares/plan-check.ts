import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./user-auth";

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  max: 1,
  family: 1,
  pro: 2,
};

export function requirePlan(...plans: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userPlan = req.userPlan || "free";
    const userLevel = PLAN_HIERARCHY[userPlan] ?? 0;
    const requiredLevels = plans.map((p) => PLAN_HIERARCHY[p] ?? 0);
    const minRequired = Math.min(...requiredLevels);

    if (userLevel >= minRequired || plans.includes(userPlan)) {
      next();
    } else {
      res.status(403).json({
        error: "Plan upgrade required",
        requiredPlans: plans,
        currentPlan: userPlan,
        upgradeUrl: "/plans",
      });
    }
  };
}

export function requirePro(req: AuthRequest, res: Response, next: NextFunction): void {
  return requirePlan("pro")(req, res, next);
}

export function requireMax(req: AuthRequest, res: Response, next: NextFunction): void {
  return requirePlan("max", "pro")(req, res, next);
}
