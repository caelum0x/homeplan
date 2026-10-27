import type { BriefInput } from "./layout/types";

// Real automated upload-plan vectorization. Uses a working OpenRouter credential
// (confirmed live 2026-10-27: resolves a real user_id, never 401 — unlike the
// previously-configured OPENAI_API_KEY which returned 401 "User not found" and
// is documented as dead in plans/homeplan.md). Deliberately does NOT ask the
// vision model for pixel/fractional room coordinates and trust them as final
// geometry — free-tier vision models hallucinate coordinates. Instead it asks
// for the same bounded counts a human types into the "Describe" tab (bedrooms,
// bathrooms, sqft, open-plan/garage/office/dining flags), which flow through the
// exact same real geometry engine (lib/layout/generate.ts) that already powers
// manual entry. The manual trace-over upload flow (components/UploadPlanForm.tsx)
// remains the fallback whenever this returns an error — it is never removed.

const VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
] as const;

const SYSTEM_PROMPT = [
  "You are analyzing a floor plan image (a scan, photo, or export of an architectural drawing).",
  "Count the distinct rooms you can identify and estimate the home's specs.",
  "Respond with ONLY a single JSON object, no markdown fences, no prose, matching exactly this shape:",
  '{"bedrooms": number, "bathrooms": number, "sqft": number, "openPlan": boolean, "hasGarage": boolean, "hasOffice": boolean, "hasDining": boolean, "summary": string}',
  "bedrooms and bathrooms are counts of those room types you can see in the image.",
  "sqft is your best estimate of total interior square footage from the drawing's scale/proportions (if no scale is visible, estimate from typical room sizes).",
  "openPlan is true only if the kitchen and living/great room appear to share one open space with no wall between them.",
  "hasGarage/hasOffice/hasDining are true only if that room type is visibly present.",
  "summary is one short sentence describing what you see (used as a human-readable caption, not parsed).",
  "If the image is not a floor plan at all, still respond with your best-effort JSON using your best guess rather than refusing.",
  "If you think step by step before answering, keep that reasoning to one or two short sentences, then output the JSON object.",
].join(" ");

export type VectorizeErrorCode = "not_configured" | "invalid_image" | "all_models_unavailable" | "network_error";

export interface VectorizeError {
  code: VectorizeErrorCode;
  message: string;
}

export interface VectorizeSuccess {
  input: BriefInput;
  summary: string;
  modelUsed: string;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pulls the first balanced-looking JSON object out of a model response, tolerating stray markdown fences some free models still add despite instructions. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function toBriefInput(raw: Record<string, unknown>, rawImageHint: string): { input: BriefInput; summary: string } | null {
  const bedroomsRaw = raw.bedrooms;
  const bathroomsRaw = raw.bathrooms;
  const sqftRaw = raw.sqft;
  if (typeof bedroomsRaw !== "number" || typeof bathroomsRaw !== "number" || typeof sqftRaw !== "number") return null;
  if (!Number.isFinite(bedroomsRaw) || !Number.isFinite(bathroomsRaw) || !Number.isFinite(sqftRaw)) return null;

  const summary = typeof raw.summary === "string" && raw.summary.trim().length > 0 ? raw.summary.trim().slice(0, 300) : "Vectorized from your uploaded image.";

  const input: BriefInput = {
    bedrooms: clamp(Math.round(bedroomsRaw), 1, 8),
    bathrooms: clamp(Math.round(bathroomsRaw * 2) / 2, 1, 6),
    sqft: clamp(Math.round(sqftRaw), 400, 12000),
    openPlan: raw.openPlan === true,
    hasGarage: raw.hasGarage === true,
    hasOffice: raw.hasOffice === true,
    hasDining: raw.hasDining === true,
    raw: rawImageHint,
  };
  return { input, summary };
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

async function callModel(
  env: OpenRouterEnv,
  model: string,
  imageDataUrl: string,
  brief: string,
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
        // 3000 isn't needless padding: the nvidia/nemotron reasoning model spends
        // ~1200-1500 tokens thinking before it emits the JSON even when told to be
        // brief (confirmed live 2026-10-27) — anything lower returns finish_reason
        // "length" with a null content field. Instant (non-reasoning) models like
        // the gemma ones just stop early at "stop" well under this ceiling.
        max_tokens: 3000,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: brief ? `Rough brief provided by the uploader: "${brief}". Use it only as a hint; trust the image for actual counts.` : "No brief text was provided — rely entirely on the image." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    return { ok: false, retryable: true, networkError: true };
  }

  if (!res.ok) {
    // 429 (rate limit) and 404 (model deprecated/unavailable on this account) are the
    // documented shared-free-tier failure modes — try the next model in the list.
    const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    return { ok: false, retryable, networkError: false };
  }

  const body = (await res.json().catch(() => null)) as OpenRouterChatResponse | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) return { ok: false, retryable: true, networkError: false };
  return { ok: true, content };
}

/**
 * Real AI vectorization of an uploaded floor-plan image: tries each free
 * vision-capable OpenRouter model in order (shared free-tier pools rate-limit
 * and rotate availability, hence the fallback chain) and returns the same
 * BriefInput shape the manual "Describe" tab produces, so the result flows
 * through the existing real geometry engine rather than trusting raw LLM
 * coordinates as final output.
 */
export async function vectorizeFloorPlanImage(imageDataUrl: string, brief: string): Promise<VectorizeSuccess | VectorizeError> {
  const env = loadOpenRouterEnv();
  if (!env) {
    return { code: "not_configured", message: "Automated vectorization isn't configured on this deployment yet." };
  }
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(imageDataUrl)) {
    return { code: "invalid_image", message: "That doesn't look like a supported image (PNG/JPG/WEBP/GIF)." };
  }

  let sawNetworkError = false;
  for (const model of VISION_MODELS) {
    const result = await callModel(env, model, imageDataUrl, brief);
    if (!result.ok) {
      if (!result.retryable) {
        return { code: "all_models_unavailable", message: "The vectorization service rejected the request. Falling back to manual tracing." };
      }
      sawNetworkError = sawNetworkError || result.networkError;
      continue;
    }
    const parsed = extractJsonObject(result.content);
    if (!parsed) continue;
    const mapped = toBriefInput(parsed, brief || "Vectorized from uploaded floor plan image.");
    if (!mapped) continue;
    return { input: mapped.input, summary: mapped.summary, modelUsed: model };
  }

  return sawNetworkError
    ? { code: "network_error", message: "Could not reach the vectorization service. Falling back to manual tracing." }
    : { code: "all_models_unavailable", message: "All free vectorization models are rate-limited right now. Falling back to manual tracing." };
}
