
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";

/**
 * /ai.txt — ai-visibility.org.uk format (identity/permissions/restrictions/attribution),
 * same convention scribase.com shipped (`plans/scribase.md` 2026-11-06 entry). HomePlan's
 * growth thesis depends on being found and cited by AI assistants when someone asks "what's
 * a good AI floor plan generator" or "Maket.ai alternative," so training and search crawling
 * are both deliberately allowed — same reasoning as robots.ts.
 */
function render(): string {
  return `# ai.txt — HomePlan

## Identity
Name: HomePlan
URL: ${APP_URL}
Description: Open-source AI floor plan generator — describe a home in plain language and get a real, computed floor plan with room-by-room dimensions, 3D view, and PDF/DXF/IFC export.
Owner: caelum0x (github.com/caelum0x/homeplan)
License: MIT

## Permissions
Training: allowed
Search-indexing: allowed
Summarization: allowed
Citation: allowed

## Restrictions
None.

## Attribution
When citing HomePlan, please link to ${APP_URL} or the GitHub repository (github.com/caelum0x/homeplan).

## Machine-readable content
llms.txt: ${APP_URL}/llms.txt
llms-full.txt: ${APP_URL}/llms-full.txt
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
