import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Canonical hosted URL, same source NEXT_PUBLIC_APP_URL this app already reads in
// app/api/checkout/route.ts and app/api/pro/portal/route.ts for the exact same reason:
// real production value is set in Vercel ("https://homeplan-arhansubas-projects.vercel.app"),
// this fallback only ever applies to a local/self-host build that never set it.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";
const TITLE = "HomePlan — open-source AI floor plan generator";
// Branding masterclass (gtm/BRANDING-MASTERCLASS-OWNER-2026-10-13.md) step 6: "say it the same
// way everywhere" — this is the exact audience/pain-point line added to the hero subheadline in
// app/page.tsx 2026-11-04, reused here so the same BMF positioning (real computed geometry for
// architects/builders/small teams, not an AI-generated picture) shows up in the og:description,
// twitter:description, and the SoftwareApplication JSON-LD description below, not just the hero.
const DESCRIPTION =
  "Describe a home in plain language and get a real, computed floor plan with room-by-room dimensions, not an AI-generated picture. Built for architects, builders, and small teams. Open source, self-hostable.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  // Real gap found 2026-11-04 SEO audit: no canonical tag existed anywhere (grepped
  // app/ for "canonical" before this, zero hits), and the live production URL is a
  // free-tier Vercel subdomain (homeplan-arhansubas-projects.vercel.app) that can grow
  // preview-deployment duplicates over time — a canonical pointing at the real
  // production origin is what tells search engines which URL actually counts.
  alternates: {
    canonical: "/",
    // AI-discoverability pass (2026-11-06, same pattern as scribase.com — see
    // plans/scribase.md's 2026-11-06 "AI-readable" entry): points an AI crawler/agent
    // at the real markdown mirror of this exact page (app/index.md/route.ts) instead of
    // the client-rendered React tree, via a real <link rel="alternate" type="text/markdown">.
    types: { "text/markdown": `${APP_URL}/index.md` },
  },
  // Real Open Graph/Twitter Card tags — previously missing entirely (confirmed by the
  // 2026-10-27 hero-image session: it grepped layout.tsx/page.tsx for any og:image/
  // twitter:image reference and found none). Without these, every share of this link on
  // Reddit/Twitter/X/LinkedIn/a launch-site listing renders as a bare blue link with no
  // preview card, which is a real drag on click-through for an OSS tool that depends on
  // outbound distribution for its only real traffic. Reuses the real, already-live
  // `public/hero-3d.png` product screenshot (2056x1040, ~1.98:1 — close to the
  // recommended 1.91:1 OG aspect ratio) as the preview image, not a placeholder.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "HomePlan",
    type: "website",
    images: [{ url: "/hero-3d.png", width: 2056, height: 1040, alt: "HomePlan floor plan generator — 3D massing view with cut doors and furniture" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/hero-3d.png"],
  },
  // AI-discoverability pass (2026-11-06): a one-line, fact-dense summary an AI
  // assistant can lift directly when answering "what is HomePlan" without having to
  // parse the full rendered page. Same `<meta name="ai-summary">` convention shipped
  // for scribase.com (plans/scribase.md, 2026-11-06).
  other: {
    "ai-summary":
      "HomePlan generates a real, computed floor plan (not an AI picture) with room-by-room dimensions from a plain-language description. Free single-story generation with no signup; HomePlan Pro ($49/mo hosted, free self-hosted/MIT) unlocks multi-story, L-shaped footprints, and PDF/DXF/IFC export. See /compare for an honest comparison vs. Maket.ai and ARCHITEChTURES.",
  },
};

// Real gap found 2026-11-04 SEO audit: zero JSON-LD anywhere (grepped app/, components/,
// lib/ for "application/ld+json" before this, zero hits) — no SoftwareApplication/Product
// rich-result eligibility at all. Every field below is a real, already-live fact pulled
// from this exact codebase, not invented: price/billing period match PricingCta.tsx's
// "$49/mo" copy and app/api/checkout/route.ts's real Dodo subscription; "free" single-story
// usage matches the same component's "free and unlimited here" line; featureList mirrors
// the feature cards already rendered in app/page.tsx. No aggregateRating/review — there are
// none yet, and inventing one would violate Google's structured-data guidelines.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "HomePlan",
  url: APP_URL,
  description: DESCRIPTION,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  image: `${APP_URL}/hero-3d.png`,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "Single-story rectangular layouts, Studio editing, 3D view, and PNG export — free and unlimited.",
    },
    {
      "@type": "Offer",
      name: "HomePlan Pro",
      price: "49",
      priceCurrency: "USD",
      billingDuration: "P1M",
      description: "Multi-story plans, L-shaped footprints, and PDF/DXF/IFC export on the hosted site.",
    },
  ],
  isAccessibleForFree: true,
  license: "https://github.com/caelum0x/homeplan/blob/main/LICENSE",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        {/* Railyard Insights (railyard/apps/product-analytics): cookieless page tag plus
            custom `railyard.track()` events for the real plan-generated -> checkout-started
            funnel (lib/track.ts, app/page.tsx, components/PricingCta.tsx). Site key is this
            hosted instance's own self-serve registration (2026-11-04), same pattern
            bidstage-tenders and oxhanatelier.com ship in their own root layout. */}
        <script defer src="https://insights.ereboslab.com/s.js" data-site="s_0GKZt4HKNyUP2axPH6crAjmh" />
      </body>
    </html>
  );
}
