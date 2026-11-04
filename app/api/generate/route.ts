import { NextResponse } from "next/server";
import { parseDescription } from "@/lib/parseDescription";
import { generateFloorPlanOptions } from "@/lib/layout/generate";
import { generateMultiStoryOptions } from "@/lib/layout/multiStory";
import { isProRequest, GENERATE_PRO_REQUIRED_BODY } from "@/lib/proGate";
import {
  buildArchitectFitEvidence,
  finalizeArchitectFitReason,
  scoreArchitectFit,
  type ArchitectFitDeps,
  type ArchitectFitResult,
} from "@/lib/architectFit";
import type { BriefInput } from "@/lib/layout/types";

interface GenerateRequestBody {
  description?: unknown;
  /** Optional explicit story count from the UI toggle — overrides whatever the description implies. */
  stories?: unknown;
  /** Optional explicit L-shaped-footprint toggle from the UI — overrides whatever the description implies. Ignored for stories===2 (v1 scope, see lib/layout/types.ts). */
  lShaped?: unknown;
}

/**
 * Reads EVREN_LLM_API_KEY/EVREN_LLM_BASE_URL directly (same style as sahibinden's
 * evrenRiskDepsFromEnv in packages/db/src/repository/listings.ts): unset means the
 * feature is simply off, nothing else in this route breaks. Mirrors Bidstage's
 * lib/services.ts aiFitDeps() and sahibinden's shape for the same gateway.
 */
function architectFitDepsFromEnv(): ArchitectFitDeps | null {
  const apiKey = process.env.EVREN_LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = process.env.EVREN_LLM_BASE_URL?.trim() || "https://evren-llmapi.ssyz.org.tr";
  return {
    baseUrl,
    apiKey,
    fetch: globalThis.fetch.bind(globalThis),
    log: (event, detail) => console.error(`homeplan architect-fit: ${event}`, detail ?? {}),
  };
}

/**
 * Additive lead-quality judgment on top of the real plan response below: never blocks
 * or delays it (see this module's own callsite), and any failure (gateway down, missing
 * key, unparseable response) returns null here so the response just omits `architectFit`
 * -- same fail-open contract as evren-fit.ts/evren-risk.ts's callers. Grounds the model's
 * tier/reason against the real deterministic facts already in hand (see
 * finalizeArchitectFitReason) before returning it.
 */
async function computeArchitectFit(brief: BriefInput, hitProGate: boolean): Promise<ArchitectFitResult | null> {
  const deps = architectFitDepsFromEnv();
  if (!deps) return null;

  const fitInput = { brief, hitProGate };
  const result = await scoreArchitectFit(deps, fitInput);
  if (!result) return null;

  return finalizeArchitectFitReason(result, buildArchitectFitEvidence(fitInput));
}

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const description = body.description;
  if (typeof description !== "string" || description.trim().length < 5) {
    return NextResponse.json(
      { error: "Please provide a short description of the home (at least 5 characters)." },
      { status: 400 },
    );
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: "Description is too long (max 2000 characters)." }, { status: 400 });
  }

  if (body.stories !== undefined && body.stories !== 1 && body.stories !== 2) {
    return NextResponse.json({ error: "'stories' must be 1 or 2." }, { status: 400 });
  }
  if (body.lShaped !== undefined && typeof body.lShaped !== "boolean") {
    return NextResponse.json({ error: "'lShaped' must be a boolean." }, { status: 400 });
  }

  const parsed = parseDescription(description);
  let input = body.stories === undefined ? parsed : { ...parsed, stories: body.stories as 1 | 2 };
  if (body.lShaped !== undefined) input = { ...input, lShaped: body.lShaped as boolean };

  // Also doubles as the architect-fit "did this brief ask for a Pro-only feature" signal
  // below, regardless of whether the gate actually blocks this particular request.
  const requestedProFeature = input.stories === 2 || input.lShaped === true;

  // Multi-story and L-shaped massing are Pro features on the hosted deployment. Gated on the
  // *final* resolved input, not just the raw toggle fields in the request body — parseDescription
  // itself detects "2-story"/"L-shaped" from free text (see lib/parseDescription.ts), so a free-tier
  // caller could otherwise bypass the toggle gate entirely just by phrasing the brief that way.
  // Self-host (no DATABASE_URL) is unaffected: isProRequest short-circuits to true there.
  if (requestedProFeature && !(await isProRequest(request))) {
    return NextResponse.json(GENERATE_PRO_REQUIRED_BODY, { status: 402 });
  }

  // L-shaped massing is single-story-only v1 (see lib/layout/types.ts) — the multi-story
  // engine never reads `lShaped`, so this is a silent no-op rather than a 400 for a
  // combination the UI already prevents (the toggle only shows for the 1-story case).
  const options = input.stories === 2 ? generateMultiStoryOptions(input) : generateFloorPlanOptions(input);

  // Additive lead-quality signal for the funnel dashboard (Railyard Insights) — computed
  // after the real plan response above, never blocking or delaying it. null (no EVREN key
  // configured, gateway error, etc.) just omits `architectFit` from the response below.
  const architectFit = await computeArchitectFit(input, requestedProFeature);

  return NextResponse.json({ input, options, ...(architectFit ? { architectFit } : {}) });
}
