import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "aorane_dev_secret_change_in_prod";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "aorane_refresh_dev_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "aorane_admin_dev_secret";
const BUSINESS_JWT_SECRET = process.env.BUSINESS_JWT_SECRET || "aorane_business_dev_secret";

export type UserTokenPayload = {
  userId: string;
  phone?: string;
  email?: string;
  plan: string;
};

export type AdminTokenPayload = {
  adminId: string;
  role: string;
};

export type BusinessTokenPayload = {
  orgAdminId: string;
  orgId: string;
  role: string;
};

export function signUserToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function signRefreshToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "90d" });
}

export function verifyUserToken(token: string): UserTokenPayload {
  return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
}

export function verifyRefreshToken(token: string): UserTokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as UserTokenPayload;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "12h" });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload;
}

export function signBusinessToken(payload: BusinessTokenPayload): string {
  return jwt.sign(payload, BUSINESS_JWT_SECRET, { expiresIn: "30d" });
}

export function verifyBusinessToken(token: string): BusinessTokenPayload {
  return jwt.verify(token, BUSINESS_JWT_SECRET) as BusinessTokenPayload;
}
