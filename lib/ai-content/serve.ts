import type { AiPage } from "@/lib/ai-content/pages";
import { APP_URL } from "@/lib/ai-content/pages";

/**
 * Shared response builder for every markdown-mirror route (`app/index.md/route.ts`,
 * `app/compare.md/route.ts`). Headers follow the same spec this product's reference
 * implementation (scribase.com, `plans/scribase.md` 2026-11-06 entry) already shipped:
 * `text/markdown`, `noindex, follow` (the real HTML page is what should rank — this is a
 * machine-readable mirror, not a duplicate to index), and `Content-Location`/`Link:
 * rel="canonical"` pointing back at the real HTML page.
 */
export function buildMarkdownResponse(page: AiPage): Response {
  const htmlUrl = `${APP_URL}${page.path}`;
  return new Response(page.render(), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
      "Content-Location": htmlUrl,
      Link: `<${htmlUrl}>; rel="canonical"`,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
