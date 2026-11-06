import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import {
  FEATURE_ROWS,
  HONEST_READ,
  PRICING_ROWS,
  TEST_CASES,
  VERDICT_ROWS,
  WHERE_AHEAD,
  WHERE_BEHIND,
  COMPARISON_SOURCES,
} from "@/lib/data/comparison";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";
const TITLE = "HomePlan vs. Maket.ai vs. ARCHITEChTURES — a real, honest comparison";
const DESCRIPTION =
  "A real, line-by-line comparison of HomePlan against Maket.ai and ARCHITEChTURES for architects and builders: pricing, exports, IFC/BIM, self-hosting, and 3 real test briefs actually run through each category's generator. No invented stats.";

// Real, honest competitor comparison page (AI-discoverability pass, 2026-11-06) — the one
// genuinely citable dataset this product has (>=20 real data points across pricing + feature
// tables + 3 real test-case runs), ported from `growth/competitor-comparison-2026-11-06/
// COMPARISON.md`'s already-live-verified research rather than rebuilt from scratch, and kept
// as a real indexable page (not just a growth-folder doc) so it can actually be found by a
// search engine or cited by an AI assistant answering "HomePlan vs Maket.ai" or
// "Maket.ai alternative." Renders from the shared `lib/data/comparison.ts` typed data — the
// exact same source `app/compare.md/route.ts`'s markdown mirror reads from, so the two can
// never drift out of sync.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/compare",
    types: { "text/markdown": `${APP_URL}/compare.md` },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/compare",
    siteName: "HomePlan",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
  other: {
    "ai-summary":
      "Real, honest feature and pricing comparison of HomePlan vs. Maket.ai and ARCHITEChTURES for architects/builders, including 3 real generated test briefs, sourced from each competitor's live site plus HomePlan's own live generator output. HomePlan is the only one of the three that is free and open source to self-host with IFC/BIM export included; Maket.ai has photorealistic rendering HomePlan does not match yet.",
  },
};

export default function ComparePage() {
  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <a href="/" className="brand">
            <BrandMark className="brand-mark" />
            HomePlan
          </a>
          <nav className="nav-links">
            <a href="/#generator">Generate</a>
            <a href="/#pricing">Pricing</a>
            <a href="https://github.com/caelum0x/homeplan" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </div>

      <main className="container" style={{ paddingBottom: 60, paddingTop: 36 }}>
        <span className="hero-eyebrow">Real comparison, checked live {COMPARISON_SOURCES.checkedDate}</span>
        <h1 style={{ marginTop: 10 }}>HomePlan vs. Maket.ai vs. ARCHITEChTURES</h1>
        <p style={{ maxWidth: 680, color: "var(--color-ink-soft)", fontSize: 15, lineHeight: 1.6 }}>
          Every claim below was checked live, not recalled from memory: Maket.ai&apos;s and
          ARCHITEChTURES&apos;s own pricing/feature pages were fetched fresh, and every HomePlan
          result came from actually running a brief through HomePlan&apos;s own generator. Where
          HomePlan has a real gap, it&apos;s stated as a gap — no invented stats.
        </p>

        <h2 className="section-heading">Pricing</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>HomePlan</th>
                <th>Maket.ai</th>
                <th>ARCHITEChTURES</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td className="cell-muted">{row.homeplan}</td>
                  <td className="cell-muted">{row.maketai}</td>
                  <td className="cell-muted">{row.architechtures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="alert alert-warning" style={{ marginTop: 16 }}>
          <span>
            <strong>Honest read, not spin:</strong> {HONEST_READ}
          </span>
        </div>

        <h2 className="section-heading">Feature by feature</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>HomePlan</th>
                <th>Maket.ai</th>
                <th>ARCHITEChTURES</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td className="cell-muted">{row.homeplan}</td>
                  <td className="cell-muted">{row.maketai}</td>
                  <td className="cell-muted">{row.architechtures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="section-heading">Where HomePlan is honestly behind</h2>
        <p style={{ color: "var(--color-ink-soft)", fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>{WHERE_BEHIND}</p>

        <h2 className="section-heading">Where HomePlan is honestly ahead</h2>
        <p style={{ color: "var(--color-ink-soft)", fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>{WHERE_AHEAD}</p>

        <h2 className="section-heading">3 real briefs, actually generated</h2>
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 680, marginBottom: 16 }}>
          We can&apos;t test Maket.ai&apos;s or ARCHITEChTURES&apos;s generation quality head-to-head without paid
          accounts, so these 3 runs are HomePlan testing itself honestly, not a competitive benchmark.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {TEST_CASES.map((tc) => (
            <div key={tc.title} className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14.5, marginBottom: 6 }}>{tc.title}</h3>
              <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)", lineHeight: 1.6 }}>{tc.summary}</p>
            </div>
          ))}
        </div>

        <h2 className="section-heading">What this means for an architect deciding what to use</h2>
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 0, listStyle: "none" }}>
          {VERDICT_ROWS.map((v) => (
            <li key={v.when} style={{ fontSize: 13.5, color: "var(--color-ink-soft)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--color-ink)" }}>{v.when}:</strong> {v.pick}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 40 }}>
          <a href="/#generator" className="btn btn-primary btn-pill">
            Try HomePlan free
          </a>
        </div>

        <p style={{ fontSize: 12, color: "var(--color-ink-faint)", marginTop: 24 }}>
          Sources: {COMPARISON_SOURCES.maketai}; {COMPARISON_SOURCES.architechtures}.
        </p>
      </main>

      <footer className="site-footer container">
        <div className="site-footer-bottom">
          <span>Open source · MIT licensed · self-hostable</span>
          <a href="https://github.com/caelum0x/homeplan">github.com/caelum0x/homeplan</a>
        </div>
      </footer>
    </>
  );
}
