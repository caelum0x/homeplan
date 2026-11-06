import { AI_PAGES } from "@/lib/ai-content/pages";


/** /llms-full.txt — every real public page's full markdown, concatenated, for an agent that wants everything in one fetch instead of following /llms.txt's links. */
function render(): string {
  return AI_PAGES.map((p) => `<!-- ${p.path} -->\n\n${p.render()}`).join("\n\n---\n\n");
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
