"use client";

import { useEffect, useState } from "react";

type ClaimState = "checking" | "entitled" | "pending" | "error";

/** Polls /api/pro/claim a few times after checkout — Dodo's webhook can land a few seconds after the browser redirect back here, so one immediate check often shows "pending" even for a real, already-paid subscription. */
function useAutoClaim(email: string | null): { state: ClaimState; message: string | null } {
  const [state, setState] = useState<ClaimState>(email ? "checking" : "error");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    let attempt = 0;

    async function tryClaim() {
      attempt += 1;
      try {
        const res = await fetch("/api/pro/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = (await res.json()) as { entitled?: boolean; message?: string; error?: string };
        if (cancelled) return;
        if (res.ok && body.entitled) {
          setState("entitled");
          return;
        }
        if (attempt >= 5) {
          setState("pending");
          setMessage(body.message ?? "We couldn't confirm Pro access automatically yet.");
          return;
        }
        setTimeout(tryClaim, 2500);
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Something went wrong checking your Pro access.");
        }
      }
    }

    tryClaim();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { state, message };
}

export default function ProSuccessPage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email"));
  }, []);

  const { state, message } = useAutoClaim(email);

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "64px 20px",
        fontFamily: "var(--font-geist-sans), sans-serif",
        textAlign: "center",
      }}
    >
      {state === "checking" && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Confirming your Pro access…</h1>
          <p style={{ color: "#555" }}>This usually takes a few seconds.</p>
        </>
      )}
      {state === "entitled" && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>You&apos;re in — Pro is active</h1>
          <p style={{ color: "#555", marginBottom: 8 }}>
            Your payment went through and Pro access is confirmed automatically for <strong>{email}</strong>. You&apos;re
            recognized on this browser from now on — if you switch devices, use{" "}
            <a href="/pro/access">this link</a> to re-confirm with the same email.
          </p>
        </>
      )}
      {(state === "pending" || state === "error") && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Payment received — confirming access</h1>
          <p style={{ color: "#555", marginBottom: 8 }}>
            {message ?? "We couldn't confirm Pro access automatically yet."} You can retry anytime at{" "}
            <a href="/pro/access">/pro/access</a>, or email{" "}
            <a href="mailto:hello@homeplan.dev">hello@homeplan.dev</a> from the address you checked out with.
          </p>
        </>
      )}
      <p style={{ color: "#777", fontSize: 13, marginTop: 24, marginBottom: 24 }}>
        Everything in the free self-host (generator, Studio editor, PDF/DXF export, 3D view) already works at{" "}
        <a href="/">the live app</a> — Pro funds continued development and gets priority support.
      </p>
      <a href="/" style={{ color: "#1f2937", fontWeight: 600 }}>
        ← Back to HomePlan
      </a>
    </main>
  );
}
