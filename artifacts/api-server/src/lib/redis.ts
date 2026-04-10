const OTP_EXPIRY_SECONDS = 300;
const STORE = new Map<string, { value: string; expiresAt: number }>();

function setKey(key: string, value: string, ttlSeconds: number): void {
  STORE.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function getKey(key: string): string | null {
  const entry = STORE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    STORE.delete(key);
    return null;
  }
  return entry.value;
}

function deleteKey(key: string): void {
  STORE.delete(key);
}

export const cache = {
  setOtp(identifier: string, hashedOtp: string): void {
    setKey(`otp:${identifier}`, hashedOtp, OTP_EXPIRY_SECONDS);
  },
  getOtp(identifier: string): string | null {
    return getKey(`otp:${identifier}`);
  },
  deleteOtp(identifier: string): void {
    deleteKey(`otp:${identifier}`);
  },
  setRateLimit(key: string, count: number, ttlSeconds: number): void {
    setKey(`rate:${key}`, String(count), ttlSeconds);
  },
  getRateLimit(key: string): number {
    const val = getKey(`rate:${key}`);
    return val ? parseInt(val, 10) : 0;
  },
  incrementRateLimit(key: string, ttlSeconds: number): number {
    const current = this.getRateLimit(key);
    const next = current + 1;
    setKey(`rate:${key}`, String(next), ttlSeconds);
    return next;
  },
  set(key: string, value: string, ttlSeconds: number): void {
    setKey(key, value, ttlSeconds);
  },
  get(key: string): string | null {
    return getKey(key);
  },
  delete(key: string): void {
    deleteKey(key);
  },
};
