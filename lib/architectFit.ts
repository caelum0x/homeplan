import type { BriefInput } from "./layout/types";

// Typed AI judgment of how likely a real /api/generate visitor is a serious
// prospect worth the owner's existing manual "email hello@homeplan.dev"
// outreach (the only thing that has ever produced a real HomePlan Pro lead
// so far — found and prioritized entirely by hand). Calls Evren's decision
// gateway (POST /v1/systemone, model "laya") -- same wire contract and module
// shape as done/big-projects/bidstage-tenders' match/evren-fit.ts and
// sahibinden's packages/db/src/repository/evren-risk.ts (read both first): a
// pure request/response module with no env or fetch globals baked in, so the
// only caller (app/api/generate/route.ts) injects both. Every visitor today
// is anonymous and untriaged in Railyard Insights -- this gives the funnel
// dashboard a real, queryable segmentation instead of none at all.

export const ARCHITECT_FIT_MODEL = "laya";
export const DEFAULT_ARCHITECT_FIT_TIMEOUT_MS = 8_000;

export type ArchitectFitLog = (event: string, detail?: Record<string, unknown>) => void;

export type ArchitectFitDeps = {
  /** Origin of the Evren LLM gateway, e.g. https://evren-llmapi.ssyz.org.tr */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch: typeof fetch;
  readonly log: ArchitectFitLog;
  readonly timeoutMs?: number;
};

/**
 * Fixed, reviewable reason labels. The model only ever picks one of these keys
 * (a `choice` question); the display text is ours, not generated, so every
 * reason the owner sees in the funnel dashboard is something a human already
 * approved.
 */
export const ARCHITECT_FIT_REASON_LABELS = {
  toy_brief: "A generic or placeholder-style brief with no specific constraints — reads like someone testing the tool, not planning a real home.",
  plain_homeowner_spec: "A specific, ordinary single-story home spec (room counts, sqft) — a real homeowner brief, but no professional complexity.",
  complex_professional_spec: "Multi-story and/or non-rectangular massing, with specific rooms and sizing called out — reads like a real architect or builder's own spec.",
  pro_feature_request: "The brief itself asked for a feature only Pro unlocks (multi-story or L-shaped), the clearest direct signal of upgrade intent.",
} as const;

export type ArchitectFitReasonCode = keyof typeof ARCHITECT_FIT_REASON_LABELS;

const REASON_CODES = Object.keys(ARCHITECT_FIT_REASON_LABELS) as readonly ArchitectFitReasonCode[];

export type ArchitectFitTier = "casual_browser" | "curious_homeowner" | "high_intent_architect";

const TIERS: readonly ArchitectFitTier[] = ["casual_browser", "curious_homeowner", "high_intent_architect"];

export type ArchitectFitResult = {
  readonly score: number;
  readonly tier: ArchitectFitTier;
  readonly reasonCode: ArchitectFitReasonCode;
  readonly reason: string;
};

export type ArchitectFitInput = {
  readonly brief: BriefInput;
  /** Whether this exact request hit the Pro-only multi-story/L-shaped 402 gate (app/api/generate/route.ts) — a second, independent signal of upgrade intent. */
  readonly hitProGate: boolean;
};

/** The raw brief text sent to the model; long briefs are truncated, never summarized by us. */
const MAX_RAW_CHARS = 2_000;

function state(input: ArchitectFitInput): Record<string, unknown> {
  const { brief } = input;
  return {
    brief: {
      raw: brief.raw.slice(0, MAX_RAW_CHARS),
      bedrooms: brief.bedrooms,
      bathrooms: brief.bathrooms,
      sqft: brief.sqft,
      stories: brief.stories ?? 1,
      l_shaped: brief.lShaped ?? false,
      open_plan: brief.openPlan,
      has_garage: brief.hasGarage,
      has_office: brief.hasOffice,
      has_dining: brief.hasDining,
    },
    hit_pro_gate: input.hitProGate,
  };
}

/**
 * A `score` question answers with a continuous position across these levels
 * (index 0..length-1, interpolated), never already-normalized 0..1 -- same
 * documented gotcha as evren-fit.ts's FIT_LEVELS / evren-risk.ts's RISK_LEVELS:
 * a `score` question without an explicit `criteria` level list is rejected
 * outright by the real gateway. {@link parseArchitectFit} divides by
 * `INTENT_LEVELS.length - 1` to get back to 0..1.
 */
const INTENT_LEVELS = [
  "casual browser: toy or placeholder brief, generic defaults, clearly just trying the tool",
  "leaning casual: a plain brief with little specificity",
  "curious homeowner: a specific but ordinary single-story brief, no professional complexity",
  "leaning professional: a specific brief with some real complexity (stories, shape, or named rooms)",
  "high-intent architect: multi-story and/or non-rectangular footprint, specific room program -- reads like a real professional spec",
] as const;

const QUESTIONS = {
  intent: {
    type: "score",
    instructions:
      "Score how likely the person who wrote this brief is a real architect, builder, or serious homeowner planning an actual project (high-intent) versus someone just trying the tool out (casual browser). Judge from the brief's own specificity and complexity: a toy brief ('a house', 'studio apartment') with generic defaults and no named constraints is casual. A plain but specific single-story brief (named bedroom/bathroom/sqft counts, no stories/shape complexity) is a curious homeowner. A brief that specifies multiple stories and/or a non-rectangular (L-shaped) footprint, or explicitly calls out rooms like an office/garage/dining in a real room program, reads like a professional spec. Hitting the Pro-only multi-story/L-shaped gate is itself a strong signal of real intent, since it means the visitor deliberately asked for a feature beyond the free defaults.",
    criteria: INTENT_LEVELS,
  },
  reason: {
    type: "choice",
    instructions:
      "Which single reason best explains the intent score above? Pick pro_feature_request when hit_pro_gate is true and that is the clearest driver of the score; otherwise pick whichever of the other three best matches the brief's own specificity and complexity.",
    criteria: Object.fromEntries(REASON_CODES.map((code) => [code, ARCHITECT_FIT_REASON_LABELS[code]])),
  },
} as const;

type DecisionBody = {
  readonly answers?: Record<string, { readonly score?: unknown; readonly choice?: unknown }>;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function tierFromScore(score: number): ArchitectFitTier {
  if (score >= 0.66) return "high_intent_architect";
  if (score >= 0.33) return "curious_homeowner";
  return "casual_browser";
}

/**
 * Clamps a score into the numeric range `tierFromScore` would itself map back to that
 * exact tier, so a corrected reasonCode below always lands in the tier it actually
 * implies — the model's own raw score can disagree enough with a corrected reasonCode
 * to otherwise produce two different real briefs that get different reasonCodes but
 * the same tier (verified live 2026-11-04: a toy brief and a plain homeowner brief both
 * landed on `curious_homeowner` before this, with only the reasonCode telling them apart).
 */
function clampScoreToTier(score: number, tier: ArchitectFitTier): number {
  if (tier === "high_intent_architect") return Math.max(score, 0.66);
  if (tier === "curious_homeowner") return Math.min(Math.max(score, 0.33), 0.65);
  return Math.min(score, 0.32);
}

/** Pure parse of a /v1/systemone response body; exported so callers never need a live network call to test it. */
export function parseArchitectFit(body: DecisionBody): ArchitectFitResult | null {
  const answers = body.answers ?? {};
  const intentRaw = answers.intent?.score;
  const reasonRaw = answers.reason?.choice;
  if (typeof intentRaw !== "number" || !Number.isFinite(intentRaw)) return null;
  const reasonCode = typeof reasonRaw === "string" && (REASON_CODES as readonly string[]).includes(reasonRaw) ? (reasonRaw as ArchitectFitReasonCode) : null;
  if (!reasonCode) return null;
  const score = clamp01(intentRaw / (INTENT_LEVELS.length - 1));
  return { score, tier: tierFromScore(score), reasonCode, reason: ARCHITECT_FIT_REASON_LABELS[reasonCode] };
}

/**
 * Fail-open: any network error, timeout, non-200, or unparseable body returns
 * null and is logged, never thrown. app/api/generate/route.ts's real plan
 * response is the sole authoritative path; this call can only add a lead-
 * quality tier on top of it, so a gateway outage or bad response can never
 * delay or break the actual floor-plan generation it is attached to.
 */
export async function scoreArchitectFit(deps: ArchitectFitDeps, input: ArchitectFitInput): Promise<ArchitectFitResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_ARCHITECT_FIT_TIMEOUT_MS);
  try {
    const res = await deps.fetch(`${deps.baseUrl}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${deps.apiKey}` },
      body: JSON.stringify({ model: ARCHITECT_FIT_MODEL, state: state(input), questions: QUESTIONS }),
      signal: controller.signal,
    });
    if (!res.ok) {
      deps.log("architect_fit.http_error", { status: res.status });
      return null;
    }
    const body = (await res.json()) as DecisionBody;
    const result = parseArchitectFit(body);
    if (!result) deps.log("architect_fit.unparseable_response", {});
    return result;
  } catch (error) {
    deps.log("architect_fit.failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ArchitectFitEvidence = {
  /** brief.stories === 2 */
  readonly isMultiStory: boolean;
  /** brief.lShaped === true */
  readonly isLShaped: boolean;
  readonly hitProGate: boolean;
  /** True when every numeric field (bedrooms/bathrooms/sqft) matches parseDescription's own fallback defaults -- i.e. nothing specific was actually said. */
  readonly usedAllDefaults: boolean;
};

/**
 * Grounds the model's tier/reasonCode pair against the real boolean facts
 * already in hand, same discipline as evren-fit.ts's groundAiFitReason() and
 * evren-risk.ts's groundAiRiskReason()/finalizeAiRiskReason(): both prior
 * EVREN consumers independently found the gateway can emit an internally
 * inconsistent tier/reason pair on a given call, so a label is never trusted
 * blindly here.
 *
 * Two corrections, applied in order:
 * 1. Downgrade an unsupported `complex_professional_spec` or
 *    `pro_feature_request` reason when neither real complexity signal
 *    (multi-story, L-shaped, Pro-gate hit) is actually present in evidence —
 *    mirrors groundAiFitReason's "don't repeat an unsupported model claim".
 * 2. Upgrade an incoherent `toy_brief` call when the Pro gate really was hit
 *    or the footprint really is multi-story/L-shaped — mirrors
 *    finalizeAiRiskReason's "don't let a contradictory reason suppress a
 *    signal the deterministic facts already support". A brief that hit the
 *    Pro gate can never be scored a casual_browser toy brief: deliberately
 *    asking for a paid-only feature is the strongest intent signal this
 *    product has.
 */
export function finalizeArchitectFitReason(result: ArchitectFitResult, evidence: ArchitectFitEvidence): ArchitectFitResult {
  const hasRealComplexity = evidence.isMultiStory || evidence.isLShaped || evidence.hitProGate;

  const claimsProFeature = result.reasonCode === "pro_feature_request" && !evidence.hitProGate;
  const claimsComplexSpec = result.reasonCode === "complex_professional_spec" && !hasRealComplexity;
  if (claimsProFeature || claimsComplexSpec) {
    const reasonCode: ArchitectFitReasonCode = evidence.usedAllDefaults ? "toy_brief" : "plain_homeowner_spec";
    const tier: ArchitectFitTier = evidence.usedAllDefaults ? "casual_browser" : "curious_homeowner";
    const score = clampScoreToTier(result.score, tier);
    return { ...result, score, tier, reasonCode, reason: ARCHITECT_FIT_REASON_LABELS[reasonCode] };
  }

  if (result.reasonCode === "toy_brief" && evidence.hitProGate) {
    const score = clampScoreToTier(result.score, "curious_homeowner");
    return {
      ...result,
      score,
      tier: "curious_homeowner",
      reasonCode: "pro_feature_request",
      reason: ARCHITECT_FIT_REASON_LABELS.pro_feature_request,
    };
  }
  if (result.reasonCode === "toy_brief" && (evidence.isMultiStory || evidence.isLShaped)) {
    const score = clampScoreToTier(result.score, "curious_homeowner");
    return {
      ...result,
      score,
      tier: "curious_homeowner",
      reasonCode: "complex_professional_spec",
      reason: ARCHITECT_FIT_REASON_LABELS.complex_professional_spec,
    };
  }

  return result;
}

export function buildArchitectFitEvidence(input: ArchitectFitInput): ArchitectFitEvidence {
  const { brief } = input;
  // Whether the raw brief names any number at all -- a far more reliable "nothing specific
  // was actually said" signal than comparing resolved bedrooms/bathrooms/sqft to
  // parseDescription's own fallback defaults (lib/parseDescription.ts's firstNumber): a
  // real brief that happens to ask for exactly "3 bed 2 bath 1400 sqft" would otherwise be
  // misclassified as a toy/placeholder brief just because its stated values coincide with
  // the defaults. Verified live (2026-11-04) against the real gateway: without this fix,
  // that exact brief was downgraded to toy_brief instead of plain_homeowner_spec.
  const usedAllDefaults = !/\d/.test(brief.raw);
  return {
    isMultiStory: brief.stories === 2,
    isLShaped: brief.lShaped === true,
    hitProGate: input.hitProGate,
    usedAllDefaults,
  };
}

export { TIERS as ARCHITECT_FIT_TIERS };
