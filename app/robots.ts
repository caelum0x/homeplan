import type { MetadataRoute } from "next";

// Real gap found 2026-11-04 SEO audit: /robots.txt returned a plain 404 on the live
// site (verified with curl against the production Vercel URL before this file existed).
// Next.js's file-convention route (same mechanism as sitemap.ts) generates a real
// robots.txt at build/request time — no static file needed. Only the API routes and
// the post-checkout success/claim pages are disallowed (no SEO value, and /pro/access
// carries a session claim token in some flows); every real marketing/product surface
// stays crawlable.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/pro/access", "/pro/success"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
