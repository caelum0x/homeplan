"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "entitled" | "not-found" | "error";

export default function ProAccessPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

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
      const body = (await res.json()) as { entitled?: boolean; message?: string; error?: string };
      if (res.ok && body.entitled) {
        setStatus("entitled");
        return;
      }
      setStatus(res.status === 404 ? "not-found" : "error");
      setMessage(body.message ?? body.error ?? "Could not check Pro access.");
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
        Already subscribed on another device or browser? Enter the email you checked out with to get
        recognized here too — no password needed.
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
          {status === "loading" ? "Checking…" : "Confirm"}
        </button>
      </form>
      {status === "entitled" && (
        <>
          <p style={{ color: "#16a34a" }}>Pro access confirmed on this browser.</p>
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
