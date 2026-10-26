// Shareable-link encode/decode for a generated FloorPlan — Maket's free-tier
// "link sharing" feature, done without any database or backend: the whole
// plan is serialized into the URL itself (?plan=<base64>). Zero infra cost,
// works on a static Vercel deploy, and the link never expires or depends on
// anything staying up server-side.

import type { FloorPlan } from "./layout/types";

const PARAM = "plan";

/** URL-safe base64 of the plan's JSON — no padding, +/ replaced so it survives copy/paste cleanly. */
export function encodePlanForUrl(plan: FloorPlan): string {
  const json = JSON.stringify(plan);
  const base64 = typeof window === "undefined" ? Buffer.from(json, "utf-8").toString("base64") : btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlanFromUrl(encoded: string): FloorPlan | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = typeof window === "undefined" ? Buffer.from(padded, "base64").toString("utf-8") : decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.rooms) || !parsed.footprint) return null;
    return parsed as FloorPlan;
  } catch {
    return null;
  }
}

/** Builds the full shareable URL for `plan` against the current page location. */
export function buildShareUrl(plan: FloorPlan): string {
  const encoded = encodePlanForUrl(plan);
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set(PARAM, encoded);
  return url.toString();
}

/** Reads a shared plan out of the current page's URL, if present. */
export function readPlanFromLocation(): FloorPlan | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(PARAM);
  if (!encoded) return null;
  return decodePlanFromUrl(encoded);
}
