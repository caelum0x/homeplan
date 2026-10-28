import type { BriefInput, Door, FloorPlan, Room, RoomType, Wall } from "./types";
import { buildRoomProgram, getMinArea, type ProgramRoom } from "./program";
import { allocateLengths, computeExteriorSegments, layoutColumn, layoutRow, sharedEdgeOverlap, type AllocItem, type Rect } from "./geometry";
import { autoPlaceFurniture } from "./furniture";
import { computeWindows } from "./windows";
import { computeDoorSwings } from "./doorSwings";

export const HALLWAY_WIDTH = 3.5;
export const DOOR_WIDTH = 3;
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
export const MAX_SANE_ROOM_ASPECT = 2.2;
/**
 * Real foyer depth target (feet), not a full-row-depth column. Found by
 * actually running the engine before this fix: every entry came out as a
 * 4ft-wide column spanning the *entire* public-zone depth (e.g. 4' x 27' for
 * a 6-bed estate) — a corridor shape, not a foyer, and never flagged because
 * "entry" was (correctly, for its *width* axis) exempted from the sliver
 * check. The real bug wasn't the aspect-ratio number, it was the
 * orientation: a foyer should be shallow *front-to-back* and span width, not
 * deep front-to-back and span almost no width. Fixed by giving the entry its
 * own shallow full-width strip at the front of the public zone instead of
 * forcing it into the same shared-depth column as every other public room.
 */
export const ENTRY_DEPTH_TARGET = 7;
export const MIN_ENTRY_DEPTH = 4;
/** Minimum depth left over after carving out a closet from a sliver room — below this, the split isn't worth doing and the honest aspect-ratio warning stays instead. */
const CLOSET_MIN_DEPTH = 3;
/** Room types where carving off a closet from a too-deep sliver is a real, common architectural pattern (primary suite + walk-in closet, bath + linen closet) rather than a cosmetic relabeling. */
const SLIVER_SPLITTABLE_TYPES = new Set<RoomType>(["primary_bedroom", "bedroom", "primary_bath", "bath", "half_bath"]);
/** Minimum width a courtyard-topology wing needs — enough for a real room, plus (for the secondary wing, when it has 2+ independent rooms) its own internal corridor. */
const COURTYARD_MIN_WING_WIDTH = 13;
/** Minimum real open width/depth for the courtyard void itself — below this it's a leftover gap, not a usable outdoor room. */
const COURTYARD_MIN_VOID = 8;
/** Shallow full-width strip at the front of the private zone connecting both wings — doubles as the hallway the public zone's door anchors to. */
const COURTYARD_CONNECTOR_DEPTH = 4.5;
/**
 * Real L-shaped massing: when `input.lShaped` is set, the private (bedroom) zone is laid
 * out narrower than the public zone above it, flush on the left and stepped in on the
 * right — a genuine, common single-story pattern (the bedroom wing recesses from the
 * main living/garage block, picking up extra daylight on the recessed side instead of
 * just being a flat-front box). The setback is a fraction of the footprint width, clamped
 * to a sane real range so it reads as a deliberate architectural step, not a sliver.
 */
const L_SHAPE_SETBACK_FRACTION = 0.22;
const L_SHAPE_SETBACK_MIN = 8;
const L_SHAPE_SETBACK_MAX = 14;

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
  { id: "compact", label: "Compact", description: "Closer to square — shorter exterior walls, tighter hallway.", ratioMultiplier: 0.85 },
  { id: "classic", label: "Classic", description: "The engine's own balanced default proportion for this program.", ratioMultiplier: 1.0 },
  { id: "wide", label: "Wide", description: "A broad street-facing front, shallower depth — ranch-style massing.", ratioMultiplier: 1.25 },
];

/** Absolute floor/ceiling on the footprint ratio regardless of baseline*multiplier — keeps even a "Compact" variant on an already-deep (3+ bedroom) baseline from overshooting into unusably narrow side rooms. */
export const MIN_ASPECT_RATIO = 0.7;
export const MAX_ASPECT_RATIO = 2.0;

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
export function computeBaselineAspectRatio(program: ReturnType<typeof buildRoomProgram>): number {
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
  const requestedAspectRatio = aspectRatio ?? computeBaselineAspectRatio(program);
  const resolvedAspectRatio = Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, requestedAspectRatio));
  const width = roundTo(Math.sqrt(interiorArea * resolvedAspectRatio), 0.5);
  const depth = roundTo(interiorArea / width, 0.5);

  const lShaped = !!input.lShaped;
  const lShapeSetback = Math.min(L_SHAPE_SETBACK_MAX, Math.max(L_SHAPE_SETBACK_MIN, width * L_SHAPE_SETBACK_FRACTION));
  // The private zone's own available width — full `width` normally, stepped in on the
  // right when lShaped is set. Every private-zone topology below already takes "width"
  // as a plain parameter for both layout AND topology selection, so handing it a smaller
  // value here is the entire L-shape implementation: `computeExteriorSegments` (called
  // from buildWallsAndDoors) picks up the resulting gap automatically, with no
  // "is this plan L-shaped" branching anywhere in the wall/window/export/3D code.
  const privateWidth = lShaped ? roundTo(width - lShapeSetback, 0.5) : width;

  const publicProgramRooms = [program.entry, ...program.publicRooms];
  const otherPublicRooms = program.publicRooms; // everything but the entry — the entry gets its own shallow strip below, not a shared-depth column
  const privateProgramRooms = [...program.bedrooms, ...program.privateBaths];

  const publicIdeal = sumIdeal(publicProgramRooms);
  const privateIdeal = sumIdeal(privateProgramRooms) + estimateHallwayIdeal(privateProgramRooms.length, privateWidth);
  const publicDepth = roundTo(depth * (publicIdeal / (publicIdeal + privateIdeal || 1)), 0.5);
  const privateDepth = depth - publicDepth;

  const rooms: Room[] = [];
  const adjacency: Array<{ a: string; b: string }> = [];

  // ---- Public zone: a shallow, full-width entry strip at the very front — a real
  // foyer shape, not a thin column spanning the entire public-zone depth (see
  // ENTRY_DEPTH_TARGET's comment for the real bug this replaced) — then the rest of
  // the public rooms in a row behind it, left to right in the order you'd walk through.
  const desiredEntryDepth = Math.min(ENTRY_DEPTH_TARGET, Math.max(MIN_ENTRY_DEPTH, publicDepth * 0.4));
  const entryDepth = Math.min(roundTo(desiredEntryDepth, 0.5), Math.max(MIN_ENTRY_DEPTH, publicDepth - MIN_ENTRY_DEPTH));
  const restDepth = publicDepth - entryDepth;

  rooms.push(toRoom(program.entry, { x: 0, y: 0, w: width, h: entryDepth }));

  const publicRow = layoutRow(otherPublicRooms.map(toAllocItem(restDepth)), 0, entryDepth, width, restDepth);
  if (!publicRow.feasible) {
    warnings.push(
      "The public rooms (living, kitchen, dining, office) don't comfortably fit this square footage. Sizes below are scaled down from a realistic minimum — increase total sqft or drop a room.",
    );
  }
  // Same sliver-splitting fix as the private zone's bedrooms/bathrooms — a half
  // bath (powder room) sharing a deep public row with a great room/kitchen hits the
  // exact same "forced to the full row depth" problem.
  const publicSplit = splitSliverRooms(otherPublicRooms, publicRow.rects, restDepth, "front");
  for (let i = 0; i < otherPublicRooms.length; i++) {
    const p = otherPublicRooms[i];
    rooms.push(toRoom(p, publicSplit.rects.get(p.id)!));
    if (i > 0) adjacency.push({ a: otherPublicRooms[i - 1].id, b: p.id });
  }
  for (const p of publicSplit.extraRooms) {
    rooms.push(toRoom(p, publicSplit.rects.get(p.id)!));
  }
  adjacency.push(...publicSplit.extraAdjacency);
  const lastPublicRoom = otherPublicRooms[otherPublicRooms.length - 1] ?? program.entry;
  if (otherPublicRooms.length > 0) {
    adjacency.push({ a: program.entry.id, b: otherPublicRooms[0].id });
  }

  // ---- Private zone: bedrooms + bathrooms, in one or two rows around a hallway.
  const privateZone = layoutPrivateZone(privateProgramRooms, privateWidth, publicDepth, privateDepth, !!program.garage, input.openPlan, lShaped);
  for (const p of [...privateProgramRooms, ...privateZone.extraRooms]) {
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
  if (privateZone.hallwayWingBRect) {
    rooms.push({
      id: "hallway_wingB",
      type: "hallway",
      label: "Hallway",
      ...privateZone.hallwayWingBRect,
      areaSqft: round1(privateZone.hallwayWingBRect.w * privateZone.hallwayWingBRect.h),
    });
  }
  if (privateZone.courtyardRect) {
    rooms.push({
      id: "courtyard",
      type: "courtyard",
      label: "Courtyard",
      ...privateZone.courtyardRect,
      areaSqft: round1(privateZone.courtyardRect.w * privateZone.courtyardRect.h),
    });
  }
  const publicToPrivateAnchor = privateZone.hallwayRect ? "hallway" : privateProgramRooms[0]?.id;
  if (publicToPrivateAnchor) {
    // Pick whichever already-placed public-zone room actually shares an edge with the
    // private-zone anchor, instead of always `lastPublicRoom`. That default is correct
    // whenever the anchor spans the full house width (the "single"/"double-row"
    // topologies' hallways both do), since every public room touches a full-width
    // hallway — but the side-hallway topology's corridor only spans one side of the
    // house (x = 0..HALLWAY_WIDTH), so only whichever public room actually ends up
    // above it (not necessarily the last one in the row) really touches it. Found by
    // tracing the exact geometry while adding that topology, not by testing after the
    // fact — the same "never fake a door" discipline as the garage-access fix above.
    const anchorRect = publicToPrivateAnchor === "hallway" ? privateZone.hallwayRect! : privateZone.rects.get(publicToPrivateAnchor);
    const touchingPublicRoom = [program.entry, ...otherPublicRooms]
      .map((p) => rooms.find((r) => r.id === p.id))
      .find((rect): rect is Room => !!rect && !!anchorRect && !!sharedEdgeOverlap(rect, anchorRect));
    adjacency.push({ a: (touchingPublicRoom ?? lastPublicRoom).id, b: publicToPrivateAnchor });
  }

  // ---- Garage: attached as its own block beside the main footprint, with a real
  // interior door into whichever public room actually ends up against its shared
  // wall (never the entry — the entry sits at the *front* of the house, the garage
  // beside the *side*, so they never share an edge; the previous version declared
  // an entry<->garage adjacency that never once produced a real door in testing,
  // leaving every generated garage completely sealed off with no interior access
  // at all — found by actually generating examples and reading the door list, not
  // assumed from the code).
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
    adjacency.push({ a: lastPublicRoom.id, b: program.garage.id });
  }

  const { walls, doors } = buildWallsAndDoors(rooms, adjacency);

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
  checkGarageAccess(rooms, doors, warnings);

  const totalAreaSqft = round1(rooms.reduce((s, r) => s + r.areaSqft, 0));
  const roundedRooms = rooms.map(roundRoom);
  const furniture = autoPlaceFurniture(roundedRooms);
  const { doors: doorsWithSwing, warnings: swingWarnings } = computeDoorSwings(roundedRooms, doors, furniture);
  warnings.push(...swingWarnings);

  return {
    footprint: { w: round1(totalWidth), h: round1(depth) },
    totalAreaSqft,
    rooms: roundedRooms,
    walls,
    doors: doorsWithSwing,
    warnings,
    furniture,
    windows: computeWindows(roundedRooms, walls, doorsWithSwing),
  };
}

// ---------------------------------------------------------------------------

export function sumIdeal(items: ProgramRoom[]): number {
  return items.reduce((s, i) => s + i.idealArea, 0);
}

/** Only used to proportion public-zone depth vs. private-zone depth before any room is placed. */
function estimateHallwayIdeal(privateRoomCount: number, width: number): number {
  if (privateRoomCount <= 1) return 0;
  return HALLWAY_WIDTH * width * (privateRoomCount >= 3 ? 0.5 : 0.25);
}

export function toAllocItem(depth: number) {
  return (p: ProgramRoom): AllocItem => ({
    id: p.id,
    ideal: depth > 0 ? p.idealArea / depth : p.idealArea,
    min: p.minWidth,
  });
}

/**
 * Minimum depth a near/far private-zone row needs so its widest item doesn't
 * come out a sliver once `layoutRow`/`allocateLengths` hands that row's width
 * out proportional to raw `idealArea` (see `toAllocItem` — depth cancels out
 * of the ratio *between* a row's items, so width share is driven purely by
 * each item's share of the row's total ideal area, independent of depth).
 *
 * Without this, `rowAlloc`'s depth split (below) is decoupled from the width
 * a row is about to receive: a row dominated by one big item (e.g. primary
 * bedroom + ensuite, where primary is ~180/250 of the row's ideal area) gets
 * ~72% of the footprint width no matter how deep the row is, and depth grows
 * at the same rate as width as footprint scales up — so the ratio stays
 * pinned instead of improving with sqft (the real bug: width:depth ratio is
 * scale-invariant, not just "too small"). Flooring the row's `min` depth at
 * `dominantItemWidthShare / MAX_SANE_ROOM_ASPECT` makes the two axes agree.
 */
export function minSaneDepthForRow(row: ProgramRoom[], width: number): number {
  if (row.length === 0) return 0;
  const rowIdeal = row.reduce((s, i) => s + i.idealArea, 0);
  if (rowIdeal <= 0) return 0;
  const dominant = row.reduce((max, i) => (i.idealArea > max.idealArea ? i : max), row[0]);
  const dominantWidthShare = (dominant.idealArea / rowIdeal) * width;
  // Round UP to the same 0.5ft grid the final row depth gets rounded to
  // (see `roundTo(nearRowDepth/farRowDepth, 0.5)` below) — rounding the
  // requirement itself down here would let the real depth land just under
  // the sane threshold after that later rounding.
  return Math.ceil((dominantWidthShare / MAX_SANE_ROOM_ASPECT) * 2) / 2;
}

export function toRoom(p: ProgramRoom, rect: Rect): Room {
  return { id: p.id, type: p.type, label: p.label, x: rect.x, y: rect.y, w: rect.w, h: rect.h, areaSqft: round1(rect.w * rect.h) };
}

export interface PrivateZoneResult {
  rects: Map<string, Rect>;
  adjacency: Array<{ a: string; b: string }>;
  hallwayRect: Rect | null;
  /** Real open void between the courtyard topology's two wings — null for every other topology. Caller adds it to the final room list as a type "courtyard" Room, same as hallwayRect becomes a type "hallway" Room. */
  courtyardRect: Rect | null;
  /** Courtyard topology's secondary wing sometimes needs its own short internal corridor (see layoutPrivateZoneCourtyard) — null whenever that wing has 0-1 rooms, or for every other topology. Caller adds it as a second type "hallway" Room with a distinct id. */
  hallwayWingBRect: Rect | null;
  feasible: boolean;
  /** Real new rooms (closets) carved out of a sliver bedroom/bath by splitSliverRooms — caller must add these to the final room list the same as any other ProgramRoom. */
  extraRooms: ProgramRoom[];
}

export function layoutPrivateZone(
  items: ProgramRoom[],
  width: number,
  publicDepth: number,
  privateDepth: number,
  hasGarage: boolean,
  openPlan: boolean,
  /** Real L-shaped massing (see L_SHAPE_SETBACK_* above) — the caller already passed a
   * narrower `width` for this; this flag only steers topology SELECTION, keeping the
   * courtyard topology (which wants to own the full width itself for its two wings +
   * void) off the table so its own geometry stays simple and well-tested, v1 scope. */
  lShaped = false,
): PrivateZoneResult {
  if (items.length === 0) {
    return { rects: new Map(), adjacency: [], hallwayRect: null, courtyardRect: null, hallwayWingBRect: null, feasible: true, extraRooms: [] };
  }

  const primary = items.find((i) => i.type === "primary_bedroom")!;
  const ensuite = items.find((i) => i.pairWith === primary.id);
  const others = items.filter((i) => i !== primary && i !== ensuite);
  const sharedBaths = others.filter((i) => i.type === "bath");
  const secondaryBedrooms = others.filter((i) => i.type !== "bath");
  const ordered = [primary, ...(ensuite ? [ensuite] : []), ...secondaryBedrooms, ...sharedBaths];

  const topology = pickPrivateTopology(ordered.length, width, privateDepth, hasGarage, openPlan, lShaped);

  if (topology === "courtyard") {
    return layoutPrivateZoneCourtyard(ordered, primary, ensuite, width, publicDepth, privateDepth);
  }

  if (topology === "side-hallway") {
    return layoutPrivateZoneSideHallway(ordered, primary, ensuite, width, publicDepth, privateDepth);
  }

  if (topology === "single") {
    const hallwayDepth = items.length > 1 ? Math.min(HALLWAY_WIDTH, privateDepth * 0.25) : 0;
    const rowDepth = privateDepth - hallwayDepth;
    const row = layoutRow(ordered.map(toAllocItem(rowDepth)), 0, publicDepth + hallwayDepth, width, rowDepth);
    const split = splitSliverRooms(ordered, row.rects, rowDepth, "front");
    const hallwayId = hallwayDepth > 0 ? "hallway" : undefined;
    const adjacency = [...buildSequentialAdjacency(ordered, ensuite, primary, hallwayId), ...split.extraAdjacency];
    const hallwayRect = hallwayDepth > 0 ? { x: 0, y: publicDepth, w: width, h: hallwayDepth } : null;
    return { rects: split.rects, adjacency, hallwayRect, courtyardRect: null, hallwayWingBRect: null, feasible: row.feasible, extraRooms: split.extraRooms };
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
    { id: "near", ideal: nearIdeal || 1, min: Math.max(Math.min(8, usableDepth / 2), minSaneDepthForRow(nearRow, width)) },
    { id: "far", ideal: farIdeal || 1, min: Math.max(Math.min(8, usableDepth / 2), minSaneDepthForRow(farRow, width)) },
  ]);
  const nearRowDepth = roundTo(rowAlloc.lengths.get("near") ?? usableDepth / 2, 0.5);
  const farRowDepth = roundTo(usableDepth - nearRowDepth, 0.5);

  const nearY = publicDepth;
  const hallwayY = publicDepth + nearRowDepth;
  const farY = hallwayY + HALLWAY_WIDTH;

  const nearLayout = layoutRow(nearRow.map(toAllocItem(nearRowDepth)), 0, nearY, width, nearRowDepth);
  const farLayout = layoutRow(farRow.map(toAllocItem(farRowDepth)), 0, farY, width, farRowDepth);

  // Near row's hallway-adjacent edge is its *back* (hallway starts right after it);
  // far row's hallway-adjacent edge is its *front* (hallway ends right before it) —
  // this directional bookkeeping is what lets splitSliverRooms anchor each carved
  // bath/closet toward the hallway side instead of toward the exterior wall.
  const nearSplit = splitSliverRooms(nearRow, nearLayout.rects, nearRowDepth, "back");
  const farSplit = splitSliverRooms(farRow, farLayout.rects, farRowDepth, "front");

  const rects = new Map<string, Rect>([...nearSplit.rects, ...farSplit.rects]);
  const adjacency = [
    ...buildSequentialAdjacency(nearRow, ensuite, primary, "hallway"),
    ...buildSequentialAdjacency(farRow, ensuite, primary, "hallway"),
    ...nearSplit.extraAdjacency,
    ...farSplit.extraAdjacency,
  ];

  return {
    rects,
    adjacency,
    hallwayRect: { x: 0, y: hallwayY, w: width, h: HALLWAY_WIDTH },
    courtyardRect: null,
    hallwayWingBRect: null,
    feasible: rowAlloc.feasible && nearLayout.feasible && farLayout.feasible,
    extraRooms: [...nearSplit.extraRooms, ...farSplit.extraRooms],
  };
}

/**
 * Picks which of the private zone's genuinely distinct topologies to use, based
 * on the room program's own shape (private room count, available width/depth) —
 * not one fixed skeleton stretched for every brief. This is the real fix for the
 * 2026-10-27 flagship audit's deepest finding (`plans/homeplan.md`): every plan,
 * regardless of brief, used the same topology at different proportions. Three
 * genuinely different shapes, each with its own room adjacency/aspect/door
 * pattern:
 * - "single": one row behind a shallow end-of-row hallway (1-2 private rooms —
 *   a hallway doesn't earn its square footage for just a primary suite).
 * - "side-hallway": a single-loaded corridor — one column of rooms stacked
 *   front-to-back off a vertical hallway running the full private depth. The
 *   common real case for a 3-4 room private program; see `layoutPrivateZoneSideHallway`.
 * - "double-row": the original center-hallway, two rows either side of a
 *   horizontal hallway — reserved for larger (5+) private programs, where a
 *   single column would stack too many rooms too shallow, and only when
 *   there's enough depth for a second row.
 * - "courtyard": a real U-shape — two side wings flanking an open void,
 *   connected by a shallow front strip (see layoutPrivateZoneCourtyard).
 *   Selected by the program's actual SHAPE, not just room count (the
 *   2026-10-27 flagship audit's other unaddressed scoping note): a garage-
 *   screened private courtyard is a traditional, non-open-plan pattern — the
 *   garage (its own block, see generateFloorPlan) shields one side of the lot
 *   from the street/driveway while bedrooms wrap a private outdoor space on
 *   the rest. An open-plan program's public zone is already optimized for
 *   direct, linear circulation (great room flowing straight into the rest of
 *   the house), which doesn't pair naturally with a wing-and-void private
 *   zone — those programs stay on side-hallway/double-row instead.
 */
function pickPrivateTopology(
  count: number,
  width: number,
  privateDepth: number,
  hasGarage: boolean,
  openPlan: boolean,
  lShaped: boolean,
): "single" | "side-hallway" | "double-row" | "courtyard" {
  if (count <= 2) return "single";

  const courtyardWidthOk = width - 2 * COURTYARD_MIN_WING_WIDTH >= COURTYARD_MIN_VOID;
  const courtyardDepthOk = privateDepth - COURTYARD_CONNECTOR_DEPTH >= COURTYARD_MIN_VOID;
  // The courtyard topology wants the full private-zone width for its own two wings + void —
  // an L-shaped plan has already spent part of that width on the massing setback, so it
  // stays off the table here rather than compounding two different "notch" ideas in one plan.
  if (!lShaped && hasGarage && !openPlan && count >= 3 && courtyardWidthOk && courtyardDepthOk) {
    return "courtyard";
  }

  const sideHallwayWidthOk = width - HALLWAY_WIDTH >= 9;
  if (count <= 4 && sideHallwayWidthOk) return "side-hallway";
  if (privateDepth >= HALLWAY_WIDTH + 16) return "double-row";
  return sideHallwayWidthOk ? "side-hallway" : "single";
}

/**
 * Side-hallway private zone — a single-loaded corridor running the full private-zone
 * depth along one side of the house (`x = 0`), with every bedroom/bath opening
 * directly off it from a single column stacked front-to-back, instead of side by
 * side in a row. Real, different geometry from the center-hallway "double-row"
 * topology below: different room proportions (depth varies per room instead of
 * width), different adjacency order (every room touches the hallway directly,
 * there's no near/far split), different door placement. The primary suite anchors
 * the far end of the column (deepest from the public zone — the quiet end, same
 * intent as the double-row topology's "far row").
 *
 * Implemented by laying items out in a column (shared width, varying depth) via
 * `layoutColumn`, then reusing `splitSliverRooms` — which assumes a shared *depth*
 * with the varying axis as width — through a 90-degree transpose (swap x<->y,
 * w<->h on every rect). That carve logic only ever compares a rect's long side to
 * its short side and carves the shared axis down to a saner target, so it is
 * orientation-agnostic; transposing in and back out is exact, not an approximation.
 */
function layoutPrivateZoneSideHallway(
  ordered: ProgramRoom[],
  primary: ProgramRoom,
  ensuite: ProgramRoom | undefined,
  width: number,
  publicDepth: number,
  privateDepth: number,
): PrivateZoneResult {
  // `ordered` is [primary, ensuite?, secondaryBedrooms..., sharedBaths...]; reversed
  // puts primary last — the far/quiet end of the column — without recomputing the
  // grouping the caller already did.
  const columnOrder = [...ordered].reverse();

  const columnWidth = width - HALLWAY_WIDTH;
  const columnItems: AllocItem[] = columnOrder.map((p) => ({
    id: p.id,
    ideal: columnWidth > 0 ? p.idealArea / columnWidth : p.idealArea,
    // `minWidth` is literally "minimum width" for this room type (program.ts), reused
    // here as the minimum *depth* along the corridor — an approximation (a room's
    // minimum usable width and minimum usable depth are close enough for this
    // heuristic engine), the same honesty level as every other min/ideal shortcut
    // already in this file.
    min: p.minWidth,
  }));
  const column = layoutColumn(columnItems, HALLWAY_WIDTH, publicDepth, privateDepth, columnWidth);

  const transposed = transposeRects(column.rects);
  const split = splitSliverRooms(columnOrder, transposed, columnWidth, "front");
  const rects = transposeRects(split.rects);

  const adjacency: Array<{ a: string; b: string }> = [];
  for (const item of columnOrder) {
    if (ensuite && item.id === ensuite.id) continue; // the ensuite connects to its bedroom, not the hallway
    adjacency.push({ a: item.id, b: "hallway" });
  }
  if (ensuite) adjacency.push({ a: primary.id, b: ensuite.id });
  adjacency.push(...split.extraAdjacency);

  return {
    rects,
    adjacency,
    hallwayRect: { x: 0, y: publicDepth, w: HALLWAY_WIDTH, h: privateDepth },
    courtyardRect: null,
    hallwayWingBRect: null,
    feasible: column.feasible,
    extraRooms: split.extraRooms,
  };
}

/**
 * Courtyard / U-shape private zone — genuinely different geometry from every
 * other topology above: two side wings flanking a real open void instead of
 * rooms arranged along one hallway. Shape:
 *
 *   [public zone]
 *   [--- connector (hallway) spans full width ---]
 *   [wing A  ][        courtyard (void)        ][  wing B  ]
 *   [primary ][                                ][ bedroom 2]
 *   [ ensuite][                                ][ hallway_B][bedroom 3]
 *   [        ][                                ][  (if 2+ items in wing B)]
 *
 * Wing A holds the primary suite (the quiet wing, away from the garage the
 * caller attaches to the house's right side in generateFloorPlan) and is
 * never more than 2 items (primary + its ensuite), so it chains directly:
 * primary sits frontmost (real connector access), the ensuite sits behind it
 * (reached only via the primary bedroom, the real and only sane ensuite
 * pattern — never the reverse). Wing B holds everything else. When wing B
 * has 2+ *independent* rooms, stacking them in a bare column would only give
 * the frontmost one real connector access — every other room in that column
 * wouldn't touch any hallway at all and would come out sealed, the exact
 * "never fake a door, never silently ship a sealed room" failure this
 * codebase already fixed once for the garage. So wing B gets its own short
 * internal corridor (`hallway_wingB`) along its courtyard-facing inner edge
 * when it needs one — rooms sit on the true-exterior outer edge (real
 * windows to the outside), the corridor runs the wing's full depth so every
 * room touches it directly, and it connects back to the main connector at
 * the front, same as the side-hallway topology's corridor does for the
 * whole private zone.
 *
 * The void itself becomes a real `courtyardRect`, pushed into the room list
 * by the caller as a type "courtyard" Room — buildWallsAndDoors below treats
 * every wall bordering it as exterior, so wing rooms that face the courtyard
 * get real windows onto it, the same as a room facing the street.
 */
function layoutPrivateZoneCourtyard(
  ordered: ProgramRoom[],
  primary: ProgramRoom,
  ensuite: ProgramRoom | undefined,
  width: number,
  publicDepth: number,
  privateDepth: number,
): PrivateZoneResult {
  const wingA: ProgramRoom[] = [primary, ...(ensuite ? [ensuite] : [])];
  const wingB: ProgramRoom[] = ordered.filter((i) => i !== primary && i !== ensuite);

  const wingAIdeal = wingA.reduce((s, i) => s + i.idealArea, 0);
  const wingBIdeal = wingB.reduce((s, i) => s + i.idealArea, 0);
  // Reserve a real courtyard width BEFORE splitting the wings. allocateLengths always
  // fills its *entire* total across the items handed to it — folding the void in as a
  // plain third item would make its size compete against the wings' ideal room areas
  // for no good reason (an early version of this function did exactly that and the
  // courtyard collapsed to 0 every time, confirmed via `npm run verify` on a real
  // 4-bed/garage brief before this fix). A courtyard's size should scale with leftover
  // footprint width instead, bounded to a sane real range.
  const targetCourtyardWidth = roundTo(Math.min(Math.max(width * 0.25, COURTYARD_MIN_VOID), 22), 0.5);
  const wingsTotalWidth = width - targetCourtyardWidth;
  const widthAlloc = allocateLengths(wingsTotalWidth, [
    { id: "wingA", ideal: wingAIdeal || 1, min: COURTYARD_MIN_WING_WIDTH },
    { id: "wingB", ideal: wingBIdeal || 1, min: COURTYARD_MIN_WING_WIDTH },
  ]);
  const wingAWidth = roundTo(widthAlloc.lengths.get("wingA") ?? wingsTotalWidth / 2, 0.5);
  const wingBWidth = roundTo(wingsTotalWidth - wingAWidth, 0.5);

  const connectorDepth = Math.min(COURTYARD_CONNECTOR_DEPTH, privateDepth * 0.3);
  const wingDepth = privateDepth - connectorDepth;
  const wingY = publicDepth + connectorDepth;

  // Wing A: primary frontmost (real connector access), ensuite behind it —
  // NOT reversed like the side-hallway topology's column, because that
  // topology's hallway runs the column's full depth (every position touches
  // it), while this connector is only a short strip at the front: whichever
  // item is frontmost is the only one that actually gets a real hallway
  // door, so it has to be the bedroom, never the bathroom.
  const wingAItems: AllocItem[] = wingA.map((p) => ({
    id: p.id,
    ideal: wingDepth > 0 ? p.idealArea / wingDepth : p.idealArea,
    min: p.minWidth,
  }));
  const wingALayout = layoutColumn(wingAItems, 0, wingY, wingDepth, wingAWidth);
  const wingASplit = splitSliverRooms(wingA, transposeRects(wingALayout.rects), wingAWidth, "front");
  const wingARects = transposeRects(wingASplit.rects);

  const adjacency: Array<{ a: string; b: string }> = [];
  adjacency.push({ a: primary.id, b: "hallway" });
  if (ensuite) adjacency.push({ a: primary.id, b: ensuite.id });
  adjacency.push(...wingASplit.extraAdjacency);

  let wingBRects = new Map<string, Rect>();
  let wingBFeasible = true;
  let wingBExtraRooms: ProgramRoom[] = [];
  let hallwayWingBRect: Rect | null = null;

  if (wingB.length === 1) {
    // Same reasoning as wing A with one item: frontmost = the whole wing, real connector access, no internal corridor needed.
    const only = wingB[0];
    const rect: Rect = { x: width - wingBWidth, y: wingY, w: wingBWidth, h: wingDepth };
    wingBRects.set(only.id, rect);
    adjacency.push({ a: only.id, b: "hallway" });
  } else if (wingB.length >= 2) {
    // 2+ independent rooms need their own corridor — placed on the inner
    // (courtyard-facing) edge so rooms occupy the true-exterior outer edge.
    const roomsWidth = wingBWidth - HALLWAY_WIDTH;
    const roomsX = width - wingBWidth + HALLWAY_WIDTH;
    const wingBItems: AllocItem[] = wingB.map((p) => ({
      id: p.id,
      ideal: wingDepth > 0 ? p.idealArea / wingDepth : p.idealArea,
      min: p.minWidth,
    }));
    const wingBLayout = layoutColumn(wingBItems, roomsX, wingY, wingDepth, roomsWidth);
    const wingBSplit = splitSliverRooms(wingB, transposeRects(wingBLayout.rects), roomsWidth, "front");
    wingBRects = transposeRects(wingBSplit.rects);
    wingBFeasible = wingBLayout.feasible;
    wingBExtraRooms = wingBSplit.extraRooms;
    hallwayWingBRect = { x: width - wingBWidth, y: wingY, w: HALLWAY_WIDTH, h: wingDepth };

    adjacency.push({ a: "hallway_wingB", b: "hallway" });
    for (const item of wingB) adjacency.push({ a: item.id, b: "hallway_wingB" });
    adjacency.push(...wingBSplit.extraAdjacency);
  }

  const rects = new Map<string, Rect>([...wingARects, ...wingBRects]);

  const courtyardWidth = roundTo(width - wingAWidth - wingBWidth, 0.5);
  const courtyardRect: Rect | null =
    courtyardWidth > 0.5 && wingDepth > 0.5 ? { x: wingAWidth, y: wingY, w: courtyardWidth, h: wingDepth } : null;

  return {
    rects,
    adjacency,
    hallwayRect: { x: 0, y: publicDepth, w: width, h: connectorDepth },
    courtyardRect,
    hallwayWingBRect,
    feasible: widthAlloc.feasible && wingALayout.feasible && wingBFeasible,
    extraRooms: [...wingASplit.extraRooms, ...wingBExtraRooms],
  };
}

function transposeRect(r: Rect): Rect {
  return { x: r.y, y: r.x, w: r.h, h: r.w };
}

function transposeRects(rects: Map<string, Rect>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const [id, r] of rects) out.set(id, transposeRect(r));
  return out;
}

interface SliverSplitResult {
  rects: Map<string, Rect>;
  extraRooms: ProgramRoom[];
  extraAdjacency: Array<{ a: string; b: string }>;
}

/**
 * Real structural fix for the recurring "sliver bedroom/bathroom" bug found by
 * actually generating examples: every bedroom/bath forced to share a row's full
 * depth comes out as a thin column whenever its ideal area is much smaller than
 * its row-mates' (a 45 sqft bathroom sharing a 24ft-deep row with bedrooms
 * inevitably becomes ~5' x 24', a 4.8:1 sliver). The old fix only *warned* about
 * this. This one actually carves the room into two real rooms that together fill
 * the same footprint: the main room at a sane, shallower depth anchored toward
 * the hallway (quick access), and the leftover strip as a genuine small closet
 * for the same room — primary suite bath + walk-in closet, or bedroom + closet,
 * is a real, common floor-plan pattern, not a cosmetic relabeling of wasted
 * space. Only applied when it actually improves the shape (see the aspect-ratio
 * guard below) — otherwise the honest "unrealistic shape" warning stays, rather
 * than silently shipping a worse split.
 */
export function splitSliverRooms(
  items: ProgramRoom[],
  rects: Map<string, Rect>,
  rowDepth: number,
  hallwaySide: "front" | "back",
): SliverSplitResult {
  const nextRects = new Map(rects);
  const extraRooms: ProgramRoom[] = [];
  const extraAdjacency: Array<{ a: string; b: string }> = [];

  for (const item of items) {
    if (!SLIVER_SPLITTABLE_TYPES.has(item.type)) continue;
    const rect = nextRects.get(item.id);
    if (!rect) continue;

    const originalLong = Math.max(rect.w, rect.h);
    const originalShort = Math.min(rect.w, rect.h);
    if (originalShort <= 0 || originalLong / originalShort <= MAX_SANE_ROOM_ASPECT) continue; // not a sliver, leave it alone

    // Every row item spans the row's full depth today, so rect.h === rowDepth and
    // rect.w is the (too-narrow) width — the only axis worth carving is depth.
    const targetDepth = Math.min(rowDepth - CLOSET_MIN_DEPTH, roundTo(Math.sqrt(item.idealArea * 1.3), 0.5));
    const closetDepth = roundTo(rowDepth - targetDepth, 0.5);
    if (targetDepth < item.minWidth || closetDepth < CLOSET_MIN_DEPTH) continue; // not enough depth to split cleanly — keep the honest warning instead

    const mainAspect = Math.max(rect.w, targetDepth) / Math.min(rect.w, targetDepth);
    if (mainAspect >= originalLong / originalShort) continue; // the split wouldn't actually improve the shape — don't bother

    const mainY = hallwaySide === "front" ? rect.y : rect.y + closetDepth;
    const closetY = hallwaySide === "front" ? rect.y + targetDepth : rect.y;

    nextRects.set(item.id, { x: rect.x, y: mainY, w: rect.w, h: targetDepth });
    const closetId = `${item.id}_closet`;
    nextRects.set(closetId, { x: rect.x, y: closetY, w: rect.w, h: closetDepth });
    extraRooms.push({
      id: closetId,
      type: "closet",
      // A short, generic label on purpose: these closets are narrow by construction
      // (the leftover strip of a too-deep room), and sit directly next to their own
      // room on the plan, so "Bathroom 1 Closet" both overflows a 5-6ft-wide room's
      // label text (found by actually rendering a real example and looking at it —
      // the room-renderer's clipPath truncated it into unreadable mid-word garbage)
      // and is redundant with the adjacent room it's already attached to.
      label: "Closet",
      idealArea: rect.w * closetDepth,
      minArea: getMinArea("closet"),
      minWidth: 3,
      zone: item.zone,
    });
    extraAdjacency.push({ a: item.id, b: closetId });
  }

  return { rects: nextRects, extraRooms, extraAdjacency };
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

/**
 * Builds every wall (interior + exterior) and every logically-declared door from the
 * rooms' real placed geometry. Two independent passes: interior walls come from the
 * generic pairwise shared-edge loop below (any two rooms that actually touch, garage
 * included — no more special-casing the garage's shared wall separately); the exterior
 * perimeter comes from `computeExteriorSegments` (lib/layout/geometry.ts), which derives
 * it purely from the real room rectangles instead of a hardcoded main-rectangle shape.
 * That's what lets a footprint come out genuinely L/T-shaped (a narrower private wing, a
 * shallower garage, a courtyard void) with no "which shape is this" branching here.
 */
export function buildWallsAndDoors(
  rooms: Room[],
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

  for (const seg of computeExteriorSegments(rooms)) {
    addWall(seg.x1, seg.y1, seg.x2, seg.y2, true);
  }

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i];
      const roomB = rooms[j];
      const overlap = sharedEdgeOverlap(roomA, roomB);
      if (overlap && overlap.length >= 1) {
        // A courtyard is a real open void, not an interior room — a wall facing it
        // looks out onto the outdoors exactly like a wall facing the street, so it
        // gets the same real-window treatment (computeWindows only ever considers
        // `exterior` walls). This is the one piece of the courtyard topology that
        // can't be built by reusing the row/column layout primitives alone.
        const facesCourtyard = roomA.type === "courtyard" || roomB.type === "courtyard";
        if (overlap.orientation === "v") {
          addWall(overlap.x, overlap.y - overlap.length / 2, overlap.x, overlap.y + overlap.length / 2, facesCourtyard);
        } else {
          addWall(overlap.x - overlap.length / 2, overlap.y, overlap.x + overlap.length / 2, overlap.y, facesCourtyard);
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

/**
 * Room types where a long, shallow shape is a real bug, not a normal open-plan room.
 * Closets are deliberately exempt: a long, narrow walk-in/reach-in closet (e.g. the
 * leftover strip splitSliverRooms carves off a too-deep bath/bedroom) is a real,
 * normal closet shape — unlike a bathroom or bedroom, a closet has no fixture or
 * furniture-clearance requirement that a narrow width breaks.
 */
const ASPECT_CHECKED_TYPES = new Set(["primary_bedroom", "bedroom", "primary_bath", "bath", "half_bath"]);

/**
 * Open-plan great rooms/kitchens/entries are legitimately long and shallow in real houses —
 * only flag bedrooms/bathrooms, where a sliver-shaped room (e.g. 35' x 9') is never realistic
 * and would make a real architect bounce. Surfaced as the same kind of honest, computed
 * warning as `checkMinimums`, never silently shipped as if it were fine.
 */
export function checkAspectRatios(rooms: Room[], warnings: string[]) {
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

/**
 * Honest fallback for the garage-door fix above: if the garage still ends up with
 * no real interior door in some geometry this session's fix didn't anticipate,
 * say so plainly instead of silently shipping a sealed-off garage — the exact
 * failure mode this check exists to catch (found by actually generating examples
 * and reading the real door list, not assumed from the code).
 */
export function checkGarageAccess(rooms: Room[], doors: Door[], warnings: string[]) {
  const garage = rooms.find((r) => r.type === "garage");
  if (!garage) return;
  const hasInteriorDoor = doors.some((d) => d.connects.includes(garage.id) && !d.connects.includes("exterior"));
  if (!hasInteriorDoor) {
    warnings.push(`${garage.label} has no interior door to the rest of the house in this layout — try a different variant or sqft.`);
  }
}

export function checkMinimums(rooms: Room[], warnings: string[]) {
  for (const room of rooms) {
    if (room.type === "hallway" || room.type === "courtyard") continue;
    const min = getMinArea(room.type);
    if (min > 0 && room.areaSqft < min * 0.9) {
      warnings.push(
        `${room.label} is ${round1(room.areaSqft)} sqft, below the comfortable minimum of ${min} sqft for this room type.`,
      );
    }
  }
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function round1(value: number): number {
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
export function roundRoom(r: Room): Room {
  return { ...r, areaSqft: round1(r.areaSqft) };
}

export interface FloorPlanOption {
  variant: LayoutVariant;
  /** The plan shown/edited by default — for a multi-story option, the ground floor (floors[0]). */
  plan: FloorPlan;
  /** Only set for a multi-story (stories: 2) option: every floor, ground first, all sharing one footprint. */
  floors?: FloorPlan[];
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
