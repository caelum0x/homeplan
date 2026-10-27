import { PRO_SESSION_COOKIE, verifyProSessionToken } from "@/lib/proSession";
import { getProSubscriber } from "@/lib/entitlements";
import { createCustomerPortalSession, loadDodoEnv } from "@/lib/dodo";

/**
 * Redirects an already-verified Pro subscriber into Dodo's real hosted Customer
 * Portal, where they can view invoices, update their card, and cancel their own
 * subscription — Dodo's own docs explicitly warn against rebuilding any of that,
 * so this route does nothing but authenticate the caller and hand them the link.
 *
 * The customer_id is read server-side from our own entitlement row (populated by
 * the verified webhook), never accepted from the client — per Dodo's own
 * integration warning, anyone who can supply an arbitrary customer_id gets that
 * customer's portal, so this route must resolve it itself from the signed session.
 */
export async function GET(request: Request): Promise<Response> {
  const env = loadDodoEnv();
  if (!env) return Response.json({ error: "Billing isn't configured on this deployment." }, { status: 503 });

  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PRO_SESSION_COOKIE}=`));
  const token = match ? match.slice(PRO_SESSION_COOKIE.length + 1) : null;
  const email = verifyProSessionToken(token);
  if (!email) return Response.json({ error: "Confirm your Pro access first." }, { status: 401 });

  const subscriber = await getProSubscriber(email);
  if (!subscriber?.isEntitled) return Response.json({ error: "No active Pro subscription found." }, { status: 404 });
  if (!subscriber.dodoCustomerId) {
    return Response.json(
      {
        error: "subscription_not_linked",
        message:
          "We can't open your billing portal yet — this can happen for subscriptions started before this feature shipped. Email support and we'll link it manually.",
      },
      { status: 409 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const link = await createCustomerPortalSession(env, subscriber.dodoCustomerId, `${appUrl}/pro/access`);
    return Response.json({ link });
  } catch (error) {
    console.error("HomePlan Pro portal: Dodo session creation failed", error);
    return Response.json({ error: "Could not open the billing portal right now. Try again shortly." }, { status: 502 });
  }
}
