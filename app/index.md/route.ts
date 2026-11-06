import { AI_PAGES } from "@/lib/ai-content/pages";
import { buildMarkdownResponse } from "@/lib/ai-content/serve";


const page = AI_PAGES.find((p) => p.path === "/")!;

export function GET(): Response {
  return buildMarkdownResponse(page);
}
