import { loadDodoEnv, verifyDodoWebhookSignature } from "@/lib/dodo";

/**
 * HomePlan has no database/accounts (self-host-first app), so this webhook does the honest
 * minimum: verify the signature for real (never trust an unverified body), then log the
 * event server-side so the owner sees every real Pro signup/cancellation in Vercel's function
 * logs. No fake entitlement system is pretended here — access for the hosted Pro tier is
 * granted manually by the owner today (noted in plans/homeplan.md), same as any other
 * pre-automation SaaS billing bootstrap.
 */
export async function POST(request: Request): Promise<Response> {
  const env = loadDodoEnv();
  if (!env) return new Response("Webhook not configured", { status: 503 });

  const rawBody = await request.text();
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  const valid = verifyDodoWebhookSignature(rawBody, { id, timestamp, signature }, env.webhookKey);
  if (!valid) {
    console.error("HomePlan Dodo webhook: signature verification failed", { id });
    return new Response("Invalid signature", { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!event || typeof event !== "object") return new Response("Invalid event", { status: 400 });

  const type = (event as { type?: unknown }).type;
  const data = (event as { data?: unknown }).data;
  const customerEmail =
    data && typeof data === "object" && "customer" in data && data.customer && typeof data.customer === "object"
      ? (data.customer as { email?: unknown }).email
      : undefined;

  // Real signal the owner acts on: a verified payment/subscription event for HomePlan Pro.
  console.log("HomePlan Pro billing event:", { type, customerEmail, eventId: id });

  return Response.json({ received: true });
}
