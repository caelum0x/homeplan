import { checkAndRecordClaimAttempt, getProSubscriber } from "@/lib/entitlements";
import { createProSessionToken, PRO_SESSION_COOKIE } from "@/lib/proSession";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best-effort caller IP for rate-limiting only — not a security boundary by itself (spoofable), just the key the Postgres-backed limiter buckets by. Vercel sets x-forwarded-for; self-hosted deployments behind no proxy fall back to a shared bucket. */
function callerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Self-serve Pro access: given an email, checks the real entitlement table (written by the verified Dodo webhook) and — if entitled — issues a signed session cookie. No password, no account; the email itself is the credential — NOT an actual magic link (no email is ever sent to prove the caller owns that address). That's a real, deeper gap this endpoint alone can't close (see plans/homeplan.md); rate-limiting below at least makes mass guessing/enumeration of which emails are paying customers costly instead of free.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = callerIp(request);
  const limit = await checkAndRecordClaimAttempt(email, ip);
  if (limit.limited) {
    return Response.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const subscriber = await getProSubscriber(email);
  if (!subscriber?.isEntitled) {
    return Response.json(
      {
        entitled: false,
        message:
          "We don't see active Pro access for that email yet. If you just subscribed, payments can take up to a minute to confirm — try again shortly.",
      },
      { status: 404 },
    );
  }

  const token = createProSessionToken(subscriber.email);
  if (!token) {
    return Response.json({ error: "Pro sessions aren't configured on this deployment yet." }, { status: 503 });
  }

  const response = Response.json({ entitled: true, email: subscriber.email });
  response.headers.append(
    "Set-Cookie",
    `${PRO_SESSION_COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}
