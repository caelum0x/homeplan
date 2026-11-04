// Real interior-walkthrough navigation math for the 3D view (components/FloorPlan3D.tsx).
// Maket.ai's own marketing explicitly advertises "photorealistic 3D rendering and
// walkthroughs" alongside the floor-plan generator -- HomePlan's 3D tab only ever had an
// exterior orbit/massing camera (OrbitControls, maxPolarAngle capped so the camera can't
// dip below roof height) with no way to stand inside a room at eye level. This module is
// the pure, test-of-reason geometry behind a real first-person walkthrough: where to start,
// and whether a proposed step would walk the camera straight through a solid wall.
//
// Deliberately kept free of THREE.* and any DOM/event code -- components/FloorPlan3D.tsx
// owns the camera/pointer/keyboard wiring and calls into these plain functions every frame.

import type { Door, FloorPlan, Room, Wall } from "./types";

/** Eye height for a standing adult, feet -- matches the ~9ft WALL_HEIGHT constant already in
 * components/FloorPlan3D.tsx (a person's eyes sit well under the ceiling, not at mid-wall). */
export const WALK_EYE_HEIGHT_FT = 5.5;

/** Comfortable walking pace, feet/second (~1.4 m/s, a standard real-world average). */
export const WALK_SPEED_FPS = 5.5;

/** Collision radius around the camera, feet -- a person's shoulder-width circle, not a point,
 * so the camera can't clip flush against a wall's surface. */
export const WALK_COLLISION_RADIUS_FT = 1.1;

/** Must match components/FloorPlan3D.tsx's own WALL_THICKNESS constant -- both exist because
 * this module is intentionally free of any THREE.js/component import (see file header). */
const WALL_THICKNESS_FT = 0.4;

/** How much wider than the door's own nominal width counts as "in the doorway" for collision
 * purposes -- generous enough that a camera aimed roughly at a doorway's center always finds
 * the gap, without being so wide it reads as walking through drywall next to the opening. */
const DOOR_GAP_MARGIN_FT = 0.6;

/** How close (feet) a door's own midpoint must sit to a wall's line to count as "on" that
 * wall -- mirrors OPENING_WALL_TOLERANCE in components/FloorPlan3D.tsx. */
const DOOR_WALL_TOLERANCE_FT = 0.3;

export interface PlanPoint {
  x: number;
  y: number;
}

export interface WalkthroughStart {
  position: PlanPoint;
  /** Where to aim the camera initially, in the same plan (x, y) space -- the walkthrough's
   * camera setup code does a real `camera.lookAt()` at this point, not a guessed angle. */
  lookAt: PlanPoint;
}

function wallIsHorizontal(wall: Wall): boolean {
  return Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);
}

/** Squared distance from point (px,py) to the closest point on segment (x1,y1)-(x2,y2), plus
 * that closest point itself -- used both for the wall-proximity check and for projecting a
 * door's midpoint onto its own wall's line to find the passable gap. */
function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number; t: number; distance: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { x, y, t, distance: Math.hypot(px - x, py - y) };
}

/** True if `door` sits on `wall` (same orientation, same line, within tolerance) -- the same
 * "match by geometry, not by id" approach `findOwningWall` uses in FloorPlan3D.tsx. */
function doorIsOnWall(door: Door, wall: Wall): boolean {
  const horizontal = wallIsHorizontal(wall);
  if ((door.orientation === "h") !== horizontal) return false;
  const lineCoord = horizontal ? wall.y1 : wall.x1;
  const doorLineCoord = horizontal ? door.y : door.x;
  if (Math.abs(lineCoord - doorLineCoord) > DOOR_WALL_TOLERANCE_FT) return false;
  const minSpan = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
  const maxSpan = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
  const doorSpan = horizontal ? door.x : door.y;
  return doorSpan >= minSpan - DOOR_WALL_TOLERANCE_FT && doorSpan <= maxSpan + DOOR_WALL_TOLERANCE_FT;
}

/**
 * True if standing at (x, y) would put the collision circle inside a solid wall -- false (not
 * blocked) if the only wall close enough to matter is the one the point is passing through a
 * real door opening on. Every door is real "walk-through" space; windows are not (a window sits
 * in a wall, it isn't an opening you can step through).
 */
export function isPointBlockedByWalls(x: number, y: number, walls: Wall[], doors: Door[], radius = WALK_COLLISION_RADIUS_FT): boolean {
  for (const wall of walls) {
    const closest = closestPointOnSegment(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    if (closest.distance > radius + WALL_THICKNESS_FT / 2) continue;

    const horizontal = wallIsHorizontal(wall);
    const pointAlong = horizontal ? Math.abs(closest.x - Math.min(wall.x1, wall.x2)) : Math.abs(closest.y - Math.min(wall.y1, wall.y2));

    const inAPassableDoor = doors.some((door) => {
      if (!doorIsOnWall(door, wall)) return false;
      const doorAlong = horizontal
        ? Math.abs(door.x - Math.min(wall.x1, wall.x2))
        : Math.abs(door.y - Math.min(wall.y1, wall.y2));
      const halfGap = door.width / 2 + DOOR_GAP_MARGIN_FT;
      return pointAlong >= doorAlong - halfGap && pointAlong <= doorAlong + halfGap;
    });
    if (!inAPassableDoor) return true;
  }
  return false;
}

/**
 * Resolves one proposed walkthrough step against every wall: full move if clear, an axis-slide
 * (try moving along just x, then just y) if the diagonal move clips a corner but one axis alone
 * doesn't, otherwise stay put -- the same "slide along the obstacle" feel real first-person
 * games use, so brushing a wall at an angle doesn't just dead-stop the camera.
 */
export function resolveWalkMove(current: PlanPoint, proposed: PlanPoint, walls: Wall[], doors: Door[], radius = WALK_COLLISION_RADIUS_FT): PlanPoint {
  if (!isPointBlockedByWalls(proposed.x, proposed.y, walls, doors, radius)) return proposed;
  const xOnly: PlanPoint = { x: proposed.x, y: current.y };
  if (!isPointBlockedByWalls(xOnly.x, xOnly.y, walls, doors, radius)) return xOnly;
  const yOnly: PlanPoint = { x: current.x, y: proposed.y };
  if (!isPointBlockedByWalls(yOnly.x, yOnly.y, walls, doors, radius)) return yOnly;
  return current;
}

/** True if (x, y) sits inside this room's rectangle (with an inward margin so "inside" means
 * genuinely clear of its own walls, not grazing the boundary). */
function pointInRoom(x: number, y: number, room: Room, margin: number): boolean {
  return x >= room.x + margin && x <= room.x + room.w - margin && y >= room.y + margin && y <= room.y + room.h - margin;
}

/**
 * Picks a real, always-inside-the-building starting point for the walkthrough camera: the
 * entry room's center if the plan has one (an entry is architecturally "where you start"),
 * otherwise the largest room by floor area -- never a hardcoded (0,0) origin, which on a
 * generated plan can sit outside every room entirely (walls/garage slivers, lot-fit rotation,
 * etc.) and would immediately wedge a collision-checked camera against a wall on frame one.
 */
export function findWalkthroughStart(plan: FloorPlan): WalkthroughStart {
  const rooms = plan.rooms.filter((r) => r.type !== "stairs");
  const entry = rooms.find((r) => r.type === "entry");
  const fallback = rooms.reduce<Room | undefined>((largest, room) => (!largest || room.areaSqft > largest.areaSqft ? room : largest), undefined);
  const start = entry ?? fallback;

  const centerX = plan.footprint.w / 2;
  const centerY = plan.footprint.h / 2;

  if (!start) {
    // Defensive only -- every real generated/hand-built plan has at least one room. Falls back
    // to the footprint's own center, which is still a real, in-bounds point.
    return { position: { x: centerX, y: centerY }, lookAt: { x: centerX, y: centerY + 1 } };
  }

  const margin = Math.min(WALK_COLLISION_RADIUS_FT, Math.min(start.w, start.h) / 2 - 0.1);
  const rawX = start.x + start.w / 2;
  const rawY = start.y + start.h / 2;
  const position = {
    x: pointInRoom(rawX, rawY, start, margin) ? rawX : start.x + start.w / 2,
    y: pointInRoom(rawX, rawY, start, margin) ? rawY : start.y + start.h / 2,
  };

  // Look toward the footprint's center (i.e. into the house) unless that's this exact point,
  // in which case look toward the entry's own longer axis so the camera never gets a degenerate
  // zero-length lookAt vector.
  const lookAt =
    Math.hypot(centerX - position.x, centerY - position.y) > 0.5
      ? { x: centerX, y: centerY }
      : { x: position.x, y: position.y + Math.max(start.h, 1) };

  return { position, lookAt };
}
