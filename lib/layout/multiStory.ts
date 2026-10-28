// Real 2-story generation, built from the single-story engine's own primitives
// (lib/layout/generate.ts) rather than a rewrite of generateFloorPlan — that function is
// live for real users and stays byte-for-byte unchanged for every stories=1 brief.
//
// Shape of a generated 2-story house:
//   - ONE footprint (width × depth), computed once from sqft / 2 and shared by both
//     floors — a real upper floor sits on the walls of the floor below it, it is not an
//     independently-proportioned second building that happens to be drawn next to it.
//   - A stair strip reserved at the SAME rect on both floors ({x:0, y:0, w:4, h:depth}),
//     so vertical alignment is guaranteed by construction, not a coincidence of two
//     separate layouts. Inside that strip, the actual flight (treads) is placed by a
//     real solver (solveStairRun) so that the ground-floor door lands at the bottom of
//     the flight and the upper-floor door lands at the top — never on the steps, never
//     over the open stairwell.
//   - Ground floor: entry foyer + every public room (+ garage, attached beside the
//     house exactly like the single-story engine does). Upper floor: every bedroom and
//     bathroom, laid out by the same layoutPrivateZone the single-story engine uses.
//
// Deliberate v1 simplification, documented rather than hidden: the stair strip runs the
// house's FULL depth instead of being just the ~18ft a real straight flight + two landings
// needs. Keeping it full-depth leaves the rest of each floor a clean rectangle, so every
// existing row/column/private-zone primitive works on it unchanged — the same kind of
// "simpler, equally-real" call as the courtyard topology's fully enclosed void. The extra
// strip length is real, usable circulation (a stair hall on the ground floor, a gallery
// landing upstairs), not a fake room; carving it into an L-shaped zone is a later step.

import type { BriefInput, Door, FloorPlan, Room, RoomType } from "./types";
import { buildRoomProgram, type ProgramRoom } from "./program";
import { allocateLengths, layoutRow, sharedEdgeOverlap, type Rect } from "./geometry";
import { autoPlaceFurniture } from "./furniture";
import { computeWindows } from "./windows";
import { computeDoorSwings } from "./doorSwings";
import { STAIR_LANDING, STAIR_RUN, STAIRS_WIDTH } from "./stairSpec";
import {
  DOOR_WIDTH,
  ENTRY_DEPTH_TARGET,
  LAYOUT_VARIANTS,
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
  MIN_ENTRY_DEPTH,
  buildWallsAndDoors,
  checkAspectRatios,
  checkGarageAccess,
  checkMinimums,
  computeBaselineAspectRatio,
  layoutPrivateZone,
  minSaneDepthForRow,
  round1,
  roundRoom,
  roundTo,
  splitSliverRooms,
  toAllocItem,
  toRoom,
  type FloorPlanOption,
} from "./generate";

/** Smallest clear stretch of shared wall worth putting a stair door in (gives a ≥2.4ft door at the 0.8 ratio buildWallsAndDoors uses). */
const MIN_STAIR_DOOR_SLOT = 3;
/** Foyer width that must remain after carving a powder room off its end — below this the powder room stays in a public row instead. */
const POWDER_FOYER_MIN_ENTRY_WIDTH = 12;
/** Search granularity for where the flight sits inside the strip — matches the 0.5ft grid the rest of the engine rounds to. */
const STAIR_SEARCH_STEP = 0.5;

const STAIRS_ID = "stairs";
const LANDING_ID = "stairs_landing";

export { STAIR_LANDING, STAIR_RISERS, STAIR_RUN, STAIR_TREAD_IN, STAIRS_WIDTH } from "./stairSpec";

export interface MultiStoryPlan {
  /** Ground floor first. Each one is a complete, independent FloorPlan — every existing renderer/exporter draws it unchanged. */
  floors: FloorPlan[];
}

/**
 * 2-story counterpart of generateFloorPlan. `aspectRatio` works exactly like the
 * single-story engine's (defaults to its computed baseline, clamped to the same range),
 * so the Compact/Classic/Wide variants mean the same thing for both.
 */
export function generateMultiStoryPlan(input: BriefInput, aspectRatio?: number): MultiStoryPlan {
  const program = buildRoomProgram(input);

  // ---- One footprint, shared by both floors.
  const perFloorArea = input.sqft / 2;
  const requested = aspectRatio ?? computeBaselineAspectRatio(program);
  const resolved = Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, requested));
  const width = roundTo(Math.sqrt(perFloorArea * resolved), 0.5);
  const depth = roundTo(perFloorArea / width, 0.5);
  const zoneX = STAIRS_WIDTH;
  const zoneW = width - STAIRS_WIDTH;
  const stairsRect: Rect = { x: 0, y: 0, w: STAIRS_WIDTH, h: depth };

  const ground = layoutGroundFloor(program, zoneX, zoneW, depth);
  const upper = layoutUpperFloor(program, zoneX, zoneW, depth, input.openPlan);

  // ---- Place the actual flight inside the shared strip so BOTH floors get a real door
  // at the correct end of it (bottom step downstairs, arrival landing upstairs).
  const stair = solveStairRun(ground.rooms, upper.rooms, depth);

  const groundRooms: Room[] = [...ground.rooms, stairRoom(STAIRS_ID, "Stairs", stairsRect, stair, "lower")];
  const upperRooms: Room[] = [...upper.rooms, stairRoom(LANDING_ID, "Stairs Landing", stairsRect, stair, "upper")];

  // ---- Garage: attached beside the ground floor exactly like the single-story engine,
  // with its interior door to whichever ground-floor room *actually* touches its wall.
  const groundAdjacency = [...ground.adjacency];
  let totalWidth = width;
  if (program.garage) {
    const garageDepth = Math.min(depth, roundTo(Math.sqrt(program.garage.idealArea * 1.6), 0.5));
    const garageWidth = roundTo(program.garage.idealArea / garageDepth, 0.5);
    const garageRect: Rect = { x: width, y: 0, w: garageWidth, h: garageDepth };
    groundRooms.push(toRoom(program.garage, garageRect));
    totalWidth = width + garageWidth;
    const neighbour = bestTouchingRoom(ground.rooms, garageRect, ["half_bath", "closet"]);
    if (neighbour) groundAdjacency.push({ a: neighbour.id, b: program.garage.id });
  }

  const groundWarnings = [...ground.warnings];
  const upperWarnings = [...upper.warnings];

  const groundBuilt = buildWallsAndDoors(groundRooms, groundAdjacency);
  const upperBuilt = buildWallsAndDoors(upperRooms, upper.adjacency);

  if (stair) {
    groundBuilt.doors.push(stairDoor("door_stairs", stair.ground, STAIRS_ID));
    upperBuilt.doors.push(stairDoor("door_stairs_landing", stair.upper, LANDING_ID));
  } else {
    const msg =
      "The stairs couldn't be given a real door at the bottom AND top of the flight in this layout — try a different variant or more sqft.";
    groundWarnings.push(msg);
    upperWarnings.push(msg);
  }
  if (depth < STAIR_RUN + 2 * STAIR_LANDING) {
    groundWarnings.push(
      `The house is only ${round1(depth)}' deep — a code-compliant straight stair needs about ${round1(STAIR_RUN + 2 * STAIR_LANDING)}' (flight + top and bottom landings). Increase total sqft.`,
    );
  }

  const entry = groundRooms.find((r) => r.id === program.entry.id)!;
  groundBuilt.doors.push({
    id: "front_door",
    x: entry.x + entry.w / 2,
    y: 0,
    orientation: "h",
    width: DOOR_WIDTH,
    connects: ["exterior", entry.id],
  });

  checkGarageAccess(groundRooms, groundBuilt.doors, groundWarnings);
  checkReachability(groundRooms, groundBuilt.doors, "exterior", "Ground floor", groundWarnings);
  checkReachability(upperRooms, upperBuilt.doors, LANDING_ID, "Upper floor", upperWarnings);

  const footprint = { w: round1(totalWidth), h: round1(depth) };
  return {
    floors: [
      finishFloor(groundRooms, groundBuilt.walls, groundBuilt.doors, groundWarnings, footprint),
      finishFloor(upperRooms, upperBuilt.walls, upperBuilt.doors, upperWarnings, footprint),
    ],
  };
}

/** Same Compact/Classic/Wide variants as generateFloorPlanOptions, each a real independent 2-story layout. */
export function generateMultiStoryOptions(input: BriefInput): FloorPlanOption[] {
  const baseline = computeBaselineAspectRatio(buildRoomProgram(input));
  return LAYOUT_VARIANTS.map((variant) => {
    const { floors } = generateMultiStoryPlan(input, baseline * variant.ratioMultiplier);
    return { variant, plan: floors[0], floors };
  });
}

// ---------------------------------------------------------------------------
// Ground floor

interface FloorLayout {
  rooms: Room[];
  adjacency: Array<{ a: string; b: string }>;
  warnings: string[];
}

/**
 * Entry foyer as a shallow strip across the front of the zone (same ENTRY_DEPTH_TARGET
 * logic as the single-story engine), then the public rooms behind it in ONE or TWO rows —
 * whichever gives the better worst-case room shape. The single-story engine only ever
 * needs one row because its public zone is a shallow slice of the house; here the public
 * rooms get the whole floor's depth, and forcing living/kitchen/dining into one row 25ft
 * deep produced 7ft-wide slivers when this was first run on a real 3-bed brief.
 */
function layoutGroundFloor(
  program: ReturnType<typeof buildRoomProgram>,
  zoneX: number,
  zoneW: number,
  depth: number,
): FloorLayout {
  const warnings: string[] = [];
  const desiredEntryDepth = Math.min(ENTRY_DEPTH_TARGET, Math.max(MIN_ENTRY_DEPTH, depth * 0.4));
  const entryDepth = Math.min(roundTo(desiredEntryDepth, 0.5), Math.max(MIN_ENTRY_DEPTH, depth - MIN_ENTRY_DEPTH));
  const restDepth = depth - entryDepth;

  // Powder room off the foyer, carved from the entry strip's far end — where real 2-story
  // houses put it. Left in a public row instead, it gets forced to that row's full depth
  // (25ft+ here, since the public rooms get the whole floor) and the sliver-splitter turns
  // it into a 4' × 5' bath plus a pointless 4' × 21' "closet" — exactly what the first real
  // run of a 5-bed/3.5-bath brief through this file produced.
  const powder = program.publicRooms.find((p) => p.type === "half_bath");
  const powderW = powder ? Math.max(powder.minWidth, roundTo((powder.idealArea * 1.4) / entryDepth, 0.5)) : 0;
  const powderInFoyer = !!powder && zoneW - powderW >= POWDER_FOYER_MIN_ENTRY_WIDTH;
  const entryW = powderInFoyer ? zoneW - powderW : zoneW;

  const rooms: Room[] = [toRoom(program.entry, { x: zoneX, y: 0, w: entryW, h: entryDepth })];
  if (powderInFoyer) rooms.push(toRoom(powder!, { x: zoneX + entryW, y: 0, w: powderW, h: entryDepth }));
  const publicRooms = powderInFoyer ? program.publicRooms.filter((p) => p !== powder) : program.publicRooms;

  const oneRow = layoutPublicRows([publicRooms], zoneX, entryDepth, zoneW, restDepth);
  const split = splitIndexByArea(publicRooms);
  const twoRow = split > 0 ? layoutPublicRows([publicRooms.slice(0, split), publicRooms.slice(split)], zoneX, entryDepth, zoneW, restDepth) : null;
  const chosen = twoRow && worstAspect(twoRow.rooms) < worstAspect(oneRow.rooms) ? twoRow : oneRow;

  rooms.push(...chosen.rooms);
  if (!chosen.feasible) {
    warnings.push(
      "The ground-floor rooms (living, kitchen, dining, office) don't comfortably fit this square footage. Sizes below are scaled down from a realistic minimum — increase total sqft or drop a room.",
    );
  }

  const adjacency = [...chosen.adjacency];
  const firstRow = chosen.rows[0];
  if (firstRow && firstRow.length > 0) adjacency.push({ a: program.entry.id, b: firstRow[0].id });
  if (powderInFoyer) adjacency.push({ a: program.entry.id, b: powder!.id });

  checkMinimums(rooms, warnings);
  checkAspectRatios(rooms, warnings);
  return { rooms, adjacency, warnings };
}

interface PublicRowsResult {
  rooms: Room[];
  rows: ProgramRoom[][];
  adjacency: Array<{ a: string; b: string }>;
  feasible: boolean;
}

function layoutPublicRows(rows: ProgramRoom[][], x: number, y: number, w: number, totalDepth: number): PublicRowsResult {
  const nonEmpty = rows.filter((r) => r.length > 0);
  // Row depths proportional to each row's ideal area, floored so a row's dominant room
  // can't come out a sliver — the same allocateLengths + minSaneDepthForRow mechanism the
  // single-story private zone's near/far rows use, so the depths always sum exactly.
  const alloc = allocateLengths(
    totalDepth,
    nonEmpty.map((row, i) => ({
      id: `row${i}`,
      ideal: row.reduce((s, p) => s + p.idealArea, 0) || 1,
      min: nonEmpty.length > 1 ? Math.max(Math.min(8, totalDepth / 2), minSaneDepthForRow(row, w)) : 0,
    })),
  );

  const rooms: Room[] = [];
  const adjacency: Array<{ a: string; b: string }> = [];
  let feasible = alloc.feasible;
  let cursorY = y;
  const placedRows: Room[][] = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    const row = nonEmpty[i];
    const isLast = i === nonEmpty.length - 1;
    const rowDepth = isLast ? y + totalDepth - cursorY : roundTo(alloc.lengths.get(`row${i}`) ?? totalDepth / nonEmpty.length, 0.5);
    const laid = layoutRow(row.map(toAllocItem(rowDepth)), x, cursorY, w, rowDepth);
    feasible = feasible && laid.feasible;
    const sliver = splitSliverRooms(row, laid.rects, rowDepth, "front");
    const rowRooms = row.map((p) => toRoom(p, sliver.rects.get(p.id)!));
    rooms.push(...rowRooms, ...sliver.extraRooms.map((p) => toRoom(p, sliver.rects.get(p.id)!)));
    for (let j = 1; j < row.length; j++) adjacency.push({ a: row[j - 1].id, b: row[j].id });
    adjacency.push(...sliver.extraAdjacency);
    placedRows.push(rowRooms);
    cursorY += rowDepth;
  }

  // Each back-row room opens into whichever front-row room it actually shares the most wall
  // with — derived from the placed geometry, not assumed from list order.
  for (let i = 1; i < placedRows.length; i++) {
    for (const room of placedRows[i]) {
      const neighbour = bestTouchingRoom(placedRows[i - 1], room, ["half_bath", "closet"]);
      if (neighbour) adjacency.push({ a: neighbour.id, b: room.id });
    }
  }

  return { rooms, rows: nonEmpty, adjacency, feasible };
}

/** Order-preserving split (keeps kitchen next to dining) that best balances the two rows' ideal area. 0 = no valid split. */
function splitIndexByArea(items: ProgramRoom[]): number {
  if (items.length < 2) return 0;
  const total = items.reduce((s, p) => s + p.idealArea, 0);
  let best = 0;
  let bestDiff = Infinity;
  let acc = 0;
  for (let k = 1; k < items.length; k++) {
    acc += items[k - 1].idealArea;
    const diff = Math.abs(acc - total / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best;
}

function worstAspect(rooms: Room[]): number {
  return rooms
    .filter((r) => r.type !== "closet")
    .reduce((worst, r) => Math.max(worst, Math.max(r.w, r.h) / Math.max(0.01, Math.min(r.w, r.h))), 0);
}

// ---------------------------------------------------------------------------
// Upper floor

function layoutUpperFloor(
  program: ReturnType<typeof buildRoomProgram>,
  zoneX: number,
  zoneW: number,
  depth: number,
  openPlan: boolean,
): FloorLayout {
  const warnings: string[] = [];
  const items = [...program.bedrooms, ...program.privateBaths];
  // hasGarage=false: the courtyard topology (an open-air void between wings) is a
  // ground-level pattern — upstairs it would be a hole in the roof over the rooms below.
  const zone = layoutPrivateZone(items, zoneW, 0, depth, false, openPlan);
  const shift = (r: Rect): Rect => ({ ...r, x: r.x + zoneX });

  const rooms: Room[] = [...items, ...zone.extraRooms].map((p) => toRoom(p, shift(zone.rects.get(p.id)!)));
  if (zone.hallwayRect) rooms.push(hallwayRoom("hallway", shift(zone.hallwayRect)));
  if (zone.hallwayWingBRect) rooms.push(hallwayRoom("hallway_wingB", shift(zone.hallwayWingBRect)));
  if (!zone.feasible) {
    warnings.push(
      "The bedrooms/bathrooms don't comfortably fit on the upper floor at this square footage. Sizes below are scaled down from a realistic minimum — increase total sqft, or reduce bedroom/bathroom count.",
    );
  }
  checkMinimums(rooms, warnings);
  checkAspectRatios(rooms, warnings);
  return { rooms, adjacency: zone.adjacency, warnings };
}

function hallwayRoom(id: string, rect: Rect): Room {
  return { id, type: "hallway", label: "Hallway", ...rect, areaSqft: round1(rect.w * rect.h) };
}

// ---------------------------------------------------------------------------
// Stairs

/** Rooms you'd never route a staircase through, ranked otherwise (lower = better). */
const GROUND_STAIR_RANK: Partial<Record<RoomType, number>> = { entry: 0, hallway: 1, living: 2, great_room: 2, dining: 3, office: 4, kitchen: 5 };
const UPPER_STAIR_RANK: Partial<Record<RoomType, number>> = { hallway: 0, bedroom: 2, office: 3, primary_bedroom: 4 };

interface StairDoorSlot {
  roomId: string;
  /** Door centre along the strip's shared wall (x = STAIRS_WIDTH). */
  y: number;
  width: number;
}

interface StairSolution {
  /** Flight position along the strip, absolute y. */
  start: number;
  bottomAt: "start" | "end";
  ground: StairDoorSlot;
  upper: StairDoorSlot;
}

/**
 * Picks where the flight sits inside the shared strip and which room each floor's stair
 * door opens into. A real constraint solve, not a fixed position: the ground-floor door
 * must land in the clear landing at the BOTTOM of the flight (never onto the side of a
 * step), and the upper-floor door must land in the clear landing at the TOP (never over
 * the open stairwell) — and both landings must be ≥ 3ft deep (IRC R311.7.6). Tries both
 * flight directions at every 0.5ft offset; ranks by room suitability (foyer/hallway
 * first, never a bathroom or closet), then by the widest pair of doors that fit.
 */
function solveStairRun(groundRooms: Room[], upperRooms: Room[], depth: number): StairSolution | null {
  const groundEdges = stripNeighbours(groundRooms, GROUND_STAIR_RANK, depth);
  const upperEdges = stripNeighbours(upperRooms, UPPER_STAIR_RANK, depth);
  let best: { score: number; solution: StairSolution } | null = null;

  for (let start = 0; start + STAIR_RUN <= depth + 1e-6; start += STAIR_SEARCH_STEP) {
    const end = start + STAIR_RUN;
    const before: [number, number] = [0, start];
    const after: [number, number] = [end, depth];
    for (const bottomAt of ["start", "end"] as const) {
      const bottomLanding = bottomAt === "start" ? before : after;
      const topLanding = bottomAt === "start" ? after : before;
      if (bottomLanding[1] - bottomLanding[0] < STAIR_LANDING - 1e-6) continue;
      if (topLanding[1] - topLanding[0] < STAIR_LANDING - 1e-6) continue;
      const g = bestSlot(groundEdges, bottomLanding);
      const u = bestSlot(upperEdges, topLanding);
      if (!g || !u) continue;
      const score = (g.rank + u.rank) * 100 - (g.slot.width + u.slot.width);
      if (!best || score < best.score - 1e-9) {
        best = { score, solution: { start, bottomAt, ground: g.slot, upper: u.slot } };
      }
    }
  }
  return best?.solution ?? null;
}

interface StripEdge {
  room: Room;
  rank: number;
  from: number;
  to: number;
}

function stripNeighbours(rooms: Room[], ranks: Partial<Record<RoomType, number>>, depth: number): StripEdge[] {
  const edges: StripEdge[] = [];
  for (const room of rooms) {
    const rank = ranks[room.type];
    if (rank === undefined || Math.abs(room.x - STAIRS_WIDTH) > 0.01) continue;
    const from = Math.max(0, room.y);
    const to = Math.min(depth, room.y + room.h);
    if (to - from > 0.01) edges.push({ room, rank, from, to });
  }
  return edges;
}

function bestSlot(edges: StripEdge[], [lo, hi]: [number, number]): { rank: number; slot: StairDoorSlot } | null {
  let best: { rank: number; slot: StairDoorSlot } | null = null;
  for (const e of edges) {
    const from = Math.max(lo, e.from);
    const to = Math.min(hi, e.to);
    const len = to - from;
    if (len < MIN_STAIR_DOOR_SLOT - 1e-6) continue;
    const slot = { roomId: e.room.id, y: (from + to) / 2, width: Math.min(DOOR_WIDTH, len * 0.8) };
    if (!best || e.rank < best.rank || (e.rank === best.rank && slot.width > best.slot.width)) best = { rank: e.rank, slot };
  }
  return best;
}

function stairRoom(id: string, label: string, rect: Rect, stair: StairSolution | null, floor: "lower" | "upper"): Room {
  return {
    id,
    type: "stairs",
    label,
    ...rect,
    areaSqft: round1(rect.w * rect.h),
    ...(stair ? { stairRun: { start: stair.start - rect.y, length: STAIR_RUN, bottomAt: stair.bottomAt, floor } } : {}),
  };
}

function stairDoor(id: string, slot: StairDoorSlot, stairRoomId: string): Door {
  return { id, x: STAIRS_WIDTH, y: slot.y, orientation: "v", width: slot.width, connects: [slot.roomId, stairRoomId] };
}

// ---------------------------------------------------------------------------
// Shared helpers

/** The room (excluding `avoid` types) that shares the longest real wall with `rect`, or null. */
function bestTouchingRoom(rooms: Room[], rect: Rect, avoid: RoomType[]): Room | null {
  let best: Room | null = null;
  let bestLen = 0;
  for (const room of rooms) {
    if (avoid.includes(room.type)) continue;
    const overlap = sharedEdgeOverlap(room, rect);
    if (overlap && overlap.length >= 1 && overlap.length > bestLen) {
      best = room;
      bestLen = overlap.length;
    }
  }
  return best;
}

/**
 * Walks the real door graph from the floor's way in (the front door downstairs, the
 * stair landing upstairs) and names any room you can't actually walk into — the same
 * "never silently ship a sealed room" bar as checkGarageAccess, applied to every room.
 */
export function checkReachability(rooms: Room[], doors: Door[], startId: string, floorLabel: string, warnings: string[]) {
  const reached = new Set<string>([startId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of doors) {
      const [a, b] = d.connects;
      if (reached.has(a) && !reached.has(b)) {
        reached.add(b);
        grew = true;
      } else if (reached.has(b) && !reached.has(a)) {
        reached.add(a);
        grew = true;
      }
    }
  }
  for (const room of rooms) {
    if (!reached.has(room.id)) warnings.push(`${floorLabel}: ${room.label} has no door path from the rest of the house in this layout.`);
  }
}

function finishFloor(rooms: Room[], walls: FloorPlan["walls"], doors: Door[], warnings: string[], footprint: FloorPlan["footprint"]): FloorPlan {
  const roundedRooms = rooms.map(roundRoom);
  const furniture = autoPlaceFurniture(roundedRooms);
  const { doors: doorsWithSwing, warnings: swingWarnings } = computeDoorSwings(roundedRooms, doors, furniture);
  return {
    // Both floors get the same sheet extents (the ground floor's, garage included) so a
    // floor switcher, the PDF pages and a DXF overlay all line up one-to-one, the way a
    // real drawing set aligns every level to the same grid.
    footprint,
    totalAreaSqft: round1(rooms.reduce((s, r) => s + r.areaSqft, 0)),
    rooms: roundedRooms,
    walls,
    doors: doorsWithSwing,
    warnings: [...warnings, ...swingWarnings],
    furniture,
    windows: computeWindows(roundedRooms, walls, doorsWithSwing),
  };
}

