import type { BriefInput, Door, FloorPlan, Room, Wall } from "./types";
import { buildRoomProgram, getMinArea, type ProgramRoom } from "./program";
import { allocateLengths, layoutRow, sharedEdgeOverlap, type AllocItem, type Rect } from "./geometry";

const HALLWAY_WIDTH = 3.5;
const DOOR_WIDTH = 3;
/** Width : depth ratio for the main footprint — a mild rectangle, not a square or a shoebox. */
const ASPECT_RATIO = 1.35;
/**
 * Once the private zone needs 2 bedroom rows (3+ bedrooms/baths), a wide-and-shallow
 * footprint forces whichever row has fewer rooms (typically the primary suite) to span
 * nearly the full house width at a shallow depth — producing "bowling alley" bedrooms
 * (e.g. 35' x 9'). A deeper, narrower footprint gives each row enough depth to keep
 * rooms close to a sane proportion instead. Real finding from testing a real 3-bed/2-bath
 * brief through the live app: this exact brief produced a 35.6' x 9.0' (320.8 sqft)
 * "Primary Bedroom" before this fix — a shape no real architect would accept.
 */
const ASPECT_RATIO_DEEP = 0.78;
/** Private-room count (bedrooms + private baths) at which layoutPrivateZone switches to 2 rows. */
const TWO_ROW_PRIVATE_THRESHOLD = 3;
/** Width:depth ratio beyond which a bedroom/bathroom reads as an unrealistic sliver, not a usable room. */
const MAX_SANE_ROOM_ASPECT = 2.2;

export interface LayoutVariant {
  /** Stable key, also used as the React list key in the compare UI. */
  id: string;
  label: string;
  description: string;
  /** Multiplier applied to the engine's own computed baseline ratio (see computeBaselineAspectRatio) — never an absolute override, so a variant can never undo the deep-footprint anti-"bowling-alley-bedroom" fix below. */
  ratioMultiplier: number;
}

/**
 * Three genuinely different footprint shapes for the same program — Maket's
 * "multiple layout variations" step, done honestly: every variant re-runs the
 * *real* layout engine with a different width:depth ratio, so room counts,
 * adjacency, wall/door placement and warnings all come out independently
 * computed per variant (not one plan with cosmetic relabeling). Expressed as
 * multipliers on the engine's own baseline (not fixed absolute ratios) so a
 * 3+ bedroom brief still gets the deep/narrow anti-sliver-bedroom treatment
 * in every variant, just scaled — e.g. "Compact" is deeper still, "Wide" is
 * the least deep of the three but never reverts to a flat/unsafe ratio.
 */
export const LAYOUT_VARIANTS: LayoutVariant[] = [
  { id: "compact", label: "Compact", description: "Closer to square — shorter exterior walls, tighter hallway.", ratioMultiplier: 0.75 },
  { id: "classic", label: "Classic", description: "The engine's own balanced default proportion for this program.", ratioMultiplier: 1.0 },
  { id: "wide", label: "Wide", description: "A broad street-facing front, shallower depth — ranch-style massing.", ratioMultiplier: 1.3 },
];

/**
 * Picks the footprint width:depth ratio a plan should use by default: once the
 * private zone needs 2 bedroom rows (3+ bedrooms/baths), a wide-and-shallow
 * footprint forces whichever row has fewer rooms (typically the primary suite)
 * to span nearly the full house width at a shallow depth — producing "bowling
 * alley" bedrooms (e.g. 35' x 9'). A deeper, narrower footprint gives each row
 * enough depth to keep rooms close to a sane proportion instead. Real finding
 * from testing a real 3-bed/2-bath brief through the live app: this exact
 * brief produced a 35.6' x 9.0' (320.8 sqft) "Primary Bedroom" before this fix.
 */
function computeBaselineAspectRatio(program: ReturnType<typeof buildRoomProgram>): number {
  const privateRoomCount = program.bedrooms.length + program.privateBaths.length;
  return privateRoomCount >= TWO_ROW_PRIVATE_THRESHOLD ? ASPECT_RATIO_DEEP : ASPECT_RATIO;
}

/**
 * The whole engine, end to end: parsed brief -> room program -> a real
 * rectangular-subdivision layout -> walls/doors derived from the actual
 * geometry. Nothing here is a template or a canned image — every number is
 * computed from `input`. `aspectRatio` defaults to the engine's own computed
 * baseline (see computeBaselineAspectRatio) when not explicitly passed.
 */
export function generateFloorPlan(input: BriefInput, aspectRatio?: number): FloorPlan {
  const program = buildRoomProgram(input);
  const warnings: string[] = [];

  const interiorArea = input.sqft;
  const resolvedAspectRatio = aspectRatio ?? computeBaselineAspectRatio(program);
  const width = roundTo(Math.sqrt(interiorArea * resolvedAspectRatio), 0.5);
  const depth = roundTo(interiorArea / width, 0.5);

  const publicProgramRooms = [program.entry, ...program.publicRooms];
  const privateProgramRooms = [...program.bedrooms, ...program.privateBaths];

  const publicIdeal = sumIdeal(publicProgramRooms);
  const privateIdeal = sumIdeal(privateProgramRooms) + estimateHallwayIdeal(privateProgramRooms.length, width);
  const publicDepth = roundTo(depth * (publicIdeal / (publicIdeal + privateIdeal || 1)), 0.5);
  const privateDepth = depth - publicDepth;

  const rooms: Room[] = [];
  const adjacency: Array<{ a: string; b: string }> = [];

  // ---- Public zone: one row across the front, left to right in the order you'd actually walk through them.
  const publicRow = layoutRow(publicProgramRooms.map(toAllocItem(publicDepth)), 0, 0, width, publicDepth);
  if (!publicRow.feasible) {
    warnings.push(
      "The public rooms (entry, living, kitchen, dining, office) don't comfortably fit this square footage. Sizes below are scaled down from a realistic minimum — increase total sqft or drop a room.",
    );
  }
  for (let i = 0; i < publicProgramRooms.length; i++) {
    const p = publicProgramRooms[i];
    rooms.push(toRoom(p, publicRow.rects.get(p.id)!));
    if (i > 0) adjacency.push({ a: publicProgramRooms[i - 1].id, b: p.id });
  }

  // ---- Private zone: bedrooms + bathrooms, in one or two rows around a hallway.
  const privateZone = layoutPrivateZone(privateProgramRooms, width, publicDepth, privateDepth);
  for (const p of privateProgramRooms) {
    rooms.push(toRoom(p, privateZone.rects.get(p.id)!));
  }
  adjacency.push(...privateZone.adjacency);
  if (!privateZone.feasible) {
    warnings.push(
      "The bedrooms/bathrooms don't comfortably fit this square footage. Sizes below are scaled down from a realistic minimum — increase total sqft, or reduce bedroom/bathroom count.",
    );
  }
  if (privateZone.hallwayRect) {
    rooms.push({
      id: "hallway",
      type: "hallway",
      label: "Hallway",
      ...privateZone.hallwayRect,
      areaSqft: round1(privateZone.hallwayRect.w * privateZone.hallwayRect.h),
    });
  }
  const publicToPrivateAnchor = privateZone.hallwayRect ? "hallway" : privateProgramRooms[0]?.id;
  if (publicToPrivateAnchor && publicProgramRooms.length > 0) {
    adjacency.push({ a: publicProgramRooms[publicProgramRooms.length - 1].id, b: publicToPrivateAnchor });
  }

  // ---- Garage: attached as its own block beside the main footprint.
  let totalWidth = width;
  if (program.garage) {
    const garageDepth = Math.min(depth, roundTo(Math.sqrt(program.garage.idealArea * 1.6), 0.5));
    const garageWidth = roundTo(program.garage.idealArea / garageDepth, 0.5);
    rooms.push({
      id: program.garage.id,
      type: "garage",
      label: program.garage.label,
      x: width,
      y: 0,
      w: garageWidth,
      h: garageDepth,
      areaSqft: round1(garageWidth * garageDepth),
    });
    totalWidth = width + garageWidth;
    adjacency.push({ a: program.entry.id, b: program.garage.id });
  }

  const { walls, doors } = buildWallsAndDoors(rooms, { width, depth }, adjacency);

  const entryRoom = rooms.find((r) => r.id === program.entry.id)!;
  doors.push({
    id: "front_door",
    x: entryRoom.x + entryRoom.w / 2,
    y: 0,
    orientation: "h",
    width: DOOR_WIDTH,
    connects: ["exterior", entryRoom.id],
  });

  checkMinimums(rooms, warnings);
  checkAspectRatios(rooms, warnings);

  const totalAreaSqft = round1(rooms.reduce((s, r) => s + r.areaSqft, 0));

  return {
    footprint: { w: round1(totalWidth), h: round1(depth) },
    totalAreaSqft,
    rooms: rooms.map(roundRoom),
    walls,
    doors,
    warnings,
  };
}

// ---------------------------------------------------------------------------

function sumIdeal(items: ProgramRoom[]): number {
  return items.reduce((s, i) => s + i.idealArea, 0);
}

/** Only used to proportion public-zone depth vs. private-zone depth before any room is placed. */
function estimateHallwayIdeal(privateRoomCount: number, width: number): number {
  if (privateRoomCount <= 1) return 0;
  return HALLWAY_WIDTH * width * (privateRoomCount >= 3 ? 0.5 : 0.25);
}

function toAllocItem(depth: number) {
  return (p: ProgramRoom): AllocItem => ({
    id: p.id,
    ideal: depth > 0 ? p.idealArea / depth : p.idealArea,
    min: p.minWidth,
  });
}

function toRoom(p: ProgramRoom, rect: Rect): Room {
  return { id: p.id, type: p.type, label: p.label, x: rect.x, y: rect.y, w: rect.w, h: rect.h, areaSqft: round1(rect.w * rect.h) };
}

interface PrivateZoneResult {
  rects: Map<string, Rect>;
  adjacency: Array<{ a: string; b: string }>;
  hallwayRect: Rect | null;
  feasible: boolean;
}

function layoutPrivateZone(items: ProgramRoom[], width: number, publicDepth: number, privateDepth: number): PrivateZoneResult {
  if (items.length === 0) {
    return { rects: new Map(), adjacency: [], hallwayRect: null, feasible: true };
  }

  const primary = items.find((i) => i.type === "primary_bedroom")!;
  const ensuite = items.find((i) => i.pairWith === primary.id);
  const others = items.filter((i) => i !== primary && i !== ensuite);
  const sharedBaths = others.filter((i) => i.type === "bath");
  const secondaryBedrooms = others.filter((i) => i.type !== "bath");
  const ordered = [primary, ...(ensuite ? [ensuite] : []), ...secondaryBedrooms, ...sharedBaths];

  const useTwoRows = ordered.length >= 3 && privateDepth >= HALLWAY_WIDTH + 16;

  if (!useTwoRows) {
    const hallwayDepth = items.length > 1 ? Math.min(HALLWAY_WIDTH, privateDepth * 0.25) : 0;
    const rowDepth = privateDepth - hallwayDepth;
    const row = layoutRow(ordered.map(toAllocItem(rowDepth)), 0, publicDepth + hallwayDepth, width, rowDepth);
    const hallwayId = hallwayDepth > 0 ? "hallway" : undefined;
    const adjacency = buildSequentialAdjacency(ordered, ensuite, primary, hallwayId);
    const hallwayRect = hallwayDepth > 0 ? { x: 0, y: publicDepth, w: width, h: hallwayDepth } : null;
    return { rects: row.rects, adjacency, hallwayRect, feasible: row.feasible };
  }

  // Keep the primary bedroom + ensuite together in the far (quieter) row,
  // then greedily place each remaining item in whichever row keeps the
  // area split closest to 50/50 — not just "below half", which could
  // overshoot past the target and leave one row starved (see below).
  const totalIdeal = ordered.reduce((s, i) => s + i.idealArea, 0);
  const target = totalIdeal / 2;
  const farRow: ProgramRoom[] = [primary, ...(ensuite ? [ensuite] : [])];
  const nearRow: ProgramRoom[] = [];
  let farArea = farRow.reduce((s, i) => s + i.idealArea, 0);
  for (const item of [...secondaryBedrooms, ...sharedBaths]) {
    const distanceWithItem = Math.abs(farArea + item.idealArea - target);
    const distanceWithoutItem = Math.abs(farArea - target);
    if (distanceWithItem < distanceWithoutItem) {
      farRow.push(item);
      farArea += item.idealArea;
    } else {
      nearRow.push(item);
    }
  }
  if (nearRow.length === 0 && farRow.length > 1) {
    nearRow.push(farRow.pop()!);
  }

  // Row depths are proportional to each row's own area share, not a flat
  // 50/50 split of the private zone's depth — otherwise a row with fewer,
  // lower-weight rooms (e.g. one bedroom + a half bath) gets forced into
  // the same depth as a row with more rooms, inflating its rooms' sizes
  // well past their ideal area. This was caught by running real examples
  // (see scripts/verify-examples.ts) before this fix.
  const nearIdeal = nearRow.reduce((s, i) => s + i.idealArea, 0);
  const farIdeal = farRow.reduce((s, i) => s + i.idealArea, 0);
  const usableDepth = privateDepth - HALLWAY_WIDTH;
  // Reuse the same constrained-allocation helper as the 1D room widths so the
  // two row depths always sum exactly to usableDepth — a plain Math.max(8, …)
  // clamp here let rooms overflow 0.5ft past the back exterior wall in
  // testing (clamping without re-normalizing broke the depth budget).
  const rowAlloc = allocateLengths(usableDepth, [
    { id: "near", ideal: nearIdeal || 1, min: Math.min(8, usableDepth / 2) },
    { id: "far", ideal: farIdeal || 1, min: Math.min(8, usableDepth / 2) },
  ]);
  const nearRowDepth = roundTo(rowAlloc.lengths.get("near") ?? usableDepth / 2, 0.5);
  const farRowDepth = roundTo(usableDepth - nearRowDepth, 0.5);

  const nearY = publicDepth;
  const hallwayY = publicDepth + nearRowDepth;
  const farY = hallwayY + HALLWAY_WIDTH;

  const nearLayout = layoutRow(nearRow.map(toAllocItem(nearRowDepth)), 0, nearY, width, nearRowDepth);
  const farLayout = layoutRow(farRow.map(toAllocItem(farRowDepth)), 0, farY, width, farRowDepth);

  const rects = new Map<string, Rect>([...nearLayout.rects, ...farLayout.rects]);
  const adjacency = [
    ...buildSequentialAdjacency(nearRow, ensuite, primary, "hallway"),
    ...buildSequentialAdjacency(farRow, ensuite, primary, "hallway"),
  ];

  return {
    rects,
    adjacency,
    hallwayRect: { x: 0, y: hallwayY, w: width, h: HALLWAY_WIDTH },
    feasible: rowAlloc.feasible && nearLayout.feasible && farLayout.feasible,
  };
}

/** Every bedroom gets a hallway door; the ensuite bath connects only to its own bedroom, never the hallway. */
function buildSequentialAdjacency(
  row: ProgramRoom[],
  ensuite: ProgramRoom | undefined,
  primary: ProgramRoom,
  hallwayId?: string,
): Array<{ a: string; b: string }> {
  const adjacency: Array<{ a: string; b: string }> = [];
  for (const item of row) {
    if (ensuite && item.id === ensuite.id) continue;
    if (hallwayId) adjacency.push({ a: item.id, b: hallwayId });
  }
  if (ensuite && row.includes(ensuite)) {
    adjacency.push({ a: primary.id, b: ensuite.id });
  }
  return adjacency;
}

function buildWallsAndDoors(
  rooms: Room[],
  mainDims: { width: number; depth: number },
  adjacency: Array<{ a: string; b: string }>,
): { walls: Wall[]; doors: Door[] } {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const walls: Wall[] = [];
  const doors: Door[] = [];
  let wallCounter = 0;
  let doorCounter = 0;

  function addWall(x1: number, y1: number, x2: number, y2: number, exterior: boolean) {
    if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) < 0.01) return;
    walls.push({ id: `wall_${wallCounter++}`, x1, y1, x2, y2, exterior });
  }

  const garage = rooms.find((r) => r.type === "garage");
  const interiorRooms = rooms.filter((r) => r.type !== "garage");
  const { width: mainWidth, depth: mainDepth } = mainDims;

  addWall(0, 0, mainWidth, 0, true); // front
  addWall(0, mainDepth, mainWidth, mainDepth, true); // back
  addWall(0, 0, 0, mainDepth, true); // left

  if (garage) {
    const sharedBottom = Math.min(garage.h, mainDepth);
    addWall(mainWidth, sharedBottom, mainWidth, mainDepth, true); // exterior sliver below the shared wall, if garage is shallower
    addWall(mainWidth, 0, mainWidth, sharedBottom, false); // shared wall with the garage
    addWall(garage.x, 0, garage.x + garage.w, 0, true);
    addWall(garage.x, garage.h, garage.x + garage.w, garage.h, true);
    addWall(garage.x + garage.w, 0, garage.x + garage.w, garage.h, true);
  } else {
    addWall(mainWidth, 0, mainWidth, mainDepth, true); // right
  }

  for (let i = 0; i < interiorRooms.length; i++) {
    for (let j = i + 1; j < interiorRooms.length; j++) {
      const overlap = sharedEdgeOverlap(interiorRooms[i], interiorRooms[j]);
      if (overlap && overlap.length >= 1) {
        if (overlap.orientation === "v") {
          addWall(overlap.x, overlap.y - overlap.length / 2, overlap.x, overlap.y + overlap.length / 2, false);
        } else {
          addWall(overlap.x - overlap.length / 2, overlap.y, overlap.x + overlap.length / 2, overlap.y, false);
        }
      }
    }
  }

  for (const { a, b } of adjacency) {
    const ra = byId.get(a);
    const rb = byId.get(b);
    if (!ra || !rb) continue;
    const overlap = sharedEdgeOverlap(ra, rb);
    if (!overlap) continue; // logical neighbors that didn't end up geometrically touching; never fake a door
    doors.push({
      id: `door_${doorCounter++}`,
      x: overlap.x,
      y: overlap.y,
      orientation: overlap.orientation,
      width: Math.min(DOOR_WIDTH, overlap.length * 0.8),
      connects: [a, b],
    });
  }

  return { walls, doors };
}

/** Room types where a long, shallow shape is a real bug, not a normal open-plan room. */
const ASPECT_CHECKED_TYPES = new Set(["primary_bedroom", "bedroom", "primary_bath", "bath", "half_bath", "closet"]);

/**
 * Open-plan great rooms/kitchens/entries are legitimately long and shallow in real houses —
 * only flag bedrooms/bathrooms, where a sliver-shaped room (e.g. 35' x 9') is never realistic
 * and would make a real architect bounce. Surfaced as the same kind of honest, computed
 * warning as `checkMinimums`, never silently shipped as if it were fine.
 */
function checkAspectRatios(rooms: Room[], warnings: string[]) {
  for (const room of rooms) {
    if (!ASPECT_CHECKED_TYPES.has(room.type)) continue;
    const long = Math.max(room.w, room.h);
    const short = Math.min(room.w, room.h);
    if (short > 0 && long / short > MAX_SANE_ROOM_ASPECT) {
      warnings.push(
        `${room.label} is an unrealistic shape for its area (${round1(room.w)}' × ${round1(room.h)}', ${round1(long / short)}:1) — increase total sqft or reduce room count so it can be laid out as a usable room.`,
      );
    }
  }
}

function checkMinimums(rooms: Room[], warnings: string[]) {
  for (const room of rooms) {
    if (room.type === "hallway") continue;
    const min = getMinArea(room.type);
    if (min > 0 && room.areaSqft < min * 0.9) {
      warnings.push(
        `${room.label} is ${round1(room.areaSqft)} sqft, below the comfortable minimum of ${min} sqft for this room type.`,
      );
    }
  }
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Real bug found and fixed while verifying the aspect-ratio fix above: rounding each room's
 * x/y/w/h to 0.1ft *independently* can shift two adjacent rooms' shared edge apart by up to
 * 0.1ft in opposite directions, producing a spurious ~1-2 sqft "rooms overlap" warning in the
 * Studio editor (`lib/layout/edit.ts`'s `checkOverlaps`, 0.5 sqft threshold) on a plan the user
 * never touched — confirmed via `npm run verify` on a real "4 bed 3 bath, 2200 sqft, garage,
 * office" brief. Every render/export surface already calls `.toFixed(1)` on `room.w`/`room.h`
 * for display (`lib/renderSvg.ts`, `components/FloorPlanSvg.tsx`, `FloorPlanStudio.tsx`,
 * `app/page.tsx`, `exportPdf.ts`, `exportDxf.ts`), so rounding the stored coordinates bought
 * nothing and only broke exactness. Keep full precision on x/y/w/h; only `areaSqft` (a derived,
 * already-rounded display number, not a coordinate two rooms must agree on) stays rounded.
 */
function roundRoom(r: Room): Room {
  return { ...r, areaSqft: round1(r.areaSqft) };
}

export interface FloorPlanOption {
  variant: LayoutVariant;
  plan: FloorPlan;
}

/**
 * Runs the real engine once per entry in LAYOUT_VARIANTS — real independent
 * layouts, not a single plan styled 3 ways. Each variant's aspect ratio is
 * the engine's own computed baseline for this exact program (see
 * computeBaselineAspectRatio) scaled by that variant's multiplier, so the
 * anti-"bowling-alley-bedroom" deep-footprint fix always applies.
 */
export function generateFloorPlanOptions(input: BriefInput): FloorPlanOption[] {
  const program = buildRoomProgram(input);
  const baseline = computeBaselineAspectRatio(program);
  return LAYOUT_VARIANTS.map((variant) => ({
    variant,
    plan: generateFloorPlan(input, baseline * variant.ratioMultiplier),
  }));
}
