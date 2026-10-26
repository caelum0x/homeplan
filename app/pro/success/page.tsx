export default function ProSuccessPage() {
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
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>You&apos;re in — thanks for subscribing to HomePlan Pro</h1>
      <p style={{ color: "#555", marginBottom: 8 }}>
        Your payment went through. We set up hosted Pro access by hand today (no self-serve accounts yet) —
        email <a href="mailto:hello@homeplan.dev">hello@homeplan.dev</a> from the address you checked out with
        and we&apos;ll confirm access within one business day.
      </p>
      <p style={{ color: "#777", fontSize: 13, marginBottom: 24 }}>
        Everything in the free self-host (generator, Studio editor, PDF/DXF export, 3D view) already works at{" "}
        <a href="/">the live app</a> — Pro adds hosted convenience, priority support, and funds continued
        development.
      </p>
      <a href="/" style={{ color: "#1f2937", fontWeight: 600 }}>
        ← Back to HomePlan
      </a>
    </main>
  );
}
