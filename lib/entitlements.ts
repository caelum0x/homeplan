import { neon } from "@neondatabase/serverless";

// Automated Pro entitlements backed by a real Postgres table, written to by the
// verified Dodo webhook (app/api/webhooks/dodo/route.ts) and read by the self-serve
// claim flow (app/api/pro/claim/route.ts). Replaces the previous manual process
// ("owner reads webhook logs, emails the customer by hand") noted in plans/homeplan.md.

/** Statuses that grant access. past_due keeps access during Dodo's grace period — same policy as bidstage-tenders' existing Dodo integration. */
const ENTITLED_STATUSES = new Set(["active", "past_due"]);

export type ProSubscriberStatus = {
  readonly email: string;
  readonly status: string;
  readonly isEntitled: boolean;
  readonly dodoCustomerId: string | null;
};

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

/** Called from the verified Dodo webhook only — never from user input directly. customerId may be null for older event payloads that didn't include it; an existing stored value is preserved in that case. */
export async function upsertProSubscriber(
  email: string,
  subscriptionId: string,
  status: string,
  customerId: string | null,
): Promise<void> {
  const client = sql();
  if (!client) {
    console.error("HomePlan entitlements: DATABASE_URL not configured, dropping webhook update");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedStatus = status.trim().toLowerCase();
  await client`
    INSERT INTO pro_subscribers (email, dodo_subscription_id, status, dodo_customer_id, updated_at)
    VALUES (${normalizedEmail}, ${subscriptionId}, ${normalizedStatus}, ${customerId}, now())
    ON CONFLICT (email) DO UPDATE
      SET dodo_subscription_id = excluded.dodo_subscription_id,
          status = excluded.status,
          dodo_customer_id = COALESCE(excluded.dodo_customer_id, pro_subscribers.dodo_customer_id),
          updated_at = now()
  `;
}

/** Self-serve read, called from app/api/pro/claim, app/api/pro/me, and app/api/pro/portal. Fails closed (not entitled) if the DB isn't reachable. */
export async function getProSubscriber(email: string): Promise<ProSubscriberStatus | null> {
  const client = sql();
  if (!client) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await client`SELECT email, status, dodo_customer_id FROM pro_subscribers WHERE email = ${normalizedEmail} LIMIT 1`;
  const row = rows[0] as { email: string; status: string; dodo_customer_id: string | null } | undefined;
  if (!row) return null;
  return {
    email: row.email,
    status: row.status,
    isEntitled: ENTITLED_STATUSES.has(row.status),
    dodoCustomerId: row.dodo_customer_id,
  };
}
