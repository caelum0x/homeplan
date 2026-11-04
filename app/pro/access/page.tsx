"use client";

import { useEffect, useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "sent" | "entitled" | "not-found" | "error";

const CLAIM_ERROR_MESSAGES: Record<string, string> = {
  invalid: "That confirmation link is invalid. Request a new one below.",
  used: "That confirmation link was already used or has expired. Request a new one below.",
  not_entitled: "That email no longer has active Pro access.",
  not_configured: "Pro sessions aren't configured on this deployment yet.",
};

export default function ProAccessPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimError = params.get("claim_error");
    if (claimError) {
      setStatus("error");
      setMessage(CLAIM_ERROR_MESSAGES[claimError] ?? "Could not confirm Pro access from that link.");
      return;
    }
    if (params.get("claimed") === "1") {
      void confirmSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount, reading window.location directly
  }, []);

  /** /api/pro/verify already set the session cookie by the time this page loads with ?claimed=1 — this just confirms it took and reads back which email it's for. */
  async function confirmSession() {
    try {
      const res = await fetch("/api/pro/me");
      const body = (await res.json()) as { isPro?: boolean; email?: string | null };
      if (body.isPro) {
        setStatus("entitled");
        if (body.email) setEmail(body.email);
        return;
      }
      setStatus("error");
      setMessage("Could not confirm Pro access. Try the link again or request a new one below.");
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Try again.");
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/pro/portal");
      const body = (await res.json()) as { link?: string; message?: string; error?: string };
      if (res.ok && body.link) {
        window.location.href = body.link;
        return;
      }
      setPortalError(body.message ?? body.error ?? "Could not open the billing portal.");
    } catch {
      setPortalError("Could not reach the server. Try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/pro/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { sent?: boolean; message?: string; error?: string };
      if (res.ok && body.sent) {
        setStatus("sent");
        setMessage(body.message ?? "Check your email for a confirmation link.");
        return;
      }
      setStatus(res.status === 404 ? "not-found" : "error");
      setMessage(body.message ?? body.error ?? "Could not send a confirmation email.");
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Try again.");
    }
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "64px 20px",
        fontFamily: "var(--font-geist-sans), sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Confirm HomePlan Pro access</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Already subscribed on another device or browser? Enter the email you checked out with and we&apos;ll email
        you a one-time confirmation link — no password needed.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          style={{ padding: "10px 20px", borderRadius: 8, background: "#1f2937", color: "#fff", border: "none", fontWeight: 600 }}
        >
          {status === "loading" ? "Sending…" : "Send link"}
        </button>
      </form>
      {status === "sent" && message && <p style={{ color: "#16a34a" }}>{message}</p>}
      {status === "entitled" && (
        <>
          <p style={{ color: "#16a34a" }}>Pro access confirmed on this browser{email ? ` for ${email}` : ""}.</p>
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={portalLoading}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#fff",
              color: "#1f2937",
              border: "1px solid #ddd",
              fontWeight: 600,
              marginTop: 8,
              cursor: portalLoading ? "default" : "pointer",
            }}
          >
            {portalLoading ? "Opening…" : "Manage or cancel subscription"}
          </button>
          {portalError && <p style={{ color: "#dc2626", marginTop: 8 }}>{portalError}</p>}
        </>
      )}
      {(status === "not-found" || status === "error") && message && <p style={{ color: "#dc2626" }}>{message}</p>}
      <a href="/" style={{ color: "#1f2937", fontWeight: 600, display: "inline-block", marginTop: 24 }}>
        ← Back to HomePlan
      </a>
    </main>
  );
}
