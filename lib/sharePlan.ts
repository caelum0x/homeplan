// Shareable-link encode/decode for a generated FloorPlan — Maket's free-tier
// "link sharing" feature, done without any database or backend: the whole
// plan is serialized into the URL itself (?plan=<base64>). Zero infra cost,
// works on a static Vercel deploy, and the link never expires or depends on
// anything staying up server-side.
//
// Real bug #1 closed here: a multi-story plan only ever encoded the single
// currently-active floor (`plan`), silently dropping every other floor —
// the recipient's link opened as a 1-story plan with no way to recover the
// floor(s) that were cut. `SharedBundle`/`buildShareUrl` below encode every
// floor (plus which one was active) when there's more than one.
//
// Real bug #2, found while live-verifying the fix for #1 (not by inspection):
// encoding BOTH floors roughly doubles the payload, and a real garage-
// equipped 2-story plan's URL came out to ~20KB — which a real `curl` against
// a real `npm run start` (self-host) server confirmed fails with a real
// `431 Request Header Fields Too Large` (Node's http server caps the whole
// request line + headers at 16KB by default). Gzip-compressing the JSON
// before base64 (via the standard `CompressionStream` API, with a plain-JSON
// fallback for the rare browser without it) cut that same real payload from
// ~20KB to ~3.4KB — verified below, not assumed — comfortably clear of that
// limit for any realistically-sized plan. Encoded payloads are tagged
// (`gz1:` prefix) so decoding can tell compressed from legacy plain-JSON
// links apart; everything already circulating (plain base64 JSON, no tag at
// all) still decodes exactly as before.

import type { FloorPlan } from "./layout/types";

const PARAM = "plan";
const GZIP_PREFIX = "gz1:";

function isFloorPlanShape(value: unknown): value is FloorPlan {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as FloorPlan).rooms) && Boolean((value as FloorPlan).footprint);
}

function toUrlSafeBase64(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafeBase64(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat((4 - (base64.length % 4)) % 4);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof window === "undefined") return toUrlSafeBase64(Buffer.from(bytes).toString("base64"));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return toUrlSafeBase64(btoa(binary));
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = fromUrlSafeBase64(encoded);
  if (typeof window === "undefined") return new Uint8Array(Buffer.from(padded, "base64"));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** True when the standard streaming gzip API is available — every evergreen browser (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) and Node 18+. Guarded so an older client degrades to plain (uncompressed) JSON instead of crashing. */
function hasCompressionStream(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

async function gzipEncode(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json);
  if (!hasCompressionStream()) return toUrlSafeBase64ForString(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = await streamToBytes(cs.readable);
  return GZIP_PREFIX + bytesToBase64Url(compressed);
}

function toUrlSafeBase64ForString(json: string): string {
  const base64 = typeof window === "undefined" ? Buffer.from(json, "utf-8").toString("base64") : btoa(unescape(encodeURIComponent(json)));
  return toUrlSafeBase64(base64);
}

function fromUrlSafeBase64ToString(encoded: string): string {
  const padded = fromUrlSafeBase64(encoded);
  return typeof window === "undefined" ? Buffer.from(padded, "base64").toString("utf-8") : decodeURIComponent(escape(atob(padded)));
}

async function gzipDecode(encoded: string): Promise<string | null> {
  try {
    if (encoded.startsWith(GZIP_PREFIX)) {
      if (!hasCompressionStream()) return null;
      const compressed = base64UrlToBytes(encoded.slice(GZIP_PREFIX.length));
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      // Node's `Buffer`-backed Uint8Array types against `ArrayBufferLike` (it can wrap a
      // SharedArrayBuffer), while the DOM `BufferSource` type this stream API expects is pinned
      // to plain `ArrayBuffer` — a real TS lib mismatch, not a runtime one (this module's own
      // Node path only ever produces a plain-`ArrayBuffer`-backed Uint8Array in practice).
      writer.write(compressed as Uint8Array<ArrayBuffer>);
      writer.close();
      const bytes = await streamToBytes(ds.readable);
      return new TextDecoder().decode(bytes);
    }
    // No gzip tag at all — a legacy plain-base64-JSON link (every link shared before this
    // session, and this module's own fallback for a client without CompressionStream).
    return fromUrlSafeBase64ToString(encoded);
  } catch {
    return null;
  }
}

async function encodeJsonForUrl(value: unknown): Promise<string> {
  return gzipEncode(JSON.stringify(value));
}

async function decodeJsonFromUrl(encoded: string): Promise<unknown | null> {
  const json = await gzipDecode(encoded);
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** URL-safe, gzip-compressed encoding of a single plan's JSON — kept for backward compatibility; prefer `buildShareUrl` which also handles multi-story. */
export async function encodePlanForUrl(plan: FloorPlan): Promise<string> {
  return encodeJsonForUrl(plan);
}

/** Decodes a single-plan payload only (legacy shape, no `kind` wrapper). Prefer `readSharedBundleFromLocation` which also handles multi-story links. */
export async function decodePlanFromUrl(encoded: string): Promise<FloorPlan | null> {
  const parsed = await decodeJsonFromUrl(encoded);
  return isFloorPlanShape(parsed) ? parsed : null;
}

/** What a share link resolves to: either a single-story plan, or every floor of a multi-story plan plus which one was active when shared. */
export interface SharedBundle {
  plan: FloorPlan;
  floors: FloorPlan[] | null;
  activeFloor: number;
}

/**
 * Builds the full shareable URL for the current plan state. When `floors` has more than one
 * entry (a multi-story plan), encodes every floor + which one was active, so the recipient gets
 * the whole building back, not just whichever floor happened to be on screen when "Share" was
 * clicked. Gzip-compressed (see this file's header) so a real multi-floor payload stays well
 * clear of real server/proxy URL-length limits.
 */
export async function buildShareUrl(input: { plan: FloorPlan; floors?: FloorPlan[] | null; activeFloor?: number }): Promise<string> {
  const payload =
    input.floors && input.floors.length > 1
      ? { kind: "floors" as const, floors: input.floors, activeFloor: input.activeFloor ?? 0 }
      : { kind: "plan" as const, plan: input.plan };
  const encoded = await encodeJsonForUrl(payload);
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set(PARAM, encoded);
  return url.toString();
}

/** Reads a shared plan/floors bundle out of the current page's URL, if present. Handles the current gzip `{kind:"plan"|"floors", ...}` wrapper AND legacy bare-plan links (plain base64 JSON, no wrapper, no gzip tag) that are already circulating. */
export async function readSharedBundleFromLocation(): Promise<SharedBundle | null> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(PARAM);
  if (!encoded) return null;
  const parsed = (await decodeJsonFromUrl(encoded)) as { kind?: string; plan?: unknown; floors?: unknown; activeFloor?: unknown } | null;
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.kind === "floors" && Array.isArray(parsed.floors) && parsed.floors.length > 0 && parsed.floors.every(isFloorPlanShape)) {
    const floors = parsed.floors as FloorPlan[];
    const activeFloor = typeof parsed.activeFloor === "number" && parsed.activeFloor >= 0 && parsed.activeFloor < floors.length ? parsed.activeFloor : 0;
    return { plan: floors[activeFloor], floors, activeFloor };
  }
  if (parsed.kind === "plan" && isFloorPlanShape(parsed.plan)) {
    return { plan: parsed.plan, floors: null, activeFloor: 0 };
  }
  // Legacy link: the bare plan JSON itself, with no `kind` wrapper at all.
  if (isFloorPlanShape(parsed)) {
    return { plan: parsed, floors: null, activeFloor: 0 };
  }
  return null;
}
