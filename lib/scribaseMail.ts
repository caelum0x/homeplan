// Transactional email via Scribase Mail (api.scribase.com) — the portfolio's
// own self-hosted mail service, already proven in production by
// Bidstage/Menivor/Oxhan/EcoMoney (see ~/products/plans/scribase-mail.md and
// ~/products/mobile/ecomoney/server/src/email.ts for the exact contract this
// ports: POST /api/rally/v1/transactional/send, 202 on accept). HomePlan has
// no reason to carry a separate Resend/SES account when this exists
// specifically so portfolio apps don't have to.
//
// Used only by the self-serve Pro magic-link claim flow (app/api/pro/claim
// sends the link, app/api/pro/verify consumes it) to prove the caller
// actually owns a Pro-entitled email before a session cookie is ever issued —
// see lib/proClaimToken.ts and plans/homeplan.md.

const DEFAULT_SCRIBASE_MAIL_URL = "https://api.scribase.com/api/rally/v1/transactional/send";
const SEND_TIMEOUT_MS = 10_000;

export type ScribaseMailEnv = {
  readonly url: string;
  readonly key: string;
  readonly fromLocal: string;
  readonly fromName: string;
};

/** null when SCRIBASE_MAIL_KEY isn't configured on this deployment — callers must not silently skip the send in that case (unlike a nice-to-have digest), since no magic link means no self-serve Pro access at all. */
export function loadScribaseMailEnv(): ScribaseMailEnv | null {
  const key = process.env.SCRIBASE_MAIL_KEY;
  if (!key) return null;
  return {
    url: process.env.SCRIBASE_MAIL_URL || DEFAULT_SCRIBASE_MAIL_URL,
    key,
    fromLocal: process.env.SCRIBASE_MAIL_FROM_LOCAL || "pro",
    fromName: process.env.SCRIBASE_MAIL_FROM_NAME || "HomePlan",
  };
}

export type SendEmailInput = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Stable id for this exact send (same id = same email) so a retry is never delivered twice. */
  readonly idempotencyKey: string;
  readonly tags?: readonly string[];
};

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Scribase Mail's idempotency_key (8-200 chars) — a hash, never the raw email/token. */
export async function mailIdempotencyKey(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`homeplan-pro-claim:${seed}`));
  return `homeplan-${hex(digest)}`;
}

/** Sends through Scribase Mail. Returns whether it actually accepted (202) the message; never throws — callers decide how a failed send should be reported back to the caller. */
export async function sendEmail(env: ScribaseMailEnv, input: SendEmailInput): Promise<boolean> {
  const body = {
    product: "homeplan",
    project: "homeplan",
    to: input.to,
    from_local: env.fromLocal,
    from_name: env.fromName,
    subject: input.subject,
    html: input.html,
    text: input.text,
    idempotency_key: input.idempotencyKey,
    ...(input.tags?.length ? { tags: [...input.tags] } : {}),
  };
  try {
    const response = await fetch(env.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (response.status === 202) return true;
    const detail = await response.text().catch(() => "");
    console.error("HomePlan Scribase Mail: send refused", response.status, detail.slice(0, 200));
    return false;
  } catch (error: unknown) {
    console.error("HomePlan Scribase Mail: send threw", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The real magic-link email: opening this link is the only way to prove ownership of the email and get the Pro session cookie (app/api/pro/verify). */
export function proClaimLinkEmail(to: string, link: string, ttlMinutes: number): { subject: string; html: string; text: string } {
  const subject = "Confirm your HomePlan Pro access";
  const text = [
    `Click to confirm HomePlan Pro access for ${to}:`,
    link,
    "",
    `This link works once and expires in ${ttlMinutes} minutes.`,
    "If you didn't request this, you can ignore this email — no access is granted until the link above is opened.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2330">
<p>Click to confirm HomePlan Pro access for <strong>${escapeHtml(to)}</strong>:</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1d2330;color:#ffffff;text-decoration:none">Confirm Pro access</a></p>
<p style="color:#5b6475">This link works once and expires in ${ttlMinutes} minutes.</p>
<p style="color:#5b6475">If you didn't request this, you can ignore this email — no access is granted until the link above is opened.</p>
</body></html>`;
  return { subject, html, text };
}
