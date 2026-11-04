import { consumeProClaimNonce, getProSubscriber } from "@/lib/entitlements";
import { verifyProClaimTokenSignature } from "@/lib/proClaimToken";
import { createProSessionToken, PRO_SESSION_COOKIE } from "@/lib/proSession";

function absoluteOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function redirect(origin: string, path: string, setCookie?: string): Response {
  const headers = new Headers({ Location: `${origin}${path}` });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

/**
 * Self-serve Pro access, step 2 of 2: consumes the single-use magic link
 * app/api/pro/claim emails out, and only here — never in /api/pro/claim
 * itself — issues the real signed session cookie. Opening this exact link
 * (which only ever reaches the real inbox owner, via Scribase Mail) is the
 * proof of email ownership the previous version of this flow was missing;
 * see plans/homeplan.md "History" (2026-11-04).
 */
export async function GET(request: Request): Promise<Response> {
  const origin = absoluteOrigin(request);
  const token = new URL(request.url).searchParams.get("token");
  const payload = verifyProClaimTokenSignature(token);
  if (!payload) return redirect(origin, "/pro/access?claim_error=invalid");

  // Single-use enforcement: a valid signature only proves this server issued
  // the token, not that it hasn't already been opened once before.
  const consumed = await consumeProClaimNonce(payload.nonce, payload.email);
  if (!consumed) return redirect(origin, "/pro/access?claim_error=used");

  // Re-check entitlement rather than trusting the token's claim alone — the
  // subscription could have lapsed in the minutes between email send and link open.
  const subscriber = await getProSubscriber(payload.email);
  if (!subscriber?.isEntitled) return redirect(origin, "/pro/access?claim_error=not_entitled");

  const sessionToken = createProSessionToken(subscriber.email);
  if (!sessionToken) return redirect(origin, "/pro/access?claim_error=not_configured");

  return redirect(
    origin,
    "/pro/access?claimed=1",
    `${PRO_SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
  );
}
