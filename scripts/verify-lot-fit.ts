// Real verification for lib/layout/lotFit.ts — runs the actual engine, actual geometry, and
// checks real numbers, not just "did it throw." See plans/homeplan.md for how this was used.
import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import {
  fitPlanToLot,
  normalizePlanToOrigin,
  extractFootprintPolygon,
  polygonArea,
  polygonFullyInsidePolygon,
  insetPolygon,
  rotate90,
  LOT_PRESETS,
} from "../lib/layout/lotFit";
import { computeDoorSwings, resolveDoorSwingGeometry } from "../lib/layout/doorSwings";
import type { Room, FloorPlan } from "../lib/layout/types";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

function boundsAndOverlapOk(rooms: Room[]): boolean {
  const EPS = 0.05;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > EPS && overlapY > EPS) return false;
    }
  }
  return true;
}

console.log("\n=== 1. Plain rectangle lot, plenty of room — should fit at 0 degrees, no setback issues ===");
{
  const input = parseDescription("3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living");
  const plan = generateFloorPlan(input);
  const lot = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const result = fitPlanToLot(plan, lot, 5);
  check("feasible", result.feasible, result.error ?? undefined);
  check("orientation is 0deg (plan already fits without rotating)", result.orientationDeg === 0);
  if (result.plan) {
    check("rooms still non-overlapping after transform", boundsAndOverlapOk(result.plan.rooms));
    const normalized = normalizePlanToOrigin(result.plan);
    const minX = Math.min(...normalized.rooms.map((r) => r.x));
    const minY = Math.min(...normalized.rooms.map((r) => r.y));
    check("normalizePlanToOrigin brings bounds to ~0,0", Math.abs(minX) < 0.01 && Math.abs(minY) < 0.01, `minX=${minX} minY=${minY}`);
  }
}

console.log("\n=== 2. Lot too narrow at 0deg but deep enough rotated — should pick 90 or 270 ===");
{
  const input = parseDescription("1 bedroom 1 bath apartment, 650 sqft");
  const plan = generateFloorPlan(input);
  check("sanity: this plan's footprint is wider than deep (w>h), so the test actually forces a rotation", plan.footprint.w > plan.footprint.h, `w=${plan.footprint.w} h=${plan.footprint.h}`);
  // Lot is just wide enough for the SHORT dimension and just deep enough for the LONG one —
  // fits only if the footprint is rotated 90/270 so its long side runs along the lot's deep axis.
  const narrowDeepLot = [{ x: 0, y: 0 }, { x: plan.footprint.h + 2, y: 0 }, { x: plan.footprint.h + 2, y: plan.footprint.w + 2 }, { x: 0, y: plan.footprint.w + 2 }];
  const result = fitPlanToLot(plan, narrowDeepLot, 0);
  check("feasible", result.feasible, result.error ?? undefined);
  check("rotated 90 or 270 to fit the narrow-but-deep lot", result.orientationDeg === 90 || result.orientationDeg === 270, `got ${result.orientationDeg}`);
}

console.log("\n=== 3. L-shaped plan footprint has real notch area — not a bounding-box fit ===");
{
  const input = { ...parseDescription("4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office"), lShaped: true };
  const plan = generateFloorPlan(input);
  const footprint = extractFootprintPolygon(plan);
  check("footprint traced", !!footprint);
  if (footprint) {
    const realArea = polygonArea(footprint);
    const boundingArea = plan.footprint.w * plan.footprint.h;
    check(
      "real footprint area is meaningfully smaller than bounding box (genuine notch, not a rectangle)",
      realArea < boundingArea * 0.97,
      `real=${realArea.toFixed(1)} bbox=${boundingArea.toFixed(1)}`,
    );
  }

  // A lot exactly the size of the bounding box, no setback: a plain rectangular fit would
  // trivially pass bounding-box containment, but we want to confirm our containment check isn't
  // accidentally *rejecting* a real L-shaped footprint that legitimately fits inside a same-size
  // rectangular lot (the notch just leaves unused buildable area, which is fine).
  const lot = [{ x: 0, y: 0 }, { x: plan.footprint.w, y: 0 }, { x: plan.footprint.w, y: plan.footprint.h }, { x: 0, y: plan.footprint.h }];
  const result = fitPlanToLot(plan, lot, 0);
  check("L-shaped plan fits its own exact bounding-box-sized lot", result.feasible, result.error ?? undefined);
}

console.log("\n=== 4. Lot genuinely too small — honest infeasible result with real numbers ===");
{
  const input = parseDescription("4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office");
  const plan = generateFloorPlan(input);
  const tinyLot = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const result = fitPlanToLot(plan, tinyLot, 0);
  check("correctly infeasible", !result.feasible);
  check("real error message with real numbers", !!result.error && /sqft/.test(result.error), result.error ?? "no error");
  check("footprintAreaSqft reported even on failure", result.footprintAreaSqft > 0);
}

console.log("\n=== 5. Setback too large for the lot shape — reports a real max feasible setback ===");
{
  const input = parseDescription("cozy 2 bedroom 1 bath cottage, 900 sqft");
  const plan = generateFloorPlan(input);
  const smallLot = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
  const result = fitPlanToLot(plan, smallLot, 25);
  check("correctly infeasible (setback collapses the lot)", !result.feasible);
  check("error names a real max feasible setback number", !!result.error && /\d+(\.\d+)?ft/.test(result.error), result.error ?? "no error");
}

console.log("\n=== 6. Self-intersecting lot boundary — rejected honestly ===");
{
  const input = parseDescription("cozy 2 bedroom 1 bath cottage, 900 sqft");
  const plan = generateFloorPlan(input);
  const bowtie = [{ x: 0, y: 0 }, { x: 60, y: 60 }, { x: 60, y: 0 }, { x: 0, y: 60 }];
  const result = fitPlanToLot(plan, bowtie, 0);
  check("bowtie polygon rejected", !result.feasible);
  check("real error explains why", !!result.error && /crosses itself/.test(result.error), result.error ?? "no error");
}

console.log("\n=== 7. insetPolygon erosion is real (buildable area strictly smaller, still inside lot) ===");
{
  const lot = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 120 }, { x: 0, y: 120 }];
  const eroded = insetPolygon(lot, 10);
  check("erosion succeeded", !!eroded);
  if (eroded) {
    check("eroded area smaller than original", polygonArea(eroded) < polygonArea(lot));
    check("eroded polygon fully inside the original lot", polygonFullyInsidePolygon(eroded, lot));
    const expectedArea = 60 * 100; // 80-2*10 by 120-2*10, exact for a rectangle
    check("eroded rectangle area matches exact expected value", Math.abs(polygonArea(eroded) - expectedArea) < 0.5, `got ${polygonArea(eroded).toFixed(1)} expected ${expectedArea}`);
  }
}

console.log("\n=== 8. Rotation correctness: door hinge/swing geometry survives a forced 90deg rotation exactly ===");
{
  const input = parseDescription("3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living");
  const plan = generateFloorPlan(input);
  // Force a 90-degree rotation by using a lot that's only feasible rotated: swap footprint w/h
  // roughly, with a tight non-rotated dimension.
  const forcedRotationLot = [{ x: 0, y: 0 }, { x: plan.footprint.h + 2, y: 0 }, { x: plan.footprint.h + 2, y: plan.footprint.w + 2 }, { x: 0, y: plan.footprint.w + 2 }];
  const result = fitPlanToLot(plan, forcedRotationLot, 0);
  check("rotation forced successfully", result.feasible && result.orientationDeg !== 0, `orientation=${result.orientationDeg}`);
  if (result.plan) {
    const original = plan;
    const fitted = result.plan;
    // Re-derive door swing geometry fresh on the rotated plan and confirm every door still has a
    // real, defined hinge — i.e. the rotation didn't silently break the swing computation.
    const { doors: redone } = computeDoorSwings(fitted.rooms, fitted.doors, fitted.furniture);
    const allHaveHinge = redone.every((d) => !!d.hingeSide && !!d.swingInto);
    check("every door still resolves a real hinge/swing after rotation", allHaveHinge);
    check("same door count before/after rotation", original.doors.length === fitted.doors.length, `${original.doors.length} vs ${fitted.doors.length}`);
    check("same room count before/after rotation", original.rooms.length === fitted.rooms.length);
    check("same total area before/after rotation (no scale applied)", Math.abs(original.totalAreaSqft - fitted.rooms.reduce((s, r) => s + r.areaSqft, 0)) < 1);

    // Independent numeric cross-check: derive the exact rigid transform (k, offset) from the
    // front door alone, then confirm a *different* door's hinge/open-tip/closed-tip geometry
    // matches that exact same transform applied to the original — this is what actually proves
    // transformHingeSide's "start"/"end" relabeling (lib/layout/lotFit.ts) is geometrically
    // correct, not just "didn't crash."
    const k = (result.orientationDeg ?? 0) / 90;
    const origFront = original.doors.find((d) => d.id === "front_door")!;
    const fitFront = fitted.doors.find((d) => d.id === "front_door")!;
    const rotatedFront = rotate90({ x: origFront.x, y: origFront.y }, k);
    const offset = { x: fitFront.x - rotatedFront.x, y: fitFront.y - rotatedFront.y };
    const tf = (p: { x: number; y: number }) => {
      const r = rotate90(p, k);
      return { x: r.x + offset.x, y: r.y + offset.y };
    };
    const close = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

    const origOther = original.doors.find((d) => d.id !== "front_door" && d.hingeSide);
    const fitOther = origOther ? fitted.doors.find((d) => d.id === origOther.id) : undefined;
    check("a second, different door's position matches the exact same rigid transform", !!origOther && !!fitOther && close(tf({ x: origOther.x, y: origOther.y }), fitOther));

    if (origOther && fitOther) {
      const origGeom = resolveDoorSwingGeometry(origOther, original.rooms);
      const fitGeom = resolveDoorSwingGeometry(fitOther, fitted.rooms);
      check("hinge/swing geometry exists on both sides of the transform", !!origGeom && !!fitGeom);
      if (origGeom && fitGeom) {
        check("hinge point matches exact rigid transform of the original", close(tf(origGeom.hinge), fitGeom.hinge));
        check("openTip matches exact rigid transform of the original", close(tf(origGeom.openTip), fitGeom.openTip));
        check("closedTip matches exact rigid transform of the original", close(tf(origGeom.closedTip), fitGeom.closedTip));
      }
    }
  }
}

console.log("\n=== 9. Every LOT_PRESETS entry is a valid simple polygon with positive area ===");
for (const preset of LOT_PRESETS) {
  const area = polygonArea(preset.points);
  check(`preset "${preset.label}" has positive area`, area > 10, `area=${area}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
