import { NextResponse } from "next/server";
import { generateFloorPlanOptions } from "@/lib/layout/generate";
import { vectorizeFloorPlanImage } from "@/lib/visionBrief";

// The free-tier reasoning model in the fallback chain (lib/visionBrief.ts) can take
// 10-20s to respond; the two instant models ahead of it fail fast on 429 when
// rate-limited. Default Vercel function duration (10s) isn't enough headroom for
// the full chain, so this route gets a longer budget.
export const maxDuration = 60;

interface VectorizeRequestBody {
  imageDataUrl?: unknown;
  brief?: unknown;
}

const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000; // ~8MB binary, base64-inflated, matching UploadPlanForm's MAX_IMAGE_BYTES

/**
 * Real automated upload-plan vectorization: a human uploads a floor-plan image,
 * this route calls a free vision-capable OpenRouter model to read bedroom/bath
 * counts, sqft, and layout flags out of it, and runs those through the same
 * real geometry engine (lib/layout/generate.ts) the manual "Describe" tab uses.
 *
 * Never the only path: on any failure (model unavailable, malformed response,
 * no credential configured) this returns a structured error and the caller
 * (app/page.tsx) falls back to the existing manual trace-over flow — the image
 * still becomes a reference layer in the Studio editor either way.
 */
export async function POST(request: Request) {
  let body: VectorizeRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const imageDataUrl = body.imageDataUrl;
  if (typeof imageDataUrl !== "string" || imageDataUrl.length === 0) {
    return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
  }
  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return NextResponse.json({ error: "Image is too large." }, { status: 400 });
  }

  const briefRaw = body.brief;
  const brief = typeof briefRaw === "string" ? briefRaw.trim().slice(0, 2000) : "";

  const result = await vectorizeFloorPlanImage(imageDataUrl, brief);
  if ("code" in result) {
    // 503 (not transient client error) — tells the caller to fall back, not to retry the same request.
    return NextResponse.json({ error: result.message, code: result.code }, { status: 503 });
  }

  const options = generateFloorPlanOptions(result.input);
  return NextResponse.json({
    input: result.input,
    options,
    summary: result.summary,
    modelUsed: result.modelUsed,
    source: "vectorized",
  });
}
