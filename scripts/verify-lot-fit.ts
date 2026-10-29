// Real verification for lib/layout/lotFit.ts — runs the actual engine, actual geometry, and
// checks real numbers, not just "did it throw." See plans/homeplan.md for how this was used.
import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import {
  fitPlanToLot,
  fitMultiStoryPlanToLot,
  normalizePlanToOrigin,
  normalizeFloorsToOrigin,
  extractFootprintPolygon,
  polygonArea,
  polygonBounds,
  polygonFullyInsidePolygon,
  insetPolygon,
  rotate90,
  LOT_PRESETS,
} from "../lib/layout/lotFit";
import { computeDoorSwings, resolveDoorSwingGeometry } from "../lib/layout/doorSwings";
import { generateMultiStoryPlan } from "../lib/layout/multiStory";
import { stairGraphics } from "../lib/stairs";
import { STAIR_RISERS } from "../lib/layout/stairSpec";
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

console.log("\n=== 9. Multi-story plans are no longer rejected, and a forced rotation transforms stairRun exactly (not carried over) ===");
{
  // No garage on purpose: a garage only ever attaches to the GROUND floor (lib/layout/
  // multiStory.ts), which makes its real exterior silhouette genuinely different from the upper
  // floor's (an L-shape vs a plain rectangle) even though both report the same bounding-box
  // `footprint` metadata — so a garage-equipped plan legitimately CAN fit each floor at a
  // different orientation, and asserting floor-to-floor alignment on one would be testing a false
  // assumption, not a real bug. Without a garage, both floors' real footprints are identical, so
  // alignment is a real, provable invariant.
  const briefInput = { ...parseDescription("4 bed 3 bath house, 2800 square feet, with a home office"), stories: 2 as const };
  const { floors } = generateMultiStoryPlan(briefInput);
  const [ground, upper] = floors;
  check("sanity: this brief has no garage, so ground/upper floors share one real footprint", !ground.rooms.some((r) => r.type === "garage"));
  check("ground floor has a real stairs room with a stairRun", ground.rooms.some((r) => r.type === "stairs" && r.stairRun));

  // 9a. Plenty-of-room lot: no longer rejected outright, and both floors (independently fit
  // against the same lot/setback) pick the same orientation since they share one real footprint.
  const roomyLot = [
    { x: 0, y: 0 },
    { x: ground.footprint.w + 20, y: 0 },
    { x: ground.footprint.w + 20, y: ground.footprint.h + 20 },
    { x: 0, y: ground.footprint.h + 20 },
  ];
  const groundRoomyFit = fitPlanToLot(ground, roomyLot, 2);
  const upperRoomyFit = fitPlanToLot(upper, roomyLot, 2);
  check("ground floor multi-story plan no longer rejected by lot fitting", groundRoomyFit.feasible, groundRoomyFit.error ?? undefined);
  check("upper floor multi-story plan no longer rejected by lot fitting", upperRoomyFit.feasible, upperRoomyFit.error ?? undefined);
  check(
    "both floors picked the same orientation (shared footprint keeps them aligned)",
    groundRoomyFit.orientationDeg === upperRoomyFit.orientationDeg,
    `${groundRoomyFit.orientationDeg} vs ${upperRoomyFit.orientationDeg}`,
  );

  // 9b. Force a 90/270deg rotation (narrow-but-deep lot) and prove stairRun survives exactly —
  // same rigor as scenario 8's door-hinge proof: reconstruct the exact rigid transform from the
  // front door alone, then confirm the stairs flight's own endpoints (recomputed by
  // transformStairRun, not carried over) match that same transform applied to the original.
  // (unlike scenario 2/8's plan, this one may already be deeper than it is wide — the swapped-
  // dimension lot below forces a real rotation either way, same technique, no orientation assumed.)
  const narrowDeepLot = [
    { x: 0, y: 0 },
    { x: ground.footprint.h + 2, y: 0 },
    { x: ground.footprint.h + 2, y: ground.footprint.w + 2 },
    { x: 0, y: ground.footprint.w + 2 },
  ];
  const groundRotated = fitPlanToLot(ground, narrowDeepLot, 0);
  check("rotation forced successfully", groundRotated.feasible && groundRotated.orientationDeg !== 0, `orientation=${groundRotated.orientationDeg}`);

  if (groundRotated.plan) {
    const origStairs = ground.rooms.find((r) => r.type === "stairs")!;
    const fitStairs = groundRotated.plan.rooms.find((r) => r.type === "stairs")!;
    check("fitted stairs room still carries a stairRun", !!fitStairs.stairRun);

    if (fitStairs.stairRun && origStairs.stairRun) {
      const k = (groundRotated.orientationDeg ?? 0) / 90;
      const origFront = ground.doors.find((d) => d.id === "front_door")!;
      const fitFront = groundRotated.plan.doors.find((d) => d.id === "front_door")!;
      const rotatedFront = rotate90({ x: origFront.x, y: origFront.y }, k);
      const offset = { x: fitFront.x - rotatedFront.x, y: fitFront.y - rotatedFront.y };
      const tf = (p: { x: number; y: number }) => {
        const r = rotate90(p, k);
        return { x: r.x + offset.x, y: r.y + offset.y };
      };
      const close = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

      const origRun = origStairs.stairRun;
      const origCx = origStairs.x + origStairs.w / 2;
      const origLow = { x: origCx, y: origStairs.y + origRun.start };
      const origHigh = { x: origCx, y: origStairs.y + origRun.start + origRun.length };
      const expectedLow = tf(origLow);
      const expectedHigh = tf(origHigh);

      const fitRun = fitStairs.stairRun;
      const axis = fitRun.axis ?? "y";
      const fitCx = fitStairs.x + fitStairs.w / 2;
      const fitCy = fitStairs.y + fitStairs.h / 2;
      const actualLow = axis === "x" ? { x: fitStairs.x + fitRun.start, y: fitCy } : { x: fitCx, y: fitStairs.y + fitRun.start };
      const actualHigh =
        axis === "x" ? { x: fitStairs.x + fitRun.start + fitRun.length, y: fitCy } : { x: fitCx, y: fitStairs.y + fitRun.start + fitRun.length };

      const matchesForward = close(expectedLow, actualLow) && close(expectedHigh, actualHigh);
      const matchesSwapped = close(expectedLow, actualHigh) && close(expectedHigh, actualLow);
      check(
        "stairRun's real flight endpoints match the exact rigid transform of the original (recomputed, not carried over)",
        matchesForward || matchesSwapped,
        `expected ${JSON.stringify(expectedLow)}..${JSON.stringify(expectedHigh)} got ${JSON.stringify(actualLow)}..${JSON.stringify(actualHigh)}`,
      );
      check("axis flips to 'x' under a 90/270deg rotation (flight no longer runs along the room's own y-axis)", axis === "x", `axis=${axis}`);
      check("flight length preserved exactly across the rotation", Math.abs(fitRun.length - origRun.length) < 0.01, `${fitRun.length} vs ${origRun.length}`);

      // `bottomAt` must still name whichever geometric end is the real bottom step, not whichever
      // numeric end it happened to be labelled before rotation.
      const origBottomPoint = origRun.bottomAt === "start" ? origLow : origHigh;
      const expectedBottom = tf(origBottomPoint);
      const actualBottomPoint = fitRun.bottomAt === "start" ? actualLow : actualHigh;
      check("bottomAt still names the same real bottom-step end after rotation", close(expectedBottom, actualBottomPoint));
    }

    // stairGraphics must still render real, non-collapsed geometry on the rotated room — the
    // actual bug this fix closes (a naive point-only transform would leave stairRun's numbers
    // pinned to the old y-axis, clamping the flight down to the room's new, much shorter height).
    const graphics = stairGraphics(fitStairs);
    check("stairGraphics still returns real geometry on the rotated stairs room (not clamped away by the axis mismatch)", !!graphics);
    if (graphics) {
      check("rotated flight still has the full tread count", graphics.treads.length === STAIR_RISERS, `${graphics.treads.length} treads, expected ${STAIR_RISERS}`);
      const flightLen = Math.hypot(graphics.treads[graphics.treads.length - 1].x1 - graphics.treads[0].x1, graphics.treads[graphics.treads.length - 1].y1 - graphics.treads[0].y1);
      check("rotated flight spans its real length, not squashed into the room's short dimension", flightLen > 10, `flightLen=${flightLen.toFixed(2)}`);
    }

    const normalized = normalizePlanToOrigin(groundRotated.plan);
    check("normalizePlanToOrigin still carries the stairs room through", normalized.rooms.some((r) => r.type === "stairs" && r.stairRun));
  }

  // 9c. Fit the upper floor against the exact same lot/setback — since both floors share one
  // footprint, it must be forced to the identical rotation, and (critically) the two floors'
  // stairs rects must still line up exactly so the flight/stairwell stack correctly between them.
  const upperRotated = fitPlanToLot(upper, narrowDeepLot, 0);
  check(
    "upper floor forced to the same rotation as the ground floor (shared footprint keeps the stairwell aligned)",
    upperRotated.feasible && upperRotated.orientationDeg === groundRotated.orientationDeg,
    `${upperRotated.orientationDeg} vs ${groundRotated.orientationDeg}`,
  );
  if (upperRotated.plan && groundRotated.plan) {
    const groundStairsFit = groundRotated.plan.rooms.find((r) => r.type === "stairs")!;
    const upperStairsFit = upperRotated.plan.rooms.find((r) => r.type === "stairs")!;
    const rectClose =
      Math.abs(groundStairsFit.x - upperStairsFit.x) < 0.01 &&
      Math.abs(groundStairsFit.y - upperStairsFit.y) < 0.01 &&
      Math.abs(groundStairsFit.w - upperStairsFit.w) < 0.01 &&
      Math.abs(groundStairsFit.h - upperStairsFit.h) < 0.01;
    check(
      "ground and upper floor stairs rects still line up exactly after independently fitting both floors",
      rectClose,
      `${JSON.stringify({ x: groundStairsFit.x, y: groundStairsFit.y, w: groundStairsFit.w, h: groundStairsFit.h })} vs ${JSON.stringify({ x: upperStairsFit.x, y: upperStairsFit.y, w: upperStairsFit.w, h: upperStairsFit.h })}`,
    );
    check(
      "both floors' stairRun axis flipped the same way",
      (groundStairsFit.stairRun?.axis ?? "y") === (upperStairsFit.stairRun?.axis ?? "y"),
    );
  }
}

console.log("\n=== 10. Every LOT_PRESETS entry is a valid simple polygon with positive area ===");
for (const preset of LOT_PRESETS) {
  const area = polygonArea(preset.points);
  check(`preset "${preset.label}" has positive area`, area > 10, `area=${area}`);
}

console.log(
  "\n=== 11. fitMultiStoryPlanToLot: a garage-equipped multi-story plan no longer gets each floor fit at a DIFFERENT orientation ===",
);
{
  // Unlike scenario 9's no-garage brief, THIS brief's ground floor has a real garage — its real
  // exterior silhouette is genuinely wider than the upper floor's (a plain rectangle), even
  // though both report the same bounding-box `footprint` metadata (multiStory.ts's own
  // documented characteristic). First prove the actual bug exists at the fitPlanToLot level
  // (each floor independently fit CAN and DOES pick a different real orientation here), then
  // prove fitMultiStoryPlanToLot closes it by forcing one shared transform.
  const briefInput = { ...parseDescription("4 bed 3 bath house, 2800 square feet, with a 2-car garage"), stories: 2 as const };
  const { floors } = generateMultiStoryPlan(briefInput);
  const [ground, upper] = floors;
  check("sanity: this brief's ground floor has a real garage", ground.rooms.some((r) => r.type === "garage"));
  check("sanity: the upper floor has no garage", !upper.rooms.some((r) => r.type === "garage"));

  const groundFpBounds = polygonBounds(extractFootprintPolygon(ground)!);
  const upperFpBounds = polygonBounds(extractFootprintPolygon(upper)!);
  check(
    "sanity: the garage genuinely makes the ground floor's real footprint wider than the upper floor's",
    groundFpBounds.maxX - groundFpBounds.minX > upperFpBounds.maxX - upperFpBounds.minX + 1,
    `ground width ${groundFpBounds.maxX - groundFpBounds.minX} vs upper width ${upperFpBounds.maxX - upperFpBounds.minX}`,
  );

  // A lot narrower than the ground floor's real footprint width but wide enough for the upper
  // floor's — this forces ground to rotate 90deg to fit while upper, already narrow enough,
  // has no structural need to.
  const divergingLot = [
    { x: 0, y: 0 },
    { x: groundFpBounds.maxY - groundFpBounds.minY + 0.5, y: 0 },
    { x: groundFpBounds.maxY - groundFpBounds.minY + 0.5, y: 60 },
    { x: 0, y: 60 },
  ];
  const groundIndependent = fitPlanToLot(ground, divergingLot, 0);
  const upperIndependent = fitPlanToLot(upper, divergingLot, 0);
  check("ground floor fits independently", groundIndependent.feasible, groundIndependent.error ?? undefined);
  check("upper floor fits independently", upperIndependent.feasible, upperIndependent.error ?? undefined);
  check(
    "REAL BUG CONFIRMED (pre-fix behavior): fitting each floor independently picks a DIFFERENT orientation for ground vs. upper",
    groundIndependent.orientationDeg !== upperIndependent.orientationDeg,
    `ground=${groundIndependent.orientationDeg} upper=${upperIndependent.orientationDeg} — if these matched, this test lot no longer demonstrates the bug and needs re-tuning`,
  );

  // Now the actual fix: fitMultiStoryPlanToLot must find ONE shared orientation that fits BOTH
  // floors at once, never picking per-floor orientations independently.
  const multiFit = fitMultiStoryPlanToLot(floors, divergingLot, 0);
  check("fitMultiStoryPlanToLot finds a real shared fit for both floors", multiFit.feasible, multiFit.error ?? undefined);
  check("fitMultiStoryPlanToLot returns both floors", (multiFit.floors?.length ?? 0) === 2);

  if (multiFit.feasible && multiFit.floors) {
    const [fitGround, fitUpper] = multiFit.floors;
    // The defining correctness property: the SAME rigid transform was applied to every floor, so
    // the stair strip (identical rect on both floors by construction) must still line up exactly
    // — this is what "aligned floors" actually means, not just "both individually fit somewhere."
    const groundStairs = fitGround.rooms.find((r) => r.type === "stairs")!;
    const upperStairs = fitUpper.rooms.find((r) => r.type === "stairs")!;
    const stairsAligned =
      Math.abs(groundStairs.x - upperStairs.x) < 0.01 &&
      Math.abs(groundStairs.y - upperStairs.y) < 0.01 &&
      Math.abs(groundStairs.w - upperStairs.w) < 0.01 &&
      Math.abs(groundStairs.h - upperStairs.h) < 0.01;
    check(
      "ground and upper floor stair strips line up exactly under the shared multi-floor transform",
      stairsAligned,
      `${JSON.stringify({ x: groundStairs.x, y: groundStairs.y, w: groundStairs.w, h: groundStairs.h })} vs ${JSON.stringify({ x: upperStairs.x, y: upperStairs.y, w: upperStairs.w, h: upperStairs.h })}`,
    );

    // Both floors' real (non-bbox) footprints must each independently be fully inside the real
    // buildable area at this shared transform — not just "the wider one fits."
    const buildable = multiFit.buildable!;
    const groundFitsBuildable = polygonFullyInsidePolygon(
      extractFootprintPolygon(fitGround)!,
      buildable,
    );
    const upperFitsBuildable = polygonFullyInsidePolygon(extractFootprintPolygon(fitUpper)!, buildable);
    check("ground floor's real footprint is fully inside the buildable area at the shared transform", groundFitsBuildable);
    check("upper floor's real footprint is fully inside the buildable area at the shared transform", upperFitsBuildable);

    // normalizeFloorsToOrigin must preserve alignment too (shift by one shared offset, not a
    // per-floor one) — re-check stairs line up after normalizing, the exact step the real app's
    // "Use this fit" button runs before adopting the result.
    const normalized = normalizeFloorsToOrigin(multiFit.floors);
    const normGround = normalized[0].rooms.find((r) => r.type === "stairs")!;
    const normUpper = normalized[1].rooms.find((r) => r.type === "stairs")!;
    check(
      "stair strips still line up exactly after normalizeFloorsToOrigin (shared, not per-floor, origin shift)",
      Math.abs(normGround.x - normUpper.x) < 0.01 && Math.abs(normGround.y - normUpper.y) < 0.01,
    );
    check(
      "normalizeFloorsToOrigin actually moved the floors near the origin (not a no-op) given this lot's real coordinates",
      normalized[0].rooms.some((r) => Math.abs(r.x) < 50 && Math.abs(r.y) < 50),
    );
  }

  // Infeasible case: a lot too small for even the narrower (upper) floor's footprint means the
  // whole multi-story fit must honestly fail, with real numbers, not silently succeed on the
  // floor that happens to fit.
  const tinyLot = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 0, y: 5 },
  ];
  const tinyFit = fitMultiStoryPlanToLot(floors, tinyLot, 0);
  check("a genuinely too-small lot is honestly reported as infeasible for the multi-story fit", !tinyFit.feasible && !!tinyFit.error);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
