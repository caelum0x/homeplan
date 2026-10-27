import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, stateless session token for the self-serve Pro-access flow. Not a full
// account system (no password, no sign-up) — it just lets a browser that has proven
// it controls a Pro-entitled email (via /api/pro/claim) stay recognized as Pro on
// return visits, without storing server-side sessions.

export const PRO_SESSION_COOKIE = "homeplan_pro";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Buffer | null {
  const secret = process.env.PRO_SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return Buffer.from(secret, "utf8");
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Builds the token to set as a cookie value. Caller is responsible for setting HttpOnly/Secure/SameSite. */
export function createProSessionToken(email: string): string | null {
  const key = secretKey();
  if (!key) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${email.trim().toLowerCase()}.${expiresAt}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

/** Verifies a cookie value and returns the email it was issued for, or null if invalid/expired/unconfigured. */
export function verifyProSessionToken(token: string | undefined | null): string | null {
  const key = secretKey();
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload, key);
  const expectedBuf = Buffer.from(expected, "utf8");
  const suppliedBuf = Buffer.from(signature, "utf8");
  if (suppliedBuf.length !== expectedBuf.length || !timingSafeEqual(suppliedBuf, expectedBuf)) return null;

  const dotIndex = payload.lastIndexOf(".");
  if (dotIndex < 0) return null;
  const email = payload.slice(0, dotIndex);
  const expiresAt = Number(payload.slice(dotIndex + 1));
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  if (!email) return null;
  return email;
}
