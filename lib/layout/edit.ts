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
// Exterior perimeter is derived the same shape-agnostic way as the generator's own
// buildWallsAndDoors (lib/layout/generate.ts): computeExteriorSegments looks at the real
// room rectangles and keeps only each room's truly-uncovered edge portions as exterior
// wall, instead of wrapping a bounding-box rectangle around everything. That used to be a
// real, documented gap — any plan with a genuinely non-rectangular footprint (an L-shaped
// private wing, or a garage shallower than the house) silently reverted to a filled-in
// rectangle the moment a user moved anything in Studio, even a single unrelated room,
// because the old bounding-box logic didn't know a "notch" was ever there. Now the same
// algorithm backs both the initial generation and every Studio edit, so an L-shaped plan
// stays L-shaped after a drag/resize/add/remove instead of silently squaring off.

import type { Door, FloorPlan, FurnitureItem, FurnitureType, Room, RoomType, Wall, Window } from "./types";
import { computeExteriorSegments, sharedEdgeOverlap } from "./geometry";
import { makeFurniture } from "./furniture";
import { computeWindows, roomEdges, colinearOverlap } from "./windows";
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

// ---- Doors/windows: manual opening overlay on top of the auto-derived geometry (Maket.ai's
// "canvas-based wall and opening adjustments" — add/remove/move a door or window independent
// of the auto-derivation; see recompute()'s "manual opening overlay" section for the real
// persistence rule, and windowKey/doorKey above for why these are keyed the way they are). ----

const MANUAL_WINDOW_WIDTH = 3; // feet — same width windows.ts's own auto-derivation uses

/** Windows whose opening sits on `room`'s own boundary — the honest "is this window really on
 * this room's wall" check, same geometric-overlap test windows.ts itself uses to derive them
 * in the first place, rather than trusting any stored room association (Window doesn't carry
 * one — a window's position IS its only identity). */
export function windowsForRoom(plan: FloorPlan, room: Room): Window[] {
  return (plan.windows ?? []).filter((win) =>
    roomEdges(room).some((edge) => {
      if (edge.orientation !== win.orientation) return false;
      if (win.orientation === "h") return Math.abs(edge.y1 - win.y) < 0.3 && win.x >= edge.x1 - 0.3 && win.x <= edge.x2 + 0.3;
      return Math.abs(edge.x1 - win.x) < 0.3 && win.y >= edge.y1 - 0.3 && win.y <= edge.y2 + 0.3;
    }),
  );
}

/** The real door connecting two specific rooms, if a shared-edge opening currently exists between them. */
export function doorBetween(plan: FloorPlan, roomAId: string, roomBId: string): Door | null {
  return plan.doors.find((d) => d.connects.includes(roomAId) && d.connects.includes(roomBId)) ?? null;
}

/** The exterior front door for a room (only ever the entry room — see buildWallsAndDoorsFromGeometry), if one currently exists. */
export function frontDoorFor(plan: FloorPlan, roomId: string): Door | null {
  return plan.doors.find((d) => d.connects.includes("exterior") && d.connects.includes(roomId)) ?? null;
}

/**
 * Immutable: removes a door (interior or the exterior front door) by id — the architectural
 * opening is simply gone (a plain wall renders there on the next recompute), not replaced or
 * blocked. Persisted by doorKey (the pair of things it connects), not the door's own
 * id/position, since both regenerate from scratch every recompute.
 */
export function removeDoor(plan: FloorPlan, doorId: string): FloorPlan {
  const door = plan.doors.find((d) => d.id === doorId);
  if (!door) return plan;
  const key = doorKey(door.connects);
  const nextKeys = Array.from(new Set([...(plan.removedDoorKeys ?? []), key]));
  return recompute(plan.rooms, { ...plan, removedDoorKeys: nextKeys });
}

/**
 * Immutable: adds a new window to `room`'s longest exterior wall run that isn't already
 * mostly occupied by an existing window or door — real geometry, not a decorative icon
 * dropped at a fixed offset. Returns `plan` unchanged (an honest no-op) if the room has no
 * exterior wall at all (a fully interior room — there is genuinely nowhere to put one).
 */
export function addWindowToRoom(plan: FloorPlan, roomId: string): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const exteriorWalls = plan.walls.filter((w) => w.exterior);
  const occupied = [...(plan.windows ?? []), ...plan.doors];

  let best: { x: number; y: number; orientation: "h" | "v" } | null = null;
  let bestLength = 0;
  for (const edge of roomEdges(room)) {
    for (const wall of exteriorWalls) {
      const overlap = colinearOverlap(edge, wall);
      if (!overlap) continue;
      const length = overlap.to - overlap.from;
      if (length < MANUAL_WINDOW_WIDTH + 1 || length <= bestLength) continue;

      const mid = overlap.from + length / 2;
      const blocked = occupied.some((o) => {
        if (o.orientation !== edge.orientation) return false;
        const alongO = edge.orientation === "h" ? o.x : o.y;
        const fixedO = edge.orientation === "h" ? o.y : o.x;
        if (Math.abs(fixedO - overlap.fixed) > 0.5) return false;
        return Math.abs(alongO - mid) < (o.width + MANUAL_WINDOW_WIDTH) / 2 + 0.5;
      });
      const pos = blocked ? overlap.from + length * 0.25 : mid;

      bestLength = length;
      best = edge.orientation === "h" ? { x: pos, y: overlap.fixed, orientation: "h" } : { x: overlap.fixed, y: pos, orientation: "v" };
    }
  }
  if (!best) return plan;
  return addManualWindow(plan, { ...best, width: MANUAL_WINDOW_WIDTH });
}

/** Immutable: layers one explicit window on top of the auto-derived set (see recompute()'s "manual opening overlay"). */
export function addManualWindow(plan: FloorPlan, win: Omit<Window, "id">): FloorPlan {
  const id = `manual_window_${Date.now()}_${addCounter++}`;
  const next: Window = { ...win, id };
  return recompute(plan.rooms, { ...plan, manualWindows: [...(plan.manualWindows ?? []), next] });
}

/** Immutable: removes one window (manual or auto-derived) by id. */
export function removeWindow(plan: FloorPlan, windowId: string): FloorPlan {
  const win = (plan.windows ?? []).find((w) => w.id === windowId);
  if (!win) return plan;
  if (win.id.startsWith("manual_window_")) {
    return recompute(plan.rooms, { ...plan, manualWindows: (plan.manualWindows ?? []).filter((w) => w.id !== windowId) });
  }
  const key = windowKey(win);
  const nextKeys = Array.from(new Set([...(plan.removedWindowKeys ?? []), key]));
  return recompute(plan.rooms, { ...plan, removedWindowKeys: nextKeys });
}

/**
 * Immutable: shifts one window by `deltaFt` along its own wall (horizontal windows move in x,
 * vertical windows move in y), clamped to stay within the real exterior wall segment it
 * started on so a "move the window right" command can never slide it off the end of the
 * house into open air. Implemented as remove-the-old + add-a-manual-one-at-the-new-position
 * (same overlay machinery as addManualWindow/removeWindow), not a third storage shape.
 */
export function moveWindow(plan: FloorPlan, windowId: string, deltaFt: number): FloorPlan {
  const win = (plan.windows ?? []).find((w) => w.id === windowId);
  if (!win) return plan;

  const containingWall = plan.walls.find((w) => {
    if (!w.exterior) return false;
    if (win.orientation === "h") {
      if (Math.abs(w.y1 - w.y2) > 0.1 || Math.abs(w.y1 - win.y) > 0.3) return false;
      return win.x >= Math.min(w.x1, w.x2) - 0.3 && win.x <= Math.max(w.x1, w.x2) + 0.3;
    }
    if (Math.abs(w.x1 - w.x2) > 0.1 || Math.abs(w.x1 - win.x) > 0.3) return false;
    return win.y >= Math.min(w.y1, w.y2) - 0.3 && win.y <= Math.max(w.y1, w.y2) + 0.3;
  });

  const half = win.width / 2;
  let nextX = win.x;
  let nextY = win.y;
  if (win.orientation === "h") {
    nextX = win.x + deltaFt;
    if (containingWall) nextX = clamp(nextX, Math.min(containingWall.x1, containingWall.x2) + half, Math.max(containingWall.x1, containingWall.x2) - half);
  } else {
    nextY = win.y + deltaFt;
    if (containingWall) nextY = clamp(nextY, Math.min(containingWall.y1, containingWall.y2) + half, Math.max(containingWall.y1, containingWall.y2) - half);
  }

  const withRemoval = removeWindow(plan, windowId);
  return addManualWindow(withRemoval, { x: round1(nextX), y: round1(nextY), orientation: win.orientation, width: win.width });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
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

  // Only the rooms whose geometry actually changed (moved/resized/newly added) by this
  // specific edit — a room that still has its exact prior x/y/w/h is never re-scanned for
  // doors, see buildWallsAndDoorsFromGeometry's door section below for why that matters.
  const sourceById = new Map(source.rooms.map((r) => [r.id, r]));
  const editedOrNewRoomIds = new Set<string>();
  for (const r of rooms) {
    const prev = sourceById.get(r.id);
    if (!prev || prev.x !== r.x || prev.y !== r.y || prev.w !== r.w || prev.h !== r.h) {
      editedOrNewRoomIds.add(r.id);
    }
  }

  const { walls, doors: rawDoors } = buildWallsAndDoorsFromGeometry(rooms, source.doors, editedOrNewRoomIds);
  const overlapWarnings = checkOverlaps(rooms);

  // ---- manual opening overlay (doors) ----
  // A human-removed door (see removeDoor below) is keyed by which two things it connects,
  // not its id or position — both of those are regenerated from scratch every recompute,
  // but "the door between the kitchen and the hallway" is a stable, human-meaningful
  // identity that survives an unrelated room being dragged elsewhere.
  const removedDoorKeys = new Set(source.removedDoorKeys ?? []);
  const doors = rawDoors.filter((d) => !removedDoorKeys.has(doorKey(d.connects)));

  // Re-scored from the fresh geometry + furniture every time, same as windows below — a
  // dragged room, a moved sofa, or a newly-added door never leaves a stale hinge/swing choice
  // from before the edit.
  const { doors: doorsWithSwing, warnings: swingWarnings } = computeDoorSwings(rooms, doors, source.furniture);

  // ---- manual opening overlay (windows) ----
  // Re-derived from the fresh geometry every time, same as walls/doors — a dragged/resized
  // room's auto windows never go stale on an exterior wall that no longer exists (or gains
  // one that now does) — then a removed auto window stays removed (keyed by its own
  // position+orientation, see windowKey) and any manually added window (see addManualWindow)
  // is layered on top, independent of the auto-derivation.
  const autoWindows = computeWindows(rooms, walls, doorsWithSwing);
  const removedWindowKeys = new Set(source.removedWindowKeys ?? []);
  const surviving = autoWindows.filter((w) => !removedWindowKeys.has(windowKey(w)));
  const manualWindows = source.manualWindows ?? [];
  const windows = [...surviving, ...manualWindows];

  return {
    footprint: { w: round1(footprintW), h: round1(footprintH) },
    totalAreaSqft: round1(rooms.reduce((s, r) => s + r.areaSqft, 0)),
    rooms,
    walls,
    doors: doorsWithSwing,
    warnings: [...overlapWarnings, ...swingWarnings],
    furniture: source.furniture,
    windows,
    wallColor: source.wallColor,
    manualWindows: source.manualWindows,
    removedWindowKeys: source.removedWindowKeys,
    removedDoorKeys: source.removedDoorKeys,
  };
}

/** Stable identity for an auto-derived or manual window — position+orientation, since a
 * window's own `id` is regenerated in array order every recompute() and is never safe to
 * persist across edits. */
export function windowKey(w: { x: number; y: number; orientation: "h" | "v" }): string {
  return `${w.orientation}:${round1(w.x)}:${round1(w.y)}`;
}

/** Stable identity for a door — the (order-independent) pair of things it connects, since a
 * door's own `id`/position is regenerated from scratch every recompute() but "the door
 * between the kitchen and the hallway" (or "the front door", connects = ["exterior", entryId])
 * is a real, human-meaningful identity that survives an unrelated room being dragged. */
export function doorKey(connects: [string, string]): string {
  return [...connects].sort().join("|");
}

/**
 * Walls are always fully re-derived from the real room rectangles (cheap, stateless,
 * purely visual — every wall segment is just "two rooms/the exterior touch exactly here",
 * so there's nothing to preserve or inflate).
 *
 * Doors are NOT re-derived the same way. A door has a real, human-meaningful identity (see
 * doorKey) — "the door between the kitchen and the hallway" — and a full pairwise
 * room-overlap rescan on every single edit silently invented doors between rooms that were
 * never supposed to connect (e.g. bedroom-to-bedroom) the instant *any* unrelated room moved,
 * because any two rooms can end up geometrically touching without that ever being an intended
 * adjacency. Real bug found 2026-11-04: an 8-door freshly-generated plan grew to 15 doors the
 * instant Studio/chat-edit touched any single room, even a no-op `renameRoom()` that changes
 * zero geometry (see plans/homeplan.md same date). Fixed by never re-deriving doors wholesale:
 * each existing door survives (repositioned onto its pair's current shared edge) as long as
 * that pair still actually touches, and a brand-new door is only ever added for a pair that
 * includes a room this specific edit actually moved/resized/added — never for two rooms that
 * were sitting still and simply happened to already share an edge before this edit.
 */
function buildWallsAndDoorsFromGeometry(
  rooms: Room[],
  previousDoors: Door[],
  editedOrNewRoomIds: Set<string>,
): { walls: Wall[]; doors: Door[] } {
  const walls: Wall[] = [];
  const doors: Door[] = [];
  let wallCounter = 0;
  let doorCounter = 0;

  function addWall(x1: number, y1: number, x2: number, y2: number, exterior: boolean) {
    if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) < 0.01) return;
    walls.push({ id: `wall_${wallCounter++}`, x1, y1, x2, y2, exterior });
  }

  // Exterior perimeter = each room's own real uncovered edges (see file header) — not a
  // bounding box, so a dragged/resized plan keeps whatever real shape its rooms imply.
  for (const seg of computeExteriorSegments(rooms)) {
    addWall(seg.x1, seg.y1, seg.x2, seg.y2, true);
  }

  // Interior walls: every pair of rooms that actually share an edge — stateless, see header.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const overlap = sharedEdgeOverlap(rooms[i], rooms[j]);
      if (!overlap || overlap.length < 0.5) continue;

      if (overlap.orientation === "v") {
        addWall(overlap.x, overlap.y - overlap.length / 2, overlap.x, overlap.y + overlap.length / 2, false);
      } else {
        addWall(overlap.x - overlap.length / 2, overlap.y, overlap.x + overlap.length / 2, overlap.y, false);
      }
    }
  }

  // Doors, part 1: carry every pre-existing interior door forward (repositioned onto its
  // pair's current shared edge) as long as that pair still actually touches — a room that
  // moved away from its door partner honestly loses that door, it's never kept floating.
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const preservedDoorKeys = new Set<string>();
  function addDoor(aId: string, bId: string, overlap: { x: number; y: number; length: number; orientation: "h" | "v" }) {
    doors.push({
      id: `door_${doorCounter++}`,
      x: overlap.x,
      y: overlap.y,
      orientation: overlap.orientation,
      width: Math.min(DOOR_WIDTH, overlap.length * 0.8),
      connects: [aId, bId],
    });
    preservedDoorKeys.add(doorKey([aId, bId]));
  }
  for (const prevDoor of previousDoors) {
    if (prevDoor.connects.includes("exterior")) continue; // front door is re-derived below, always
    const [aId, bId] = prevDoor.connects;
    if (preservedDoorKeys.has(doorKey([aId, bId]))) continue; // already carried forward once
    const ra = byId.get(aId);
    const rb = byId.get(bId);
    if (!ra || !rb) continue; // one side of this door was removed from the plan entirely
    const overlap = sharedEdgeOverlap(ra, rb);
    if (!overlap || overlap.length < MIN_DOOR_CLEARANCE) continue; // this edit broke the adjacency
    addDoor(aId, bId, overlap);
  }

  // Doors, part 2: a brand-new adjacency is only ever a real possibility where *this* edit
  // actually moved, resized, or added a room — never a blanket rescan of every room pair, see
  // the function header for why that's exactly what caused the door-count inflation bug.
  for (const editedId of editedOrNewRoomIds) {
    const ra = byId.get(editedId);
    if (!ra) continue;
    for (const rb of rooms) {
      if (rb.id === editedId) continue;
      const key = doorKey([editedId, rb.id]);
      if (preservedDoorKeys.has(key)) continue;
      const overlap = sharedEdgeOverlap(ra, rb);
      if (!overlap || overlap.length < MIN_DOOR_CLEARANCE) continue;
      addDoor(editedId, rb.id, overlap);
    }
  }

  // Front door: if an entry room still exists, give it one opening onto the exterior front
  // wall — stateless and cheap to re-derive in full every time, same as the walls above (it's
  // a single, deterministic opening keyed purely on the entry room's own current position).
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
