import { NextResponse } from "next/server";
import { fitPlanToLot, type Point } from "@/lib/layout/lotFit";
import type { FloorPlan } from "@/lib/layout/types";

interface FitLotRequestBody {
  plan?: unknown;
  lot?: unknown;
  setbackFt?: unknown;
}

function isFloorPlan(value: unknown): value is FloorPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.totalAreaSqft === "number" &&
    Array.isArray(p.rooms) &&
    Array.isArray(p.walls) &&
    Array.isArray(p.doors) &&
    Array.isArray(p.furniture) &&
    typeof p.footprint === "object" &&
    p.footprint !== null &&
    typeof (p.footprint as Record<string, unknown>).w === "number" &&
    typeof (p.footprint as Record<string, unknown>).h === "number"
  );
}

function isLotPolygon(value: unknown): value is Point[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (p) => p && typeof p === "object" && typeof (p as Record<string, unknown>).x === "number" && typeof (p as Record<string, unknown>).y === "number",
    )
  );
}

/**
 * Real arbitrary lot/site-boundary fitting — see lib/layout/lotFit.ts for the full geometric
 * approach and its honestly-scoped boundaries. New, additive generation capability: free and
 * ungated on every deployment (no Pro check here, deliberately — this isn't the multi-story/
 * L-shaped generation gate, it's a separate post-generation geometric pass, and this task's own
 * brief is explicit that billing/gating code is out of scope).
 *
 * POST { plan: FloorPlan, lot: {x,y}[], setbackFt?: number }
 * -> { feasible, plan?, orientationDeg, lot, buildable, footprintAreaSqft, buildableAreaSqft, lotAreaSqft, warnings, error }
 * `plan` in the response (when feasible) is in real LOT coordinates, not re-based to the
 * origin — on purpose, so the caller (components/LotFitPanel.tsx) can draw the building
 * positioned exactly where it actually sits on the lot, alongside `lot`/`buildable`, in one
 * shared coordinate space. Before handing this plan to the rest of the app as "the" active
 * plan, the caller runs it through `normalizePlanToOrigin` (lib/layout/lotFit.ts, safe to call
 * client-side — pure data transform, no server-only dependency) so Studio/3D/export/chat-edit
 * see a plan positioned near the origin like every other plan this app already hands around.
 */
export async function POST(request: Request) {
  let body: FitLotRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!isFloorPlan(body.plan)) {
    return NextResponse.json({ error: "A real generated plan is required." }, { status: 400 });
  }
  if (!isLotPolygon(body.lot)) {
    return NextResponse.json({ error: "A lot boundary (at least 3 {x,y} points, in feet) is required." }, { status: 400 });
  }
  if (body.lot.length > 40) {
    return NextResponse.json({ error: "Lot boundary is limited to 40 points." }, { status: 400 });
  }
  let setbackFt = 0;
  if (body.setbackFt !== undefined) {
    if (typeof body.setbackFt !== "number" || !Number.isFinite(body.setbackFt) || body.setbackFt < 0 || body.setbackFt > 200) {
      return NextResponse.json({ error: "'setbackFt' must be a number between 0 and 200." }, { status: 400 });
    }
    setbackFt = body.setbackFt;
  }

  const result = fitPlanToLot(body.plan, body.lot, setbackFt);
  return NextResponse.json(result);
}
