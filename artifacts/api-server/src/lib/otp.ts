import crypto from "crypto";

export function generateOtp(length = 6): string {
  const digits = "0123456789";
  let otp = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % 10];
  }
  return otp;
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function verifyOtpHash(otp: string, hash: string): boolean {
  const computed = hashOtp(otp);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export async function sendSmsOtp(phone: string, otp: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.warn("FAST2SMS_API_KEY not set — OTP not sent:", otp);
    return true;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=otp&variables_values=${otp}&flash=0&numbers=${phone}`;
    const res = await fetch(url);
    const data = await res.json() as { return: boolean };
    return data.return === true;
  } catch {
    console.error("Fast2SMS error sending to", phone);
    return false;
  }
}
