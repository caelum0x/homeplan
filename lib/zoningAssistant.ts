// Real zoning/building-code Q&A, reusing the exact free-tier OpenRouter text-model
// pattern already proven live in lib/visionBrief.ts (same multi-model fallback chain
// idea, same shared OPENROUTER_API_KEY/OPENROUTER_BASE_URL credential — confirmed
// usable for real completions this session via a direct curl against
// https://openrouter.ai/api/v1/chat/completions and https://openrouter.ai/api/v1/credits:
// the account's paid credit balance is negative (same reason AI Render's image-gen path
// is blocked, see plans/homeplan.md 2026-10-28), but `:free`-suffixed text models are
// served from OpenRouter's separate free-model daily-request pool (confirmed via
// `/api/v1/auth/key` -> free_model_daily_requests.limit: 1000/day, independent of
// credit balance) and answered real zoning questions correctly in that direct test).
//
// This is a genuinely new capability class for HomePlan vs. the rest of the app
// (document Q&A, not geometry) — closing the "Zoning/regulatory compliance assistant"
// gap identified against Maket.ai in plans/homeplan.md's 2026-10-28 feature-parity map.
//
// Honesty boundary, enforced in the system prompt below, not just described in prose:
// this has no live per-jurisdiction code database. If the user pastes a real excerpt of
// their own local zoning ordinance/building code, the model is instructed to treat that
// as the only source of truth and say plainly when the pasted text doesn't cover the
// question. If no document is pasted, it falls back to general, widely-common U.S.
// residential zoning patterns and must say so explicitly — never presented as this
// user's actual, authoritative local code.

import type { FloorPlan } from "./layout/types";

// Ordered by what this session actually confirmed live via direct OpenRouter calls
// (fast, clean one-shot answers first; the two reasoning models last since they spend
// real tokens "thinking" before the answer and are slower, even though both do work).
const TEXT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
] as const;

const MAX_QUESTION_LENGTH = 600;
const MAX_DOCUMENT_LENGTH = 8_000;

export interface PlanFacts {
  footprintW: number;
  footprintH: number;
  /** Real computed interior area (lib/layout/types.ts FloorPlan.totalAreaSqft) for the floor shown. */
  totalAreaSqft: number;
  stories: 1 | 2;
  roomLabels: string[];
  hasGarage: boolean;
  /** Bounding rectangle area is meaningfully bigger than the real interior area — a garage notch, L-shaped setback, or courtyard, not necessarily a literal "L-shaped" plan. Used only to decide whether to caveat the footprint estimate, never asserted as a specific shape. */
  nonRectangularMassing: boolean;
}

/** Derives the real facts this feature is allowed to ground an answer in — straight off the actual generated plan, never invented. */
export function planToFacts(plan: FloorPlan, stories: 1 | 2): PlanFacts {
  return {
    footprintW: plan.footprint.w,
    footprintH: plan.footprint.h,
    totalAreaSqft: plan.totalAreaSqft,
    stories,
    roomLabels: Array.from(new Set(plan.rooms.map((r) => r.label.replace(/\s\d+$/, "")))),
    hasGarage: plan.rooms.some((r) => r.type === "garage"),
    nonRectangularMassing: plan.rooms.length > 0 && plan.footprint.w * plan.footprint.h > plan.totalAreaSqft * 1.12,
  };
}

/** Rough, explicitly-labeled estimate — there is no real wall-height field anywhere in the plan data model, so this is never presented as computed fact. */
function roughHeightEstimate(stories: 1 | 2): string {
  return stories === 2
    ? "roughly 20-24 ft to the roof ridge (rough estimate: two ~9-10 ft stories plus roof — not a real structural calculation)"
    : "roughly 15-18 ft to the roof ridge (rough estimate: one ~9-10 ft story plus roof — not a real structural calculation)";
}

function buildGroundingSummary(facts: PlanFacts, lotSizeSqft: number | null): string {
  const footprintArea = Math.round(facts.footprintW * facts.footprintH * 10) / 10;
  const coverage = lotSizeSqft && lotSizeSqft > 0 ? Math.round((footprintArea / lotSizeSqft) * 1000) / 10 : null;
  const lines = [
    `Footprint (bounding rectangle): ${facts.footprintW}' x ${facts.footprintH}' (~${footprintArea} sqft)${facts.nonRectangularMassing ? " — this plan's real exterior massing is not a plain rectangle (e.g. an attached garage wing, L-shaped setback, or courtyard notch), so the true building footprint is somewhat smaller than this bounding-rectangle number, a conservative over-estimate" : ""}.`,
    `Interior floor area: ${facts.totalAreaSqft} sqft (this floor).`,
    `Stories: ${facts.stories}.`,
    `Rooms: ${facts.roomLabels.join(", ")}.`,
    `Garage: ${facts.hasGarage ? "yes" : "no"}.`,
    `Approximate overall building height: ${roughHeightEstimate(facts.stories)}.`,
  ];
  if (lotSizeSqft && lotSizeSqft > 0) {
    lines.push(`User-provided lot size: ${lotSizeSqft} sqft -> approximate lot coverage ${coverage}% (building footprint / lot size).`);
  } else {
    lines.push("No lot size was provided, so lot coverage % cannot be computed — only general lot-coverage guidance can be given.");
  }
  return lines.join("\n");
}

function buildSystemPrompt(hasDocument: boolean): string {
  return [
    "You are a zoning and residential building-code assistant built into HomePlan, a floor-plan design tool.",
    "You will be given real, computed facts about the specific floor plan the user just designed (footprint size, floor area, story count, room list, garage presence, a rough height estimate, and lot coverage if a lot size was given) — treat those as ground truth, they are real numbers from the actual plan, not invented.",
    hasDocument
      ? "You will also be given an excerpt of the user's own local zoning ordinance or building code, pasted by the user. Treat this pasted text as the ONLY authoritative source for jurisdiction-specific rules (setback distances, max height, max lot coverage, etc). If the pasted text does not clearly answer the question, say so plainly instead of guessing a specific number — you may still offer general context, clearly labeled as general, not from the document."
      : "No local zoning document was provided. You have NO live database of any specific city, county, or jurisdiction's actual zoning code. Answer using general, widely-common U.S. residential zoning/building-code patterns ONLY (for rough orientation): front setbacks commonly 15-25 ft, side setbacks commonly 5-10 ft, rear setbacks commonly 10-25 ft, max building height in single-family zones commonly 30-35 ft or 2-2.5 stories, max lot coverage commonly 30-50% of lot area. You MUST explicitly state these are general/typical patterns and NOT this user's actual local code, every time you cite a number.",
    "Reference the plan's real numbers when relevant (e.g. compute or reuse the given lot coverage %, compare the plan's height estimate against a typical limit).",
    "Keep the answer concise and practical: 3-6 sentences, plain language, no legal disclaimers boilerplate beyond one short closing reminder.",
    "Always end with exactly one short sentence reminding the user to confirm with their local planning/zoning department or a licensed architect before relying on this for an actual permit or build — this is general guidance, not a compliance check.",
    "Never claim to have checked an actual municipal code database — you have not, unless the user pasted the text themselves.",
  ].join(" ");
}

export type ZoningErrorCode = "not_configured" | "invalid_input" | "all_models_unavailable" | "network_error";

export interface ZoningError {
  code: ZoningErrorCode;
  message: string;
}

export interface ZoningAnswer {
  answer: string;
  modelUsed: string;
  groundedOn: string;
  usedDocument: boolean;
}

interface OpenRouterEnv {
  apiKey: string;
  baseUrl: string;
}

function loadOpenRouterEnv(): OpenRouterEnv | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

async function callModel(
  env: OpenRouterEnv,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: true; content: string } | { ok: false; retryable: boolean; networkError: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        // Reasoning models in this chain (nemotron-3-ultra, nemotron-3-nano-omni) spend real
        // tokens thinking before answering even at "low" effort — confirmed live this session
        // that 150-300 tokens truncates them mid-thought with an empty content field, matching
        // the same failure mode visionBrief.ts already documents for the vision models.
        max_tokens: 900,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return { ok: false, retryable: true, networkError: true };
  }

  if (!res.ok) {
    const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    return { ok: false, retryable, networkError: false };
  }

  const body = (await res.json().catch(() => null)) as OpenRouterChatResponse | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) return { ok: false, retryable: true, networkError: false };
  return { ok: true, content };
}

export interface ZoningQuestionInput {
  question: string;
  facts: PlanFacts;
  lotSizeSqft?: number | null;
  documentText?: string | null;
}

/**
 * Answers a real plain-language zoning/building-code question, grounded in the real
 * plan facts above plus (optionally) a real pasted zoning-document excerpt. Tries each
 * free OpenRouter text model in order, same shared-free-tier-rotation reasoning as
 * lib/visionBrief.ts. Never claims a live jurisdiction database — see buildSystemPrompt.
 */
export async function answerZoningQuestion(input: ZoningQuestionInput): Promise<ZoningAnswer | ZoningError> {
  const env = loadOpenRouterEnv();
  if (!env) {
    return { code: "not_configured", message: "The zoning assistant isn't configured on this deployment yet." };
  }

  const question = input.question.trim();
  if (question.length < 4 || question.length > MAX_QUESTION_LENGTH) {
    return { code: "invalid_input", message: `Question must be between 4 and ${MAX_QUESTION_LENGTH} characters.` };
  }

  const lotSizeSqft = typeof input.lotSizeSqft === "number" && Number.isFinite(input.lotSizeSqft) && input.lotSizeSqft > 0 ? input.lotSizeSqft : null;
  const documentText = input.documentText && input.documentText.trim().length > 0 ? input.documentText.trim().slice(0, MAX_DOCUMENT_LENGTH) : null;
  const groundedOn = buildGroundingSummary(input.facts, lotSizeSqft);
  const systemPrompt = buildSystemPrompt(documentText !== null);

  const userPrompt = [
    `Real facts about the user's current floor plan:`,
    groundedOn,
    documentText ? `\nThe user pasted this excerpt of their local zoning ordinance/building code:\n"""\n${documentText}\n"""` : "",
    `\nUser's question: ${question}`,
  ]
    .filter(Boolean)
    .join("\n");

  let sawNetworkError = false;
  for (const model of TEXT_MODELS) {
    const result = await callModel(env, model, systemPrompt, userPrompt);
    if (!result.ok) {
      if (!result.retryable) {
        return { code: "all_models_unavailable", message: "The zoning assistant rejected the request. Try again in a moment." };
      }
      sawNetworkError = sawNetworkError || result.networkError;
      continue;
    }
    return { answer: result.content.trim(), modelUsed: model, groundedOn, usedDocument: documentText !== null };
  }

  return sawNetworkError
    ? { code: "network_error", message: "Could not reach the zoning assistant. Try again." }
    : { code: "all_models_unavailable", message: "All free zoning-assistant models are rate-limited right now. Try again in a moment." };
}
