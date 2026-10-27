import { loadDodoEnv, verifyDodoWebhookSignature } from "@/lib/dodo";
import { upsertProSubscriber } from "@/lib/entitlements";

/**
 * Verifies the real Dodo webhook signature, then — for subscription.* events —
 * writes the real entitlement into Postgres so /api/pro/claim can self-serve
 * access instead of the owner reading logs and emailing the customer by hand.
 */

type SubscriptionData = {
  subscription_id: string;
  status: string;
  customer?: { email?: string | null; customer_id?: string | null };
};

function parseSubscriptionData(data: unknown): SubscriptionData | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const subscriptionId = record.subscription_id;
  const status = record.status;
  if (typeof subscriptionId !== "string" || !/^[A-Za-z0-9_-]{4,160}$/.test(subscriptionId)) return null;
  if (typeof status !== "string" || status.length === 0 || status.length > 40) return null;
  const customer = record.customer;
  let email: string | null = null;
  let customerId: string | null = null;
  if (customer && typeof customer === "object") {
    const rawEmail = (customer as Record<string, unknown>).email;
    if (typeof rawEmail === "string" && rawEmail.length > 0 && rawEmail.length <= 320) email = rawEmail;
    const rawCustomerId = (customer as Record<string, unknown>).customer_id;
    if (typeof rawCustomerId === "string" && /^[A-Za-z0-9_-]{4,160}$/.test(rawCustomerId)) customerId = rawCustomerId;
  }
  return { subscription_id: subscriptionId, status, customer: { email, customer_id: customerId } };
}

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

  if (typeof type === "string" && type.startsWith("subscription.")) {
    const subscription = parseSubscriptionData(data);
    if (subscription?.customer?.email) {
      await upsertProSubscriber(
        subscription.customer.email,
        subscription.subscription_id,
        subscription.status,
        subscription.customer.customer_id ?? null,
      );
      console.log("HomePlan Pro entitlement updated:", {
        type,
        email: subscription.customer.email,
        status: subscription.status,
        hasCustomerId: Boolean(subscription.customer.customer_id),
        eventId: id,
      });
    } else {
      console.error("HomePlan Dodo webhook: subscription event missing email/fields", { type, eventId: id });
    }
  } else {
    console.log("HomePlan Pro billing event (non-subscription):", { type, eventId: id });
  }

  return Response.json({ received: true });
}
