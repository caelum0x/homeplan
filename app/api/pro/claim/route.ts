import { checkAndRecordClaimAttempt, getProSubscriber } from "@/lib/entitlements";
import { createProClaimToken, PRO_CLAIM_TOKEN_TTL_SECONDS } from "@/lib/proClaimToken";
import { loadScribaseMailEnv, mailIdempotencyKey, proClaimLinkEmail, sendEmail } from "@/lib/scribaseMail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best-effort caller IP for rate-limiting only — not a security boundary by itself (spoofable), just the key the Postgres-backed limiter buckets by. Vercel sets x-forwarded-for; self-hosted deployments behind no proxy fall back to a shared bucket. */
function callerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function absoluteOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/**
 * Self-serve Pro access, step 1 of 2: given an email, checks the real
 * entitlement table (written by the verified Dodo webhook) and — if
 * entitled — emails a real, single-use magic link via Scribase Mail
 * (lib/scribaseMail.ts) to that exact address. The actual session cookie is
 * only ever issued by app/api/pro/verify, once that link is opened — so
 * POSTing a known customer's email here no longer grants anything by
 * itself; it only triggers a mail send to that address's real inbox.
 *
 * Fixes a real account-takeover gap (found live, 2026-11-04): the previous
 * version of this endpoint minted the actual session cookie right here, from
 * the typed email alone, with no proof the caller could read that inbox —
 * anyone who knew (or guessed) a paying customer's email could claim their
 * Pro session and billing-portal access without ever paying. See
 * plans/homeplan.md "History" for this date. Rate-limiting below still
 * applies on top, making mass guessing/enumeration of which emails are
 * paying customers costly instead of free.
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
        sent: false,
        message:
          "We don't see active Pro access for that email yet. If you just subscribed, payments can take up to a minute to confirm — try again shortly.",
      },
      { status: 404 },
    );
  }

  const claim = createProClaimToken(subscriber.email);
  if (!claim) {
    return Response.json({ error: "Pro sessions aren't configured on this deployment yet." }, { status: 503 });
  }

  const mailEnv = loadScribaseMailEnv();
  if (!mailEnv) {
    console.error("HomePlan Pro claim: SCRIBASE_MAIL_KEY not configured, cannot send magic link");
    return Response.json(
      {
        error: "mail_not_configured",
        message: "Email delivery isn't configured on this deployment yet. Email hello@homeplan.dev and we'll confirm access manually.",
      },
      { status: 503 },
    );
  }

  const link = `${absoluteOrigin(request)}/api/pro/verify?token=${encodeURIComponent(claim.token)}`;
  const ttlMinutes = PRO_CLAIM_TOKEN_TTL_SECONDS / 60;
  const mail = proClaimLinkEmail(subscriber.email, link, ttlMinutes);
  const delivered = await sendEmail(mailEnv, {
    to: subscriber.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: await mailIdempotencyKey(claim.nonce),
    tags: ["pro-claim"],
  });
  if (!delivered) {
    return Response.json({ error: "Could not send the confirmation email right now. Try again in a moment." }, { status: 502 });
  }

  return Response.json({
    entitled: true,
    sent: true,
    email: subscriber.email,
    message: `We sent a confirmation link to ${subscriber.email}. Open it to finish signing in — it expires in ${ttlMinutes} minutes.`,
  });
}
