import { createProCheckout, loadDodoEnv } from "@/lib/dodo";
import { getProSubscriber } from "@/lib/entitlements";

/** RFC 5322-ish, deliberately simple — just enough to reject garbage before it reaches Dodo. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function absoluteOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const env = loadDodoEnv();
  if (!env) {
    return Response.json(
      { error: "Checkout isn't configured on this deployment yet. Email hello@homeplan.dev and we'll set you up manually." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Real bug this closes (found live, 2026-10-29): nothing stopped an already-entitled
  // Pro customer from starting a second real Dodo checkout for the same email — e.g. a
  // double-click, a refreshed /pro page, or returning to /pro/success and clicking
  // Subscribe again before noticing they're already Pro. Each call created a brand new,
  // real, live checkout session; completing a second one creates a second real $49/mo
  // Dodo subscription for a customer who already has one, since `pro_subscribers` is
  // keyed by email and `upsertProSubscriber` just overwrites to whichever subscription's
  // webhook lands last — silently losing track of (and continuing to bill) the other one.
  // getProSubscriber returns null on self-host (no DATABASE_URL), so this never runs there.
  const existing = await getProSubscriber(email);
  if (existing?.isEntitled) {
    return Response.json(
      {
        error: "already_subscribed",
        message: "This email already has active Pro access. Manage or cancel the existing subscription from the billing portal instead of starting a new one.",
      },
      { status: 409 },
    );
  }

  try {
    const origin = absoluteOrigin(request);
    const session = await createProCheckout(env, {
      email,
      returnUrl: `${origin}/pro/success?email=${encodeURIComponent(email)}`,
    });
    return Response.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    console.error("HomePlan Pro checkout failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not start checkout. Try again in a moment." }, { status: 502 });
  }
}
