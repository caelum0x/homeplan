import type { MetadataRoute } from "next";

// Real gap found 2026-11-04 SEO audit: /sitemap.xml returned a plain 404 on the live
// site (verified with curl against the production Vercel URL before this file existed),
// and nothing in app/ or public/ referenced one. /pro/access and /pro/success remain
// post-checkout utility pages with no standalone SEO value, same ones excluded in
// robots.ts. A second real indexable page (app/compare/page.tsx) was added 2026-11-06
// as part of the AI-discoverability pass — a real, honest comparison vs. Maket.ai and
// ARCHITEChTURES, not padding.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${APP_URL}/compare`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
