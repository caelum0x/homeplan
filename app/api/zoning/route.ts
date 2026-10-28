import { NextResponse } from "next/server";
import { answerZoningQuestion, planToFacts } from "@/lib/zoningAssistant";
import type { FloorPlan } from "@/lib/layout/types";

// Same reasoning as app/api/vectorize-plan/route.ts: the free-tier reasoning models in
// the fallback chain can take 10-20s, and the default 10s Vercel function budget isn't
// enough headroom for the full chain.
export const maxDuration = 60;

interface ZoningRequestBody {
  question?: unknown;
  plan?: unknown;
  stories?: unknown;
  lotSizeSqft?: unknown;
  documentText?: unknown;
}

function isFloorPlan(value: unknown): value is FloorPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.totalAreaSqft === "number" &&
    Array.isArray(p.rooms) &&
    typeof p.footprint === "object" &&
    p.footprint !== null &&
    typeof (p.footprint as Record<string, unknown>).w === "number" &&
    typeof (p.footprint as Record<string, unknown>).h === "number"
  );
}

/**
 * Real zoning/building-code Q&A grounded in the actual plan the user generated.
 * POST { question, plan, stories?, lotSizeSqft?, documentText? } -> { answer, modelUsed, groundedOn, usedDocument }.
 * On any failure returns a structured 503/400, never a silent empty response — the UI
 * (components/ZoningPanel.tsx) surfaces the real error message.
 */
export async function POST(request: Request) {
  let body: ZoningRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.question !== "string" || body.question.trim().length < 4) {
    return NextResponse.json({ error: "A question of at least 4 characters is required." }, { status: 400 });
  }
  if (!isFloorPlan(body.plan)) {
    return NextResponse.json({ error: "A real generated plan is required to ground the answer." }, { status: 400 });
  }

  const stories = body.stories === 2 ? 2 : 1;
  const lotSizeSqft = typeof body.lotSizeSqft === "number" && Number.isFinite(body.lotSizeSqft) && body.lotSizeSqft > 0 ? body.lotSizeSqft : null;
  const documentText = typeof body.documentText === "string" ? body.documentText : null;

  const facts = planToFacts(body.plan, stories);
  const result = await answerZoningQuestion({
    question: body.question,
    facts,
    lotSizeSqft,
    documentText,
  });

  if ("code" in result) {
    const status = result.code === "invalid_input" ? 400 : 503;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result);
}
