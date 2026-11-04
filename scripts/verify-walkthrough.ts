// Real structural checks for the interior-walkthrough navigation math (lib/layout/walkthrough.ts),
// the gap behind components/FloorPlan3D.tsx's new "Walk inside" camera mode — Maket.ai's own
// marketing names "3D rendering and walkthroughs" as a feature, and HomePlan's 3D tab previously
// only had an exterior orbit/massing camera with no way to stand inside a room at eye level.
//
// Exercises the real findWalkthroughStart/resolveWalkMove/isPointBlockedByWalls functions
// against actually-generated plans (parseDescription -> generateFloorPlan), not hand-built
// fixtures — the same standard every other verify-*.ts script in this repo holds itself to.

import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import { findWalkthroughStart, isPointBlockedByWalls, resolveWalkMove, WALK_COLLISION_RADIUS_FT } from "../lib/layout/walkthrough";
import type { FloorPlan, Room } from "../lib/layout/types";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

function roomAt(plan: FloorPlan, x: number, y: number): Room | undefined {
  return plan.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function runPlanChecks(label: string, plan: FloorPlan) {
  console.log(`\n--- ${label} (${plan.rooms.length} rooms, ${plan.walls.length} walls, ${plan.doors.length} doors) ---`);

  const start = findWalkthroughStart(plan);
  check(`${label}: start position is finite`, Number.isFinite(start.position.x) && Number.isFinite(start.position.y));
  check(
    `${label}: start position sits inside the footprint`,
    start.position.x >= 0 && start.position.x <= plan.footprint.w && start.position.y >= 0 && start.position.y <= plan.footprint.h,
  );
  const startRoom = roomAt(plan, start.position.x, start.position.y);
  check(`${label}: start position lands inside a real room (not a wall gap/void)`, !!startRoom);
  check(`${label}: start position is not already blocked by a wall`, !isPointBlockedByWalls(start.position.x, start.position.y, plan.walls, plan.doors));
  check(
    `${label}: lookAt target is a different point from the start position (no degenerate lookAt)`,
    Math.hypot(start.lookAt.x - start.position.x, start.lookAt.y - start.position.y) > 0.01,
  );

  // Real usage never takes one giant step — components/FloorPlan3D.tsx's animate loop calls
  // resolveWalkMove every frame with a clamped, tiny delta (see MAX_FRAME_DELTA_SECONDS there).
  // Simulate that: walk due "south" from the footprint's center toward its own bottom edge in
  // small per-frame-sized steps and confirm the camera is actually stopped by the exterior wall
  // instead of tunneling through it one small step at a time.
  const centerX = plan.footprint.w / 2;
  const centerY = plan.footprint.h / 2;
  const FRAME_STEP_FT = 0.4; // ~ WALK_SPEED_FPS * a clamped single-frame delta, see FloorPlan3D.tsx
  let walkerPos = { x: centerX, y: centerY };
  for (let frame = 0; frame < 400; frame++) {
    walkerPos = resolveWalkMove(walkerPos, { x: walkerPos.x, y: walkerPos.y + FRAME_STEP_FT }, plan.walls, plan.doors);
  }
  check(
    `${label}: walking south in real per-frame-sized steps is actually stopped by the exterior wall (never tunnels through)`,
    walkerPos.y <= plan.footprint.h + WALK_COLLISION_RADIUS_FT + 0.5,
  );

  // Every real door on this plan must be genuinely walkable: standing one radius back from the
  // door's midpoint on each side and stepping toward it must NOT be blocked (if it were, a
  // real user could never walk through their own front door).
  let doorsChecked = 0;
  for (const door of plan.doors) {
    const dx = door.orientation === "h" ? 0 : 1;
    const dy = door.orientation === "h" ? 1 : 0;
    const back = { x: door.x - dx * 3, y: door.y - dy * 3 };
    const through = { x: door.x + dx * 3, y: door.y + dy * 3 };
    if (isPointBlockedByWalls(back.x, back.y, plan.walls, plan.doors) || isPointBlockedByWalls(through.x, through.y, plan.walls, plan.doors)) {
      // One of the two sample points landed inside a different wall/room geometry entirely
      // (e.g. right at a corner) — skip rather than report a false positive.
      continue;
    }
    doorsChecked++;
    const resolved = resolveWalkMove(back, through, plan.walls, plan.doors);
    check(`${label}: door ${door.id} is genuinely walkable (camera reaches the far side)`, Math.hypot(resolved.x - through.x, resolved.y - through.y) < 0.5);
  }
  check(`${label}: at least one real door was actually exercised`, doorsChecked > 0);

  // A point sitting well inside a solid wall's thickness, away from any door, must be blocked.
  const wallSample = plan.walls[0];
  if (wallSample) {
    const midX = (wallSample.x1 + wallSample.x2) / 2;
    const midY = (wallSample.y1 + wallSample.y2) / 2;
    const onThisWall = plan.doors.some((d) => Math.hypot(d.x - midX, d.y - midY) < 3);
    if (!onThisWall) {
      check(`${label}: a point on a solid wall segment (no nearby door) is blocked`, isPointBlockedByWalls(midX, midY, plan.walls, plan.doors));
    }
  }
}

/** A synthetic single-wall unit test, independent of any generated plan's incidental room
 * layout -- proves the collision system both blocks AND lets the camera approach all the way
 * up to the real buffer distance (never freezing early, never tunneling), which the generated-
 * plan runs above can't cleanly isolate since a plan's own interior walls can sit arbitrarily
 * close to a given start point. */
function runSyntheticWallCheck() {
  console.log("\n--- synthetic single exterior wall (10ft from a clear start point) ---");
  const wall = { id: "w", x1: 0, y1: 10, x2: 20, y2: 10, exterior: true };
  const start = { x: 10, y: 0 };
  let pos = start;
  for (let frame = 0; frame < 100; frame++) {
    pos = resolveWalkMove(pos, { x: pos.x, y: pos.y + 0.4 }, [wall], []);
  }
  const expectedStop = 10 - (WALK_COLLISION_RADIUS_FT + 0.4 / 2 /* wall thickness/2, see module */);
  check("synthetic wall: far point is not blocked", !isPointBlockedByWalls(10, 0, [wall], []));
  check("synthetic wall: point on the wall itself is blocked", isPointBlockedByWalls(10, 10, [wall], []));
  check("synthetic wall: walker made real forward progress (>8ft of the 10ft gap)", pos.y > 8);
  check("synthetic wall: walker stopped at the real collision buffer, not earlier or later", Math.abs(pos.y - expectedStop) < 0.5);
}

function main() {
  runSyntheticWallCheck();

  const planA = generateFloorPlan(parseDescription("3 bedroom 2 bath, 1800 sqft, open plan kitchen living"));
  runPlanChecks("3bed/2bath open-plan", planA);

  const planB = generateFloorPlan(parseDescription("4 bedroom 3 bath, 2600 sqft, home office, 2 story"));
  runPlanChecks("4bed/3bath 2-story", planB);

  const planC = generateFloorPlan(parseDescription("2 bedroom 1 bath cottage, 900 sqft"));
  runPlanChecks("900sqft cottage", planC);

  console.log(problems === 0 ? "\nAll walkthrough checks passed." : `\n${problems} walkthrough check(s) FAILED.`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
