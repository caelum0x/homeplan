import { NextResponse } from "next/server";
import { applyChatCommand } from "@/lib/layout/chatEdit";
import { interpretChatCommandWithAI } from "@/lib/layout/chatEditAI";
import type { FloorPlan } from "@/lib/layout/types";

// The free-tier text models in the fallback chain (lib/layout/chatEditAI.ts) can take
// several seconds each when more than one is tried in sequence — same reasoning as
// app/api/vectorize-plan/route.ts and app/api/zoning/route.ts, which already extend
// the default Vercel function duration for the same OpenRouter fallback-chain pattern.
export const maxDuration = 30;

interface ChatEditRequestBody {
  plan?: unknown;
  command?: unknown;
}

function isPlan(value: unknown): value is FloorPlan {
  const plan = value as FloorPlan | undefined;
  return !!plan && Array.isArray(plan.rooms) && !!plan.footprint;
}

/**
 * Server-side AI-assisted fallback for the chat-edit panel (components/ChatEditPanel.tsx).
 * The primary, free, instant path (lib/layout/chatEdit.ts's regex parser) runs entirely
 * client-side and never reaches this route at all — it only gets called once that parser
 * has already rejected the exact command as not matching its known grammar.
 *
 * Re-runs the deterministic parser here too (defense in depth, not just UI discipline):
 * this keeps every real AI-assist call genuinely scoped to phrasings outside the known
 * grammar, rather than leaving an easy way to burn a free-tier model call on a command
 * the free regex path already understands, by calling this route directly.
 */
export async function POST(request: Request) {
  let body: ChatEditRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  if (!isPlan(body.plan)) {
    return NextResponse.json({ ok: false, message: "Request must include a valid 'plan' object." }, { status: 400 });
  }
  if (typeof body.command !== "string" || body.command.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "Request must include a non-empty 'command' string." }, { status: 400 });
  }

  const deterministic = applyChatCommand(body.plan, body.command);
  if (deterministic.ok) {
    return NextResponse.json(deterministic);
  }

  const result = await interpretChatCommandWithAI(body.plan, body.command);
  return NextResponse.json(result);
}
