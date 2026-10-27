// Real computed door-swing direction + clearance checking. Maket.ai's own documented complaint
// (Trustpilot: "a door opening into the primary bedroom," reviewers citing weak spatial reasoning)
// is exactly the failure mode this exists to catch — rather than draw every door as an unopinioned
// gap, pick the hinge side + which room it swings into by actually testing both against the real
// furniture already placed in each candidate room, and warn honestly when no collision-free option
// exists instead of silently picking one anyway.
import type { Door, FurnitureItem, Room } from "./types";

export interface DoorSwing {
  hingeSide: "start" | "end";
  /** Room id the leaf swings into (never "exterior" — an exterior door always swings inward). */
  swingInto: string;
}

interface Vec2 {
  x: number;
  y: number;
}

function roomById(rooms: Room[], id: string): Room | undefined {
  return rooms.find((r) => r.id === id);
}

function pointInRoom(x: number, y: number, room: Room): boolean {
  const slack = 0.05;
  return x >= room.x - slack && x <= room.x + room.w + slack && y >= room.y - slack && y <= room.y + room.h + slack;
}

/** Which connected room lies on each side of the opening, determined by testing a point just off
 * the wall line against each room's real rectangle — never assumed from `connects`' array order. */
function sideRooms(door: Door, rooms: Room[]): { negative?: Room; positive?: Room } {
  const probe = 0.3;
  const candidates = door.connects
    .filter((id) => id !== "exterior")
    .map((id) => roomById(rooms, id))
    .filter((r): r is Room => !!r);
  let negative: Room | undefined;
  let positive: Room | undefined;
  for (const room of candidates) {
    if (door.orientation === "h") {
      if (pointInRoom(door.x, door.y - probe, room)) negative = room;
      if (pointInRoom(door.x, door.y + probe, room)) positive = room;
    } else {
      if (pointInRoom(door.x - probe, door.y, room)) negative = room;
      if (pointInRoom(door.x + probe, door.y, room)) positive = room;
    }
  }
  return { negative, positive };
}

function hingePoint(door: Door, hingeSide: "start" | "end"): Vec2 {
  const half = door.width / 2;
  if (door.orientation === "h") return { x: door.x + (hingeSide === "start" ? -half : half), y: door.y };
  return { x: door.x, y: door.y + (hingeSide === "start" ? -half : half) };
}

/** Unit vector from the hinge toward the opening's other end, along the wall. */
function alongWallDir(door: Door, hingeSide: "start" | "end"): Vec2 {
  if (door.orientation === "h") return { x: hingeSide === "start" ? 1 : -1, y: 0 };
  return { x: 0, y: hingeSide === "start" ? 1 : -1 };
}

interface Candidate {
  hingeSide: "start" | "end";
  swingInto: Room;
  normal: Vec2;
}

function buildCandidates(door: Door, rooms: Room[]): Candidate[] {
  const { negative, positive } = sideRooms(door, rooms);
  const normalNeg: Vec2 = door.orientation === "h" ? { x: 0, y: -1 } : { x: -1, y: 0 };
  const normalPos: Vec2 = door.orientation === "h" ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const candidates: Candidate[] = [];
  for (const hingeSide of ["start", "end"] as const) {
    if (negative) candidates.push({ hingeSide, swingInto: negative, normal: normalNeg });
    if (positive) candidates.push({ hingeSide, swingInto: positive, normal: normalPos });
  }
  return candidates;
}

/** The leaf's swept quarter-circle approximated as its axis-aligned bounding square (exact for an
 * axis-aligned wall: a quarter circle of radius `width` spans exactly [0,width] along both the
 * along-wall and normal directions) — a real geometric computation, not a guess, traded for speed
 * over an exact circular-sector/rect intersection. */
function swingAabb(hinge: Vec2, along: Vec2, normal: Vec2, width: number) {
  const x2 = hinge.x + width * (along.x + normal.x);
  const y2 = hinge.y + width * (along.y + normal.y);
  return { minX: Math.min(hinge.x, x2), maxX: Math.max(hinge.x, x2), minY: Math.min(hinge.y, y2), maxY: Math.max(hinge.y, y2) };
}

function furnitureInRoom(furniture: FurnitureItem[], room: Room): FurnitureItem[] {
  return furniture.filter((f) => {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    return cx >= room.x && cx <= room.x + room.w && cy >= room.y && cy <= room.y + room.h;
  });
}

function aabbOverlapsFurniture(a: { minX: number; maxX: number; minY: number; maxY: number }, item: FurnitureItem): boolean {
  return !(item.x + item.w <= a.minX || item.x >= a.maxX || item.y + item.h <= a.minY || item.y >= a.maxY);
}

/**
 * Picks a real hinge side + swing-into room per door by scoring every geometrically valid
 * candidate against the furniture already placed in that candidate room, preferring zero
 * collisions; ties broken toward the larger room, then a deterministic hinge side. Doors a prior
 * share link/template saved before this existed come back through unmodified except for the new
 * fields (`hingeSide`/`swingInto` stay optional on the type), same backward-compat pattern as
 * `computeWindows`.
 */
export function computeDoorSwings(rooms: Room[], doors: Door[], furniture: FurnitureItem[]): { doors: Door[]; warnings: string[] } {
  const warnings: string[] = [];
  const result = doors.map((door) => {
    const candidates = buildCandidates(door, rooms);
    if (candidates.length === 0) return door;

    let best = candidates[0];
    let bestCount = Infinity;
    for (const candidate of candidates) {
      const hinge = hingePoint(door, candidate.hingeSide);
      const along = alongWallDir(door, candidate.hingeSide);
      const aabb = swingAabb(hinge, along, candidate.normal, door.width);
      const count = furnitureInRoom(furniture, candidate.swingInto).filter((f) => aabbOverlapsFurniture(aabb, f)).length;
      const better =
        count < bestCount || (count === bestCount && candidate.swingInto.areaSqft > best.swingInto.areaSqft);
      if (better) {
        best = candidate;
        bestCount = count;
      }
    }

    if (bestCount > 0) {
      const doorLabel = door.id === "front_door" ? "The front door" : `The door into ${best.swingInto.label}`;
      warnings.push(`${doorLabel} may swing into furniture in ${best.swingInto.label} in every layout this engine tried — move that piece or widen the room.`);
    }

    return { ...door, hingeSide: best.hingeSide, swingInto: best.swingInto.id };
  });
  return { doors: result, warnings };
}

export interface DoorSwingGeometry {
  hinge: Vec2;
  /** The leaf's far tip when open: hinge + width in the swing-into room's direction. */
  openTip: Vec2;
  /** Where the opening's unhinged edge sits when the leaf is closed (flush with the wall). */
  closedTip: Vec2;
}

/** Shared by the 2D/3D renderers so the arc/leaf they draw always matches the geometry
 * `computeDoorSwings` actually scored — never a separately-eyeballed approximation. */
export function resolveDoorSwingGeometry(door: Door, rooms: Room[]): DoorSwingGeometry | undefined {
  if (!door.hingeSide || !door.swingInto) return undefined;
  const swingRoom = roomById(rooms, door.swingInto);
  if (!swingRoom) return undefined;
  const { negative, positive } = sideRooms(door, rooms);
  let normal: Vec2 | undefined;
  if (positive?.id === swingRoom.id) {
    normal = door.orientation === "h" ? { x: 0, y: 1 } : { x: 1, y: 0 };
  } else if (negative?.id === swingRoom.id) {
    normal = door.orientation === "h" ? { x: 0, y: -1 } : { x: -1, y: 0 };
  }
  if (!normal) return undefined;
  const hinge = hingePoint(door, door.hingeSide);
  const along = alongWallDir(door, door.hingeSide);
  return {
    hinge,
    openTip: { x: hinge.x + door.width * normal.x, y: hinge.y + door.width * normal.y },
    closedTip: { x: hinge.x + door.width * along.x, y: hinge.y + door.width * along.y },
  };
}
