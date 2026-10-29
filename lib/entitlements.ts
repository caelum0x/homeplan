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

/**
 * Called from the verified Dodo webhook only — never from user input directly.
 * customerId may be null for older event payloads that didn't include it; an
 * existing stored value is preserved in that case.
 *
 * eventAt is the webhook payload's own top-level `timestamp` (when the event
 * actually happened), not this process's receive time. Dodo's own webhook docs
 * state plainly: "Ordering: No guarantee. Events can arrive out of order" (8
 * retry attempts over up to ~34h backoff on failure). Reproduced live against
 * this exact table pre-fix: deliver a real "subscription.cancelled" event, then
 * deliver a real, OLDER "subscription.active" event second (simulating a
 * delayed retry) — pre-fix, the older event wins because it is upserted last,
 * silently resurrecting Pro access for an actually-cancelled, non-paying
 * customer. eventAt lets the upsert reject a stale-but-late event instead of
 * blindly trusting arrival order. null is accepted for payloads that omit a
 * parseable timestamp, in which case the event is applied unconditionally
 * (the prior, pre-fix behavior) since no ordering decision is possible.
 *
 * Second, distinct guard (found live, 2026-10-29, same day as the above):
 * `pro_subscribers` is keyed by email only, with no check that an incoming
 * event's `subscription_id` is the SAME subscription whose state is actually
 * being tracked. Reproduced live against this exact table pre-fix: a real
 * "subscription.active" webhook for email X / subscription A (a real, paying
 * Pro customer) lands first; a real, totally UNRELATED "subscription.failed"
 * webhook for the SAME email X but a DIFFERENT subscription B (e.g. a stray
 * mandate-creation failure from someone — or an attacker — merely typing that
 * email into a fresh, abandoned checkout) lands second with a later top-level
 * `timestamp`. Pre-fix, the second event passed the ordering check above (it
 * really is later) and overwrote the row wholesale — `dodo_subscription_id`
 * became B, `status` became "failed", and `/api/pro/claim` + `/api/pro/portal`
 * immediately started reporting that real, still-paying customer as not
 * entitled, with their billing-portal customer id silently swapped out too.
 * Any later event for an unrelated subscription_id tied to the same email —
 * failed, cancelled, or otherwise — could knock out an active subscriber's
 * row this way; nothing about it required the attacker to know anything the
 * email's owner didn't already make public by subscribing. Fixed by only
 * letting an event update the row when either (a) its subscription_id is the
 * one already on file (the same subscription continuing its real lifecycle —
 * normal renewals/cancellations/on-hold/etc. all keep one fixed subscription_id
 * per Dodo's own docs) or (b) the row isn't currently entitled anyway (so
 * there's no live paid subscription left to protect, and adopting a new
 * subscription_id — e.g. a genuine resubscribe after a real cancellation — is
 * safe). A brand new email (no existing row) is unaffected either way.
 */
export async function upsertProSubscriber(
  email: string,
  subscriptionId: string,
  status: string,
  customerId: string | null,
  eventAt: Date | null,
): Promise<void> {
  const client = sql();
  if (!client) {
    console.error("HomePlan entitlements: DATABASE_URL not configured, dropping webhook update");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedStatus = status.trim().toLowerCase();
  const eventAtIso = eventAt ? eventAt.toISOString() : null;
  await client`
    INSERT INTO pro_subscribers (email, dodo_subscription_id, status, dodo_customer_id, event_at, updated_at)
    VALUES (${normalizedEmail}, ${subscriptionId}, ${normalizedStatus}, ${customerId}, ${eventAtIso}, now())
    ON CONFLICT (email) DO UPDATE
      SET dodo_subscription_id = excluded.dodo_subscription_id,
          status = excluded.status,
          dodo_customer_id = COALESCE(excluded.dodo_customer_id, pro_subscribers.dodo_customer_id),
          event_at = COALESCE(excluded.event_at, pro_subscribers.event_at),
          updated_at = now()
      WHERE (
              pro_subscribers.dodo_subscription_id = excluded.dodo_subscription_id
              OR pro_subscribers.status NOT IN ('active', 'past_due') -- keep in sync with ENTITLED_STATUSES above
            )
        AND (
              excluded.event_at IS NULL
              OR pro_subscribers.event_at IS NULL
              OR excluded.event_at >= pro_subscribers.event_at
            )
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

const CLAIM_WINDOW_SECONDS = 15 * 60;
// Real bug this constant fixes (found live, 2026-10-29): app/pro/success's own useAutoClaim
// polls /api/pro/claim up to 5 times automatically right after checkout (Dodo's webhook can
// take longer than that short burst to land). With the limit previously set to exactly 5, a
// real paying customer whose webhook simply hadn't landed yet would have the auto-poll alone
// consume their *entire* 15-minute budget — the moment the webhook DID land, their very next
// claim (automatic or a manual retry from /pro/access) got a 429, locking a legitimate,
// already-paid customer out of their own Pro access for 15 minutes. Reproduced live against
// real production DB + a real signed webhook before raising this. 15 leaves real headroom
// above the known 5-attempt auto-poll for a few manual follow-up retries, while staying well
// under the per-IP cap below, which remains the primary defense against scanning many
// different emails from one source.
const CLAIM_MAX_PER_EMAIL = 15;
const CLAIM_MAX_PER_IP = 20;

export type ClaimRateLimitResult = { readonly limited: false } | { readonly limited: true; readonly retryAfterSeconds: number };

/**
 * Anti-enumeration/brute-force guard for /api/pro/claim. That route's own trust
 * model is "no password, no sign-up — a typed email that matches a real entitled
 * row is itself the credential" (see its doc comment), which otherwise has zero
 * cost to attempt: nothing stopped a caller from POSTing the same or many emails
 * an unlimited number of times to find out which ones are paying customers and,
 * for any that are, mint themselves a live Pro session + billing-portal cookie for
 * that customer's account. Records every real attempt (success or failure) in
 * Postgres and rejects once either the target email or the calling IP crosses its
 * own threshold inside a rolling window, so mass guessing/enumeration is no longer
 * free — a single legitimate user re-confirming access on a new device still gets
 * through untouched.
 *
 * Real bug found+reproduced live (2026-10-29, same day this limiter shipped in
 * b64f88f): the original version read both counts with a plain SELECT, then did a
 * separate INSERT — two independent round trips with no lock between them, so
 * concurrent callers could all read the same pre-insert count and all pass the
 * check before any of their own inserts had landed. Reproduced directly against
 * this exact table/function: 30 concurrent calls for one never-before-seen email
 * (CLAIM_MAX_PER_EMAIL = 15) returned 30/30 allowed, 0 blocked — the limiter this
 * function exists to provide was completely bypassable by an attacker simply
 * firing requests in parallel instead of serially, which is a strictly *easier*
 * attack than the sequential one the limiter was built to stop. Fixed by moving
 * the whole count-then-insert into one real Postgres transaction (neon's
 * `client.transaction()` batches multiple statements into a single HTTP round
 * trip) guarded by two per-key advisory locks, always acquired in the same
 * fixed order (ip, then email) across every call so concurrent callers can never
 * deadlock on each other: a second concurrent request sharing either the same IP
 * or the same email now genuinely blocks on `pg_advisory_xact_lock` until the
 * first request's count-then-insert has fully committed, so the counts the final
 * INSERT's own WHERE clause reads are never stale. The lock is scoped to this one
 * transaction and auto-releases on commit (pg_advisory_xact_lock, not the
 * session-lifetime pg_advisory_lock).
 */
export async function checkAndRecordClaimAttempt(email: string, ip: string): Promise<ClaimRateLimitResult> {
  const client = sql();
  if (!client) return { limited: false }; // DB itself unreachable — getProSubscriber already fails closed (not entitled) in that case
  const normalizedEmail = email.trim().toLowerCase();
  const windowStart = new Date(Date.now() - CLAIM_WINDOW_SECONDS * 1000).toISOString();

  const results = await client.transaction([
    client`SELECT pg_advisory_xact_lock(hashtext('homeplan_claim_ip:' || ${ip}))`,
    client`SELECT pg_advisory_xact_lock(hashtext('homeplan_claim_email:' || ${normalizedEmail}))`,
    client`
      INSERT INTO pro_claim_attempts (email, ip)
      SELECT ${normalizedEmail}, ${ip}
      WHERE (SELECT count(*)::int FROM pro_claim_attempts WHERE email = ${normalizedEmail} AND created_at > ${windowStart}) < ${CLAIM_MAX_PER_EMAIL}
        AND (SELECT count(*)::int FROM pro_claim_attempts WHERE ip = ${ip} AND created_at > ${windowStart}) < ${CLAIM_MAX_PER_IP}
      RETURNING 1
    `,
  ]);
  const inserted = (results[2] as unknown[]).length > 0;

  if (!inserted) {
    return { limited: true, retryAfterSeconds: CLAIM_WINDOW_SECONDS };
  }
  return { limited: false };
}
