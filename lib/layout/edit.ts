// Manual-editing primitives for Floorplan Studio: move/resize/add/remove a
// room on an already-generated plan, then recompute walls/doors/footprint
// from the real room geometry (never hand-adjusted separately from it).
//
// This is deliberately a *different, simpler* wall/door derivation than
// lib/layout/generate.ts: the generator has a logical adjacency list (which
// rooms are *supposed* to neighbor) built from the room program, but once a
// human starts dragging rooms around that list is no longer trustworthy —
// the user might create or remove an adjacency on purpose. So in edit mode
// every wall and every door is derived purely from which room rectangles
// currently share an edge, which is the honest, inspectable rule for a
// direct-manipulation editor (same "derive from real geometry, never fake
// it" standard as the rest of this codebase).
//
// Known simplification (documented rather than hidden): if room A's edge is
// only *partially* covered by room B (e.g. A is 10ft wide, B only touches
// 4ft of that edge, and the other 6ft touches nothing) the uncovered 6ft
// does not get its own wall segment. In practice this only shows up if a
// user drags a room into an odd, non-abutting position; it never affects
// freshly generated plans, where rooms always fully tile their zone.

import type { Door, FloorPlan, FurnitureItem, FurnitureType, Room, RoomType, Wall } from "./types";
import { sharedEdgeOverlap } from "./geometry";
import { makeFurniture } from "./furniture";
import { computeWindows } from "./windows";
import { computeDoorSwings } from "./doorSwings";

const DOOR_WIDTH = 3;
const MIN_DOOR_CLEARANCE = 2.2; // feet — minimum shared-edge length before we bother drawing a door opening
const MIN_ROOM_SIZE = 3; // feet — never let a drag/resize collapse a room into nothing
const GRID = 0.5; // feet — snap to a human-friendly grid, same resolution the generator rounds to

export interface EditWarning {
  message: string;
}

/** Snap a coordinate/length to the nearest half-foot. */
export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function clampSize(value: number): number {
  return Math.max(MIN_ROOM_SIZE, snap(value));
}

/** Immutable: returns a new FloorPlan with one room moved to (x, y). Never mutates `plan`. */
export function moveRoom(plan: FloorPlan, roomId: string, x: number, y: number): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const next = { ...room, x: Math.max(0, snap(x)), y: Math.max(0, snap(y)) };
  return recompute(replaceRoom(plan.rooms, next), plan);
}

/** Immutable: returns a new FloorPlan with one room resized to (w, h), anchored at its current x/y. */
export function resizeRoom(plan: FloorPlan, roomId: string, w: number, h: number): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const nextW = clampSize(w);
  const nextH = clampSize(h);
  const next = { ...room, w: nextW, h: nextH, areaSqft: round1(nextW * nextH) };
  return recompute(replaceRoom(plan.rooms, next), plan);
}

/** Immutable: returns a new FloorPlan with one room's label/type changed. */
export function renameRoom(plan: FloorPlan, roomId: string, label: string, type: RoomType): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const next = { ...room, label, type };
  return recompute(replaceRoom(plan.rooms, next), plan);
}

/** Immutable: returns a new FloorPlan with one room's floor color overridden (or cleared, passing undefined). */
export function setRoomFloorColor(plan: FloorPlan, roomId: string, color: string | undefined): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const next = { ...room, floorColor: color };
  return recompute(replaceRoom(plan.rooms, next), plan);
}

/** Immutable: returns a new FloorPlan with the wall color overridden (or cleared, passing undefined). */
export function setWallColor(plan: FloorPlan, color: string | undefined): FloorPlan {
  return { ...plan, wallColor: color };
}

let addCounter = 0;

/** Immutable: adds a new room near the bottom-right of the current footprint, big enough to see and drag. */
export function addRoom(plan: FloorPlan, type: RoomType, label: string): FloorPlan {
  const w = 10;
  const h = 10;
  const x = snap(Math.max(0, plan.footprint.w - w));
  const y = snap(Math.max(0, plan.footprint.h - h));
  const id = `custom_${Date.now()}_${addCounter++}`;
  const room: Room = { id, type, label, x, y, w, h, areaSqft: round1(w * h) };
  return recompute([...plan.rooms, room], plan);
}

/** Immutable: removes a room by id. Furniture is left in place (it's independently positioned, not room-owned) so nothing a user placed disappears unexpectedly. */
export function removeRoom(plan: FloorPlan, roomId: string): FloorPlan {
  return recompute(
    plan.rooms.filter((r) => r.id !== roomId),
    plan,
  );
}

// ---- Furniture: independent, freely-positioned items layered on top of the room geometry. ----

/** Immutable: adds a new furniture piece from the catalog near the top-left of the footprint. */
export function addFurniture(plan: FloorPlan, type: FurnitureType): FloorPlan {
  const item = makeFurniture(type, snap(plan.footprint.w > 6 ? 2 : 0), snap(plan.footprint.h > 6 ? 2 : 0));
  return { ...plan, furniture: [...plan.furniture, item] };
}

/** Immutable: moves one furniture piece to (x, y). Furniture can be placed anywhere, including overlapping a wall — the Studio UI warns visually, it never silently snaps or blocks. */
export function moveFurniture(plan: FloorPlan, furnitureId: string, x: number, y: number): FloorPlan {
  return {
    ...plan,
    furniture: plan.furniture.map((f) => (f.id === furnitureId ? { ...f, x: snap(x), y: snap(y) } : f)),
  };
}

/** Immutable: rotates one furniture piece by a relative delta in degrees (normalized to [0, 360)). */
export function rotateFurniture(plan: FloorPlan, furnitureId: string, deltaDegrees: number): FloorPlan {
  return {
    ...plan,
    furniture: plan.furniture.map((f) => (f.id === furnitureId ? { ...f, rotation: ((f.rotation + deltaDegrees) % 360 + 360) % 360 } : f)),
  };
}

/** Immutable: removes one furniture piece by id. */
export function removeFurniture(plan: FloorPlan, furnitureId: string): FloorPlan {
  return { ...plan, furniture: plan.furniture.filter((f) => f.id !== furnitureId) };
}

function replaceRoom(rooms: Room[], next: Room): Room[] {
  return rooms.map((r) => (r.id === next.id ? next : r));
}

/**
 * Rebuilds footprint/walls/doors/warnings/totalAreaSqft from a raw room
 * list, carrying furniture and wallColor through unchanged from `source`
 * (room geometry edits never implicitly touch furniture placement or
 * material choices). Footprint grows to the bounding box of every room so a
 * dragged room is never clipped or silently misrepresented.
 */
function recompute(rooms: Room[], source: FloorPlan): FloorPlan {
  const footprintW = rooms.length ? Math.max(...rooms.map((r) => r.x + r.w)) : 0;
  const footprintH = rooms.length ? Math.max(...rooms.map((r) => r.y + r.h)) : 0;

  const { walls, doors } = buildWallsAndDoorsFromGeometry(rooms, footprintW, footprintH);
  const overlapWarnings = checkOverlaps(rooms);
  // Re-scored from the fresh geometry + furniture every time, same as windows below — a
  // dragged room, a moved sofa, or a newly-added door never leaves a stale hinge/swing choice
  // from before the edit.
  const { doors: doorsWithSwing, warnings: swingWarnings } = computeDoorSwings(rooms, doors, source.furniture);

  return {
    footprint: { w: round1(footprintW), h: round1(footprintH) },
    totalAreaSqft: round1(rooms.reduce((s, r) => s + r.areaSqft, 0)),
    rooms,
    walls,
    doors: doorsWithSwing,
    warnings: [...overlapWarnings, ...swingWarnings],
    furniture: source.furniture,
    // Re-derived from the fresh geometry every time, same as walls/doors — a
    // dragged/resized room's windows never go stale on an exterior wall that
    // no longer exists (or gains one that now does).
    windows: computeWindows(rooms, walls, doorsWithSwing),
    wallColor: source.wallColor,
  };
}

function buildWallsAndDoorsFromGeometry(
  rooms: Room[],
  footprintW: number,
  footprintH: number,
): { walls: Wall[]; doors: Door[] } {
  const walls: Wall[] = [];
  const doors: Door[] = [];
  let wallCounter = 0;
  let doorCounter = 0;

  function addWall(x1: number, y1: number, x2: number, y2: number, exterior: boolean) {
    if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) < 0.01) return;
    walls.push({ id: `wall_${wallCounter++}`, x1, y1, x2, y2, exterior });
  }

  // Exterior perimeter = bounding box of everything currently on the plan.
  addWall(0, 0, footprintW, 0, true);
  addWall(0, footprintH, footprintW, footprintH, true);
  addWall(0, 0, 0, footprintH, true);
  addWall(footprintW, 0, footprintW, footprintH, true);

  // Interior walls + doors: every pair of rooms that actually share an edge.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const overlap = sharedEdgeOverlap(rooms[i], rooms[j]);
      if (!overlap || overlap.length < 0.5) continue;

      if (overlap.orientation === "v") {
        addWall(overlap.x, overlap.y - overlap.length / 2, overlap.x, overlap.y + overlap.length / 2, false);
      } else {
        addWall(overlap.x - overlap.length / 2, overlap.y, overlap.x + overlap.length / 2, overlap.y, false);
      }

      if (overlap.length >= MIN_DOOR_CLEARANCE) {
        doors.push({
          id: `door_${doorCounter++}`,
          x: overlap.x,
          y: overlap.y,
          orientation: overlap.orientation,
          width: Math.min(DOOR_WIDTH, overlap.length * 0.8),
          connects: [rooms[i].id, rooms[j].id],
        });
      }
    }
  }

  // Front door: if an entry room still exists, give it one opening onto the exterior front wall.
  const entry = rooms.find((r) => r.type === "entry");
  if (entry && entry.y <= 0.5) {
    doors.push({
      id: `door_${doorCounter++}`,
      x: entry.x + entry.w / 2,
      y: 0,
      orientation: "h",
      width: Math.min(DOOR_WIDTH, entry.w * 0.6),
      connects: ["exterior", entry.id],
    });
  }

  return { walls, doors };
}

function checkOverlaps(rooms: Room[]): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const overlap = rectOverlapArea(rooms[i], rooms[j]);
      if (overlap > 0.5) {
        warnings.push(
          `${rooms[i].label} and ${rooms[j].label} overlap by about ${round1(overlap)} sqft — drag one of them apart.`,
        );
      }
    }
  }
  return warnings;
}

function rectOverlapArea(a: Room, b: Room): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
