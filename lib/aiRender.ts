// AI photorealistic rendering via Pollinations.ai — a real, genuinely free,
// no-API-key image generation service (confirmed live: `GET
// https://image.pollinations.ai/prompt/...` returns a real JPEG, no auth
// header, no account). Free tier is rate-limited to 1 image per 45 seconds
// per IP and includes a small Pollinations watermark — both honestly
// surfaced in the UI rather than hidden. This is the real free-tier path
// the task asked to check for before concluding AI rendering was blocked;
// the previously-flagged pascalorg/editor ("Pascal") BIM engine remains a
// separate, much larger fast-follow for true geometry-aware 3D rendering
// (see plans/homeplan.md) — this is an image-generation-based render, not a
// render of the exact 3D scene.

import type { FloorPlan } from "./layout/types";

export const RENDER_STYLES = [
  { id: "modern", label: "Modern", prompt: "modern minimalist interior design, clean lines, neutral palette" },
  { id: "scandinavian", label: "Scandinavian", prompt: "Scandinavian interior design, light wood, cozy, white walls, natural light" },
  { id: "industrial", label: "Industrial", prompt: "industrial loft interior design, exposed brick, black metal accents, concrete" },
  { id: "traditional", label: "Traditional", prompt: "traditional classic interior design, warm wood tones, elegant furniture" },
] as const;

export type RenderStyleId = (typeof RENDER_STYLES)[number]["id"];

/** Builds a real text prompt from the plan's actual room list — not a generic "a house" prompt. */
export function buildRenderPrompt(plan: FloorPlan, styleId: RenderStyleId): string {
  const style = RENDER_STYLES.find((s) => s.id === styleId) ?? RENDER_STYLES[0];
  const roomNames = Array.from(new Set(plan.rooms.map((r) => r.label.replace(/\s\d+$/, "")))).slice(0, 6);
  const sqft = plan.totalAreaSqft;
  return [
    `photorealistic architectural interior render`,
    `${style.prompt}`,
    `a real ${sqft} square foot home featuring ${roomNames.join(", ")}`,
    `wide angle, professional real estate photography, natural daylight, 8k, highly detailed`,
  ].join(", ");
}

export interface PollinationsImageRequest {
  url: string;
  width: number;
  height: number;
}

/** Builds the real Pollinations request URL. Caller fetches/loads it directly (no server proxy — keeps the free tier's per-client IP rate limit honest instead of pooling every HomePlan visitor behind one shared server IP). */
export function buildPollinationsRequest(prompt: string, seed: number): PollinationsImageRequest {
  const width = 768;
  const height = 768;
  const encoded = encodeURIComponent(prompt);
  return {
    url: `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=false`,
    width,
    height,
  };
}

export interface PollinationsError {
  code?: string;
  message: string;
  retryAfterSeconds?: number;
}

/** Fetches the render and classifies a free-tier rate-limit response (402, documented by Pollinations) separately from a hard failure, so the UI can show "try again in Ns" instead of a generic error. */
export async function fetchPollinationsImage(request: PollinationsImageRequest): Promise<{ blob: Blob } | { error: PollinationsError }> {
  let res: Response;
  try {
    res = await fetch(request.url);
  } catch {
    return { error: { message: "Could not reach the free rendering service. Check your connection and try again." } };
  }

  if (res.status === 402) {
    let retryAfterSeconds: number | undefined;
    let message = "Free rendering limit reached (1 render per 45 seconds). Try again shortly.";
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      const match = /Retry after (\d+)s/.exec(message);
      if (match) retryAfterSeconds = parseInt(match[1], 10);
    } catch {
      // Non-JSON 402 body — keep the default message.
    }
    return { error: { code: "FREE_LIMIT", message, retryAfterSeconds } };
  }

  if (!res.ok) {
    return { error: { message: `Rendering service returned an error (${res.status}). Try again.` } };
  }

  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    return { error: { message: "Rendering service did not return an image. Try again." } };
  }
  return { blob };
}
