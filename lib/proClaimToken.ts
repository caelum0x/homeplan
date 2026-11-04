import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signed, single-use "prove you own this email" token for HomePlan Pro's
// self-serve claim flow: app/api/pro/claim issues one and mails it via
// lib/scribaseMail.ts, app/api/pro/verify consumes it. Unlike the plain-email
// claim this replaces, nothing is granted until the caller proves they can
// read mail sent to that exact address — see plans/homeplan.md for the real
// account-takeover gap this closes (2026-11-04).

export const PRO_CLAIM_TOKEN_TTL_SECONDS = 15 * 60; // long enough for a real inbox check, short enough to limit a leaked-link window

function sessionSecret(): Buffer | null {
  const secret = process.env.PRO_SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return Buffer.from(secret, "utf8");
}

/** HMAC-derived from PRO_SESSION_SECRET with domain separation, so a mailed, short-lived, single-use claim token can never be confused with (or substituted for) the long-lived session cookie token, even though both ultimately trace back to one owner-configured secret. */
function claimSigningKey(): Buffer | null {
  const base = sessionSecret();
  if (!base) return null;
  return createHmac("sha256", base).update("homeplan-pro-claim-token-v1").digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export type ProClaimToken = { readonly token: string; readonly nonce: string };

/** Builds a fresh claim token for email, or null if PRO_SESSION_SECRET isn't configured on this deployment. */
export function createProClaimToken(email: string): ProClaimToken | null {
  const key = claimSigningKey();
  if (!key) return null;
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + PRO_CLAIM_TOKEN_TTL_SECONDS;
  const payload = JSON.stringify({ email: email.trim().toLowerCase(), expiresAt, nonce });
  const token = `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
  return { token, nonce };
}

export type ProClaimTokenPayload = { readonly email: string; readonly nonce: string };

/**
 * Verifies the token's signature and expiry only. Callers MUST still enforce
 * single-use themselves (lib/entitlements.ts#consumeProClaimNonce) — a valid
 * signature just proves this exact token was issued by this server for this
 * email, not that it hasn't already been consumed. Without that separate
 * check, the exact same emailed link could be replayed any number of times
 * inside its 15-minute window (e.g. a mail-scanning proxy that pre-fetches
 * links, or the real customer forwarding the email).
 */
export function verifyProClaimTokenSignature(token: string | undefined | null): ProClaimTokenPayload | null {
  const key = claimSigningKey();
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const { email, expiresAt, nonce } = record;
  if (typeof email !== "string" || !email) return null;
  if (typeof nonce !== "string" || !nonce) return null;
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  return { email, nonce };
}
