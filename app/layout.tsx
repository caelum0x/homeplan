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
const DESCRIPTION =
  "Describe a home in plain language and get a real, computed floor plan with room-by-room dimensions. Open source, self-hostable.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  // Real Open Graph/Twitter Card tags — previously missing entirely (confirmed by the
  // 2026-10-27 hero-image session: it grepped layout.tsx/page.tsx for any og:image/
  // twitter:image reference and found none). Without these, every share of this link on
  // Reddit/Twitter/X/LinkedIn/a launch-site listing renders as a bare blue link with no
  // preview card, which is a real drag on click-through for an OSS tool that depends on
  // outbound distribution for its only real traffic. Reuses the real, already-live
  // `public/hero-3d.png` product screenshot (2060x1042, ~1.98:1 — close to the
  // recommended 1.91:1 OG aspect ratio) as the preview image, not a placeholder.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "HomePlan",
    type: "website",
    images: [{ url: "/hero-3d.png", width: 2060, height: 1042, alt: "HomePlan floor plan generator — 3D massing view with cut doors and furniture" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/hero-3d.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
