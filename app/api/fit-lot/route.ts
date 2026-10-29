import { NextResponse } from "next/server";
import { fitMultiStoryPlanToLot, fitPlanToLot, type Point } from "@/lib/layout/lotFit";
import type { FloorPlan } from "@/lib/layout/types";

interface FitLotRequestBody {
  plan?: unknown;
  /** Multi-story alternative to `plan`: every floor, ground first, fit together with ONE shared rotation/position — see fitMultiStoryPlanToLot's own doc comment for why fitting floors independently is a real bug, not just a theoretical one. Provide exactly one of `plan`/`floors`. */
  floors?: unknown;
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

function isFloorPlanArray(value: unknown): value is FloorPlan[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(isFloorPlan);
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
 *
 * POST { floors: FloorPlan[], lot: {x,y}[], setbackFt?: number }  (multi-story: ground floor first)
 * -> same shape, with `floors?` (array) in place of `plan?` — every floor fit together with one
 * shared rotation/position, so they stay stacked and aligned. See fitMultiStoryPlanToLot.
 *
 * `plan`/`floors` in the response (when feasible) are in real LOT coordinates, not re-based to
 * the origin — on purpose, so the caller (components/LotFitPanel.tsx) can draw the building
 * positioned exactly where it actually sits on the lot, alongside `lot`/`buildable`, in one
 * shared coordinate space. Before handing this to the rest of the app as "the" active plan, the
 * caller runs it through `normalizePlanToOrigin` / `normalizeFloorsToOrigin` (lib/layout/lotFit.ts,
 * safe to call client-side — pure data transform, no server-only dependency) so Studio/3D/export/
 * chat-edit see a plan positioned near the origin like every other plan this app already hands
 * around.
 */
export async function POST(request: Request) {
  let body: FitLotRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const hasPlan = body.plan !== undefined;
  const hasFloors = body.floors !== undefined;
  if (hasPlan === hasFloors) {
    return NextResponse.json({ error: "Provide exactly one of 'plan' (single floor) or 'floors' (multi-story, ground floor first)." }, { status: 400 });
  }
  if (hasPlan && !isFloorPlan(body.plan)) {
    return NextResponse.json({ error: "A real generated plan is required." }, { status: 400 });
  }
  if (hasFloors && !isFloorPlanArray(body.floors)) {
    return NextResponse.json({ error: "'floors' must be a non-empty array (max 8) of real generated plans." }, { status: 400 });
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

  if (hasFloors) {
    const result = fitMultiStoryPlanToLot(body.floors as FloorPlan[], body.lot, setbackFt);
    return NextResponse.json(result);
  }
  const result = fitPlanToLot(body.plan as FloorPlan, body.lot, setbackFt);
  return NextResponse.json(result);
}
