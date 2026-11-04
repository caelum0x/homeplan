import type { MetadataRoute } from "next";

// Real gap found 2026-11-04 SEO audit: /sitemap.xml returned a plain 404 on the live
// site (verified with curl against the production Vercel URL before this file existed),
// and nothing in app/ or public/ referenced one. Only one real indexable page exists
// today (app/page.tsx — the homepage/app shell itself; /pro/access and /pro/success are
// post-checkout utility pages with no standalone SEO value, same ones excluded in
// robots.ts), so this is intentionally a single real URL, not padding.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
