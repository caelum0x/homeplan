"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/**
 * Real monetization path for the waiting architect customer: before this, HomePlan had zero
 * way for anyone to actually pay (self-host-only, no checkout anywhere). Wires a real Dodo
 * Payments hosted checkout for a $49/mo "HomePlan Pro" subscription — same shared Dodo
 * business other products (bidstage-tenders, menivor, scribase) already process real
 * payments on, new brand+product created for HomePlan specifically. Deliberately a single
 * self-contained component (not folded into page.tsx's existing styles) so the in-flight
 * visual-redesign branch can restyle or relocate it without fighting this file's logic.
 */
interface PricingCtaProps {
  /** The real lead-quality tier from the most recent /api/generate response (lib/architectFit.ts), carried through from page.tsx's session state. Undefined when no plan has been generated yet, or the gateway call didn't run — the checkout_started event just omits it, same fail-open contract as the API response it came from. */
  architectFitTier?: "casual_browser" | "curious_homeowner" | "high_intent_architect";
}

export function PricingCta({ architectFitTier }: PricingCtaProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      // Second step of the real paying-customer funnel (see app/page.tsx's
      // plan_generated): a real Dodo checkout session was created and the
      // visitor is about to be redirected to pay, fired before the redirect
      // since nothing on this page runs after it.
      track("checkout_started", { plan: "pro", architectFitTier: architectFitTier ?? null });
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Could not reach checkout. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 48, marginBottom: 24, padding: 28 }}>
      <h2 style={{ fontSize: 22, fontWeight: 650, marginBottom: 6 }}>HomePlan Pro — $49/mo</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)", marginBottom: 16, maxWidth: 520 }}>
        Single-story rectangular layouts, editing in Studio, 3D view, and PNG export — all free
        and unlimited here, and everything is free and self-hostable (MIT) if you run your own
        instance. Pro unlocks multi-story plans, L-shaped footprints, and PDF/DXF export on this
        hosted site, plus priority support and early access to new features.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          required
          className="text-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          style={{ flex: "1 1 220px" }}
        />
        <button type="submit" disabled={loading} className="btn btn-primary btn-pill">
          {loading ? "Starting checkout…" : "Get HomePlan Pro"}
          <span className="icon-circle">
            <ArrowIcon />
          </span>
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: "var(--color-danger-text)", fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
