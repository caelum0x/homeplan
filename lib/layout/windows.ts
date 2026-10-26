// Derives window placements from the plan's own real exterior-wall geometry —
// zero HomePlan floor plan drew a single window before this (verified by
// reading lib/renderSvg.ts, components/FloorPlanSvg.tsx, FloorPlanStudio.tsx,
// FloorPlan3D.tsx, none of which had any window concept at all). A floor
// plan with no windows anywhere is an immediate, obvious "this isn't a real
// architectural product" tell — this is a real, computed fix, not a static
// decoration: every window sits on a wall segment that is independently
// confirmed to be both (a) exterior and (b) on this specific room's own
// boundary, the same "derive from real geometry, never fake it" standard as
// walls/doors elsewhere in this codebase.

import type { Door, Room, RoomType, Wall, Window } from "./types";

const WINDOW_WIDTH = 3;
/** Minimum clear run of exterior wall before it's worth a window at all. */
const MIN_WINDOW_WALL = 4;
/** Above this run length, place two windows instead of one. */
const TWO_WINDOW_THRESHOLD = 14;
const EPS = 0.05;

/** Rooms where a window doesn't make sense (no exterior use, or usually windowless by convention). */
const WINDOW_EXCLUDED_TYPES = new Set<RoomType>(["hallway", "closet", "garage"]);

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: "h" | "v";
}

function roomEdges(room: Room): Edge[] {
  return [
    { x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y, orientation: "h" }, // front (facing the street)
    { x1: room.x, y1: room.y + room.h, x2: room.x + room.w, y2: room.y + room.h, orientation: "h" }, // back
    { x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.h, orientation: "v" }, // left side
    { x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.h, orientation: "v" }, // right side
  ];
}

/** The overlapping run (and the line's fixed coordinate) between a room edge and a wall segment lying on the same line — null if they're not colinear or don't actually overlap. */
function colinearOverlap(edge: Edge, wall: Wall): { from: number; to: number; fixed: number } | null {
  if (edge.orientation === "h") {
    if (Math.abs(wall.y1 - wall.y2) > EPS) return null; // wall isn't horizontal
    if (Math.abs(wall.y1 - edge.y1) > EPS) return null; // not the same line
    const from = Math.max(Math.min(edge.x1, edge.x2), Math.min(wall.x1, wall.x2));
    const to = Math.min(Math.max(edge.x1, edge.x2), Math.max(wall.x1, wall.x2));
    return to - from > EPS ? { from, to, fixed: edge.y1 } : null;
  }
  if (Math.abs(wall.x1 - wall.x2) > EPS) return null; // wall isn't vertical
  if (Math.abs(wall.x1 - edge.x1) > EPS) return null;
  const from = Math.max(Math.min(edge.y1, edge.y2), Math.min(wall.y1, wall.y2));
  const to = Math.min(Math.max(edge.y1, edge.y2), Math.max(wall.y1, wall.y2));
  return to - from > EPS ? { from, to, fixed: edge.x1 } : null;
}

/**
 * Computes real window placements for a plan from its rooms/walls/doors.
 * Pure, deterministic, re-derivable any time the geometry changes (called
 * both by the generator and by the Studio editor's recompute() so a dragged
 * or resized room's windows stay honest instead of going stale).
 */
export function computeWindows(rooms: Room[], walls: Wall[], doors: Door[]): Window[] {
  const exteriorWalls = walls.filter((w) => w.exterior);
  const windows: Window[] = [];
  let counter = 0;

  for (const room of rooms) {
    if (WINDOW_EXCLUDED_TYPES.has(room.type)) continue;

    for (const edge of roomEdges(room)) {
      for (const wall of exteriorWalls) {
        const overlap = colinearOverlap(edge, wall);
        if (!overlap) continue;
        const length = overlap.to - overlap.from;
        if (length < MIN_WINDOW_WALL) continue;

        const count = length >= TWO_WINDOW_THRESHOLD ? 2 : 1;
        const positions =
          count === 2 ? [overlap.from + length * 0.28, overlap.from + length * 0.72] : [overlap.from + length * 0.5];

        for (const pos of positions) {
          const blockedByDoor = doors.some((d) => {
            if (d.orientation !== edge.orientation) return false;
            const doorAlong = edge.orientation === "h" ? d.x : d.y;
            const doorFixed = edge.orientation === "h" ? d.y : d.x;
            if (Math.abs(doorFixed - overlap.fixed) > 0.5) return false; // not this same wall line
            return Math.abs(doorAlong - pos) < d.width / 2 + WINDOW_WIDTH / 2 + 1;
          });
          if (blockedByDoor) continue;

          windows.push(
            edge.orientation === "h"
              ? { id: `window_${counter++}`, x: pos, y: overlap.fixed, orientation: "h", width: WINDOW_WIDTH }
              : { id: `window_${counter++}`, x: overlap.fixed, y: pos, orientation: "v", width: WINDOW_WIDTH },
          );
        }
      }
    }
  }

  return windows;
}
