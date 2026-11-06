import { AI_PAGES, APP_URL } from "@/lib/ai-content/pages";


/**
 * /llms.txt — llmstxt.org convention: a short, link-based index an LLM/agent can use to find
 * the real markdown mirror of every real public page, instead of trying to scrape rendered
 * client-side React. Same convention scribase.com already shipped (`plans/scribase.md`
 * 2026-11-06 entry). HomePlan only has 2 real public pages today (the generator homepage and
 * the competitor comparison page) — /pro/access and /pro/success are post-checkout utility
 * pages with no standalone content, same ones already excluded from robots.ts/sitemap.ts, so
 * they're correctly absent here too.
 */
function render(): string {
  const links = AI_PAGES.map((p) => `- [${p.title}](${APP_URL}${p.mdPath}): ${p.description}`).join("\n");
  return `# HomePlan

> Describe a home in plain language and get a real, computed floor plan with room-by-room
> dimensions and real IFC/BIM export — not an AI-generated picture. Open source (MIT),
> self-hostable, free single-story generation with no signup.

## Pages

${links}

## Full content

- [llms-full.txt](${APP_URL}/llms-full.txt): every page above, concatenated in full.

## Source

- [github.com/caelum0x/homeplan](https://github.com/caelum0x/homeplan): the real, MIT-licensed source code.
`;
}

export function GET(): Response {
  return new Response(render(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
