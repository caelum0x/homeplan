import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Dodo Payments REST client for HomePlan Pro's hosted checkout.
// HomePlan has no accounts/DB (it's a stateless self-host-first app), so this
// intentionally does NOT try to replicate a full entitlement system — it creates
// a real hosted checkout session and verifies real webhook events, the same two
// primitives every other product on this Dodo business (bidstage-tenders,
// menivor, scribase) uses, ported down to what a stateless app actually needs.
// Pattern adapted from ~/products/bidstage-tenders/billing/dodo.ts (same business,
// already live and processing real payments there).

export type DodoEnv = {
  readonly apiKey: string;
  readonly webhookKey: string;
  readonly testMode: boolean;
  readonly proMonthlyProductId: string;
};

export function loadDodoEnv(): DodoEnv | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  const proMonthlyProductId = process.env.DODO_PRODUCT_PRO_MONTHLY;
  if (!apiKey || !webhookKey || !proMonthlyProductId) return null;
  return {
    apiKey,
    webhookKey,
    testMode: process.env.DODO_PAYMENTS_TEST_MODE === "true",
    proMonthlyProductId,
  };
}

function dodoBaseUrl(testMode: boolean): string {
  return testMode ? "https://test.dodopayments.com" : "https://live.dodopayments.com";
}

/** Only ever hand the browser a Dodo-hosted HTTPS URL — never pass through an arbitrary value. */
export function trustedDodoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hostOk = url.hostname === "dodopayments.com" || url.hostname.endsWith(".dodopayments.com");
    if (url.protocol !== "https:" || url.username || url.password || !hostOk) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function dodoRequest(
  env: DodoEnv,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${env.apiKey}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${dodoBaseUrl(env.testMode)}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) throw new Error(`Dodo ${init.method} ${path.split("?")[0]} failed with status ${response.status}`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Dodo returned a non-object body");
  return body as Record<string, unknown>;
}

export type CheckoutInput = {
  readonly email: string;
  readonly returnUrl: string;
};

export type CheckoutSession = { readonly sessionId: string; readonly checkoutUrl: string };

export async function createProCheckout(env: DodoEnv, input: CheckoutInput): Promise<CheckoutSession> {
  const body = await dodoRequest(env, "/checkouts", {
    method: "POST",
    body: {
      product_cart: [{ product_id: env.proMonthlyProductId, quantity: 1 }],
      customer: { email: input.email },
      return_url: input.returnUrl,
      feature_flags: { allow_discount_code: true },
      short_link: false,
    },
  });
  const checkoutUrl = trustedDodoUrl(body.checkout_url);
  if (typeof body.session_id !== "string" || !checkoutUrl) throw new Error("Dodo returned an invalid checkout session");
  return { sessionId: body.session_id, checkoutUrl };
}

export type WebhookHeaders = { readonly id: string; readonly timestamp: string; readonly signature: string };

/** Standard Webhooks HMAC-SHA256 verification with a five-minute replay window. */
export function verifyDodoWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(headers.id) || !/^\d{10}$/.test(headers.timestamp)) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSecret)) return false;
  const key = Buffer.from(encodedSecret, "base64");
  if (key.length < 24 || key.length > 64) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();

  for (const versioned of headers.signature.trim().split(/\s+/).slice(0, 16)) {
    const separator = versioned.indexOf(",");
    if (separator < 0 || versioned.slice(0, separator) !== "v1") continue;
    const encoded = versioned.slice(separator + 1);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) continue;
    const supplied = Buffer.from(encoded, "base64");
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return true;
  }
  return false;
}
