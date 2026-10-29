// Real arbitrary lot/site-boundary fitting — the flagship audit's own top-ranked remaining
// gap (plans/homeplan.md, "Arbitrary lot/site boundary fitting ... the deepest one left").
// A user supplies a real site-boundary polygon (any simple polygon, not just a rectangle) plus
// a uniform setback; this module computes whether the plan's REAL exterior footprint (traced
// from its actual wall geometry, including L-shape/garage/courtyard notches — not a bounding
// box) fits inside the setback-eroded buildable area, at which of the 4 structurally-safe
// cardinal rotations, and at what real position, then applies that exact rigid transform to
// every room/wall/door/window/furniture coordinate so the result is a fully normal, fully
// compatible FloorPlan (Studio/3D/export/chat-edit all keep working unmodified on it).
//
// Deliberate scope boundary, decided up front and kept honest throughout this file: rotation is
// restricted to exact 0/90/180/270-degree steps, and there is no uniform-scale "shrink to fit"
// step. Both decisions trace back to the same root cause — every Room/Wall/Door/Window in this
// codebase is an axis-aligned rectangle/segment in a shared coordinate frame, and every
// downstream renderer/exporter assumes that. A continuous arbitrary-angle rotation would need a
// rotated-rectangle (or full polygon) room representation across every renderer and export path
// — a multi-day architecture rework, the same class of gap this codebase already scopes
// honestly elsewhere (e.g. the L-shape/courtyard topology rework) rather than half-attempting.
// A cosmetic uniform scale was considered and rejected for a different, real reason: scaling
// positions but not fixed real-world constants (door width, hallway width, minimum room sizes)
// produces a geometrically-consistent but architecturally-dishonest miniature; scaling those
// constants too produces substandard doors/hallways. The real fix for "doesn't fit even
// rotated" is regenerating at a smaller target sqft through the actual engine (generateFloorPlan)
// — flagged as the natural next increment in plans/homeplan.md, not attempted here, since the
// client already has the original BriefInput available (`result.input`) to drive that follow-up.
import type { Door, FloorPlan, FurnitureItem, Room, Wall, Window } from "./types";
import { computeExteriorSegments, type Segment } from "./geometry";
import { round1 } from "./generate";

export interface Point {
  x: number;
  y: number;
}
export type Polygon = Point[];

// ---------------------------------------------------------------------------
// Core polygon primitives — plain, dependency-free 2D computational geometry.
// Every function here operates on ordered-vertex simple polygons (closed implicitly:
// edge i runs from poly[i] to poly[(i+1) % poly.length]).
// ---------------------------------------------------------------------------

export function signedPolygonArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(poly: Polygon): number {
  return Math.abs(signedPolygonArea(poly));
}

/** Reverses vertex order if needed so the polygon winds counterclockwise (positive signed area) — the convention every other function here assumes. */
export function ensureCCW(poly: Polygon): Polygon {
  return signedPolygonArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function polygonCentroid(poly: Polygon): Point {
  let cx = 0;
  let cy = 0;
  let areaSum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = a.x * b.y - b.x * a.y;
    areaSum += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(areaSum) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * areaSum), y: cy / (3 * areaSum) };
}

export function polygonBounds(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  return poly.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** Standard ray-casting point-in-polygon test. Boundary-exact cases are handled separately by `pointNearPolygonBoundary` wherever this is used for containment, since ray-casting alone is unreliable exactly on an edge. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi !== yj && yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export function pointNearPolygonBoundary(p: Point, poly: Polygon, eps: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= eps) return true;
  }
  return false;
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

/** True if open segments p1q1 and p2q2 properly cross or touch — standard orientation-based test. */
export function segmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

/** O(n^2) self-intersection check — real, correct, and fast enough for the small (3-20 vertex) polygons this feature deals with (lot boundaries, building footprints). */
export function isSimplePolygon(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i || (j + 1) % n === i || (i + 1) % n === j;
      if (adjacent) continue;
      if (segmentsIntersect(a1, a2, poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

function lineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Inward polygon offset (erosion) by `setback` feet — the real "buildable area after setbacks"
 * computation. Standard edge-offset-and-reintersect algorithm: translate every edge inward along
 * its own normal, then re-derive each vertex as the intersection of its two adjacent offset
 * edges. Exact and correct for convex polygons; for mildly concave ones (an L-shaped lot) it
 * remains correct as long as the setback doesn't exceed the lot's local feature size enough to
 * collapse/cross edges — validated below (simple-polygon + positive-area checks), returning null
 * rather than silently shipping a self-intersecting "buildable area" when it does.
 */
export function insetPolygon(polygonIn: Polygon, setback: number): Polygon | null {
  if (setback <= 0) return polygonIn;
  const poly = ensureCCW(polygonIn);
  const n = poly.length;
  if (n < 3) return null;

  const offsetLines: { a: Point; b: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % n];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    // Inward normal for a CCW polygon edge: rotate the edge direction +90deg.
    const nx = -dy / len;
    const ny = dx / len;
    offsetLines.push({ a: { x: A.x + nx * setback, y: A.y + ny * setback }, b: { x: B.x + nx * setback, y: B.y + ny * setback } });
  }

  const result: Polygon = [];
  for (let i = 0; i < n; i++) {
    const prev = offsetLines[(i - 1 + n) % n];
    const curr = offsetLines[i];
    const pt = lineIntersection(prev.a, prev.b, curr.a, curr.b);
    if (!pt) return null;
    result.push(pt);
  }

  if (polygonArea(result) < 1e-6) return null;
  if (!isSimplePolygon(result)) return null;
  // Real sanity check the adjacent-edge-intersection method can't give for free: when the
  // setback exceeds a convex shape's local "radius" (e.g. half a square's side), each corner's
  // new position keeps sliding along its diagonal past the shape's own skeleton center and comes
  // out the other side — still a simple, positive-area polygon, but geometrically wrong (it sits
  // *closer* than `setback` to whichever edges weren't adjacent to that corner). Found by actually
  // running this on a 40x40 lot with a 25ft setback (scripts/verify-lot-fit.ts) and reading the
  // real resulting coordinates, not assumed from the algorithm. Catch it generally: every real
  // vertex of a valid erosion must sit at >= `setback` from EVERY original edge, not just the two
  // that produced it.
  const eps = 0.05;
  for (const v of result) {
    if (minDistanceToPolygonEdges(v, poly) < setback - eps) return null;
  }
  return result;
}

function minDistanceToPolygonEdges(p: Point, poly: Polygon): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    min = Math.min(min, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return min;
}

/** Binary-searches the largest setback this lot shape can take before erosion collapses it — a real, useful number for the "setback too large" error message, not a generic failure. */
function findMaxFeasibleSetback(lot: Polygon): number {
  const bounds = polygonBounds(lot);
  let lo = 0;
  let hi = Math.max(1, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const eroded = insetPolygon(lot, mid);
    if (eroded && polygonArea(eroded) > 1) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 10) / 10;
}

/**
 * Real containment check: is `inner` entirely inside `outer`? Vertex containment alone is
 * insufficient for a concave `outer` (a notch could poke between two inner vertices without
 * containing either) — densely sampling every inner edge catches that, at a real, bounded
 * resolution (capped per edge, not unbounded) rather than an exact polygon-clipping algorithm,
 * which is out of scope for this session (see this file's header comment).
 */
export function polygonFullyInsidePolygon(inner: Polygon, outer: Polygon): boolean {
  const EPS = 0.05;
  for (const v of inner) {
    if (!pointInPolygon(v, outer) && !pointNearPolygonBoundary(v, outer, EPS)) return false;
  }
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.min(40, Math.max(3, Math.ceil(len / 2)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (!pointInPolygon(pt, outer) && !pointNearPolygonBoundary(pt, outer, EPS)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Real exterior-footprint extraction — reuses the engine's own `computeExteriorSegments`
// (the same real wall-perimeter computation generate.ts's buildWallsAndDoors uses) so the
// shape being fit is byte-for-byte what every other view already renders: L-shape/garage/
// courtyard notches included, never a bounding-box approximation.
// ---------------------------------------------------------------------------

function closeTo(a: Point, b: Point, eps = 0.05): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/** Chains axis-aligned wall segments into closed loops by matching endpoints — correct for any currently-generated topology, all of which produce simple closed exterior loops (no T-junctions on the true outer perimeter). Returns loops sorted largest-area first. */
export function traceExteriorPolygon(segments: Segment[]): Polygon[] {
  const keyOf = (p: Point) => `${Math.round(p.x * 20)}:${Math.round(p.y * 20)}`;
  const entries = segments.map((s) => ({ seg: s, used: false }));
  const byPoint = new Map<string, number[]>();
  entries.forEach((e, idx) => {
    for (const p of [{ x: e.seg.x1, y: e.seg.y1 }, { x: e.seg.x2, y: e.seg.y2 }]) {
      const k = keyOf(p);
      const arr = byPoint.get(k) ?? [];
      arr.push(idx);
      byPoint.set(k, arr);
    }
  });

  const loops: Polygon[] = [];
  for (let start = 0; start < entries.length; start++) {
    if (entries[start].used) continue;
    const loop: Point[] = [];
    let currentIdx = start;
    let currentPoint: Point = { x: entries[start].seg.x1, y: entries[start].seg.y1 };
    let safety = segments.length * 2 + 10;
    while (safety-- > 0) {
      const e = entries[currentIdx];
      if (e.used) break;
      e.used = true;
      const p1 = { x: e.seg.x1, y: e.seg.y1 };
      const p2 = { x: e.seg.x2, y: e.seg.y2 };
      const next = closeTo(currentPoint, p1) ? p2 : p1;
      loop.push(currentPoint);
      currentPoint = next;
      const candidates = (byPoint.get(keyOf(next)) ?? []).filter((i) => !entries[i].used);
      if (candidates.length === 0) break;
      currentIdx = candidates[0];
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops.sort((a, b) => polygonArea(b) - polygonArea(a));
}

/** The plan's real exterior silhouette (plan-local coordinates), or null if it couldn't be traced into a closed loop (shouldn't happen for any currently-generated plan — defensive, not assumed). */
export function extractFootprintPolygon(plan: FloorPlan): Polygon | null {
  const segments = computeExteriorSegments(plan.rooms);
  const loops = traceExteriorPolygon(segments);
  return loops[0] ?? null;
}

// ---------------------------------------------------------------------------
// Rigid transform: exact 90-degree-step rotation (clockwise, in this app's y-down coordinate
// convention — matches FurnitureItem.rotation's own documented "degrees, clockwise" convention,
// verified in scripts/verify-lot-fit.ts) + translation. No scale, by design (see header).
// ---------------------------------------------------------------------------

/** Exported for scripts/verify-lot-fit.ts's own independent numeric cross-check of the rotation math; not otherwise used outside this file. */
export function rotate90(p: Point, k: number): Point {
  switch (((k % 4) + 4) % 4) {
    case 1:
      return { x: -p.y, y: p.x };
    case 2:
      return { x: -p.x, y: -p.y };
    case 3:
      return { x: p.y, y: -p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

function flipOrientation(o: "h" | "v", k: number): "h" | "v" {
  return ((k % 2) + 2) % 2 === 1 ? (o === "h" ? "v" : "h") : o;
}

const HINGE_DIR: Record<"h" | "v", Record<"start" | "end", Point>> = {
  h: { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } },
  v: { start: { x: 0, y: -1 }, end: { x: 0, y: 1 } },
};

/** Rotates a hinge-side LABEL correctly under a rigid rotation: converts it to a real direction vector, rotates that vector, then re-reads off which label it corresponds to in the new orientation. Needed because "start"/"end" is a relative label, not raw geometry — see this file's header for why a naive carry-over breaks for k=2/3 (verified numerically in scripts/verify-lot-fit.ts). */
function transformHingeSide(orientation: "h" | "v", hingeSide: "start" | "end", k: number): "start" | "end" {
  const dir = HINGE_DIR[orientation][hingeSide];
  const rotated = rotate90(dir, k);
  const newOrientation = flipOrientation(orientation, k);
  if (newOrientation === "h") return rotated.x < 0 ? "start" : "end";
  return rotated.y < 0 ? "start" : "end";
}

type Transform = (p: Point) => Point;

function transformRoom(room: Room, transform: Transform): Room {
  const p1 = transform({ x: room.x, y: room.y });
  const p2 = transform({ x: room.x + room.w, y: room.y + room.h });
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x);
  const h = Math.abs(p2.y - p1.y);
  return { ...room, x, y, w, h, areaSqft: round1(w * h) };
}

function transformWall(wall: Wall, transform: Transform): Wall {
  const a = transform({ x: wall.x1, y: wall.y1 });
  const b = transform({ x: wall.x2, y: wall.y2 });
  return { ...wall, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function transformDoor(door: Door, transform: Transform, k: number): Door {
  const p = transform({ x: door.x, y: door.y });
  return {
    ...door,
    x: p.x,
    y: p.y,
    orientation: flipOrientation(door.orientation, k),
    hingeSide: door.hingeSide ? transformHingeSide(door.orientation, door.hingeSide, k) : door.hingeSide,
  };
}

function transformWindow(win: Window, transform: Transform, k: number): Window {
  const p = transform({ x: win.x, y: win.y });
  return { ...win, x: p.x, y: p.y, orientation: flipOrientation(win.orientation, k) };
}

/** Furniture w/h are the piece's real unrotated footprint — rotating the whole plan by 90deg steps is represented purely by incrementing the piece's own `rotation` field (same convention the renderer already applies around the piece's own center), never by swapping w/h, which would double-count the rotation. Only the piece's center POSITION goes through the point transform. */
function transformFurniture(item: FurnitureItem, transform: Transform, k: number): FurnitureItem {
  const center = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  const newCenter = transform(center);
  return {
    ...item,
    x: newCenter.x - item.w / 2,
    y: newCenter.y - item.h / 2,
    rotation: ((item.rotation + k * 90) % 360 + 360) % 360,
  };
}

/** Shifts a plan so its rooms' bounding box starts at (0,0) again — real lot coordinates can be anywhere (whatever the user typed), but every other view in this app (Studio, 3D, PDF/DXF, chat-edit) assumes a plan sits near the origin the way every freshly-generated plan always has. Call this before handing a lot-fit result to the rest of the app as "the" active plan. */
export function normalizePlanToOrigin(plan: FloorPlan): FloorPlan {
  const bounds = plan.rooms.reduce(
    (acc, r) => ({ minX: Math.min(acc.minX, r.x), minY: Math.min(acc.minY, r.y) }),
    { minX: Infinity, minY: Infinity },
  );
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return plan;
  const dx = -bounds.minX;
  const dy = -bounds.minY;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return plan;
  const transform: Transform = (p) => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...plan,
    rooms: plan.rooms.map((r) => transformRoom(r, transform)),
    walls: plan.walls.map((w) => transformWall(w, transform)),
    doors: plan.doors.map((d) => transformDoor(d, transform, 0)),
    windows: (plan.windows ?? []).map((w) => transformWindow(w, transform, 0)),
    furniture: plan.furniture.map((f) => transformFurniture(f, transform, 0)),
  };
}

// ---------------------------------------------------------------------------
// Placement search: real translation-only containment search for a given (already rotated)
// footprint polygon against the buildable polygon. Coarse grid + a local refine pass — bounded,
// fast (low tens of milliseconds for realistic lot/footprint vertex counts), not an exact
// optimal-packing solver, which this session's scope doesn't need: any single feasible, well-
// centered placement is a real, correct answer to "does this plan fit this lot."
// ---------------------------------------------------------------------------

interface Placement {
  feasible: boolean;
  offset: Point;
  marginScore: number;
}

function searchPlacement(footprint: Polygon, buildable: Polygon): Placement {
  const footB = polygonBounds(footprint);
  const buildB = polygonBounds(buildable);
  const footW = footB.maxX - footB.minX;
  const footH = footB.maxY - footB.minY;
  const rangeX = buildB.maxX - buildB.minX - footW;
  const rangeY = buildB.maxY - buildB.minY - footH;
  if (rangeX < -1e-6 || rangeY < -1e-6) return { feasible: false, offset: { x: 0, y: 0 }, marginScore: Infinity };

  const buildableCentroid = polygonCentroid(buildable);
  let best: Placement = { feasible: false, offset: { x: 0, y: 0 }, marginScore: Infinity };

  function evaluate(ox: number, oy: number) {
    const shifted = footprint.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    if (!polygonFullyInsidePolygon(shifted, buildable)) return;
    const c = polygonCentroid(shifted);
    const score = Math.hypot(c.x - buildableCentroid.x, c.y - buildableCentroid.y);
    if (score < best.marginScore) best = { feasible: true, offset: { x: ox, y: oy }, marginScore: score };
  }

  const dxBase = buildB.minX - footB.minX;
  const dyBase = buildB.minY - footB.minY;
  const COARSE = 20;
  for (let i = 0; i <= COARSE; i++) {
    const ox = dxBase + (rangeX * i) / COARSE;
    for (let j = 0; j <= COARSE; j++) {
      evaluate(ox, dyBase + (rangeY * j) / COARSE);
    }
  }

  if (best.feasible) {
    const stepX = Math.max(rangeX / COARSE, 0.01);
    const stepY = Math.max(rangeY / COARSE, 0.01);
    const REFINE = 10;
    for (let i = -REFINE; i <= REFINE; i++) {
      const ox = best.offset.x + (stepX * i) / REFINE;
      if (ox < dxBase - 1e-6 || ox > dxBase + rangeX + 1e-6) continue;
      for (let j = -REFINE; j <= REFINE; j++) {
        const oy = best.offset.y + (stepY * j) / REFINE;
        if (oy < dyBase - 1e-6 || oy > dyBase + rangeY + 1e-6) continue;
        evaluate(ox, oy);
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LotFitResult {
  feasible: boolean;
  /** Real lot-coordinate-space plan (not yet normalized to origin) when feasible — pass through `normalizePlanToOrigin` before using it as the app's active plan. Null when infeasible. */
  plan: FloorPlan | null;
  orientationDeg: 0 | 90 | 180 | 270 | null;
  lot: Polygon;
  buildable: Polygon | null;
  footprintAreaSqft: number;
  buildableAreaSqft: number | null;
  lotAreaSqft: number;
  warnings: string[];
  error: string | null;
}

function failResult(lot: Polygon, error: string, extra?: Partial<LotFitResult>): LotFitResult {
  return {
    feasible: false,
    plan: null,
    orientationDeg: null,
    lot,
    buildable: null,
    footprintAreaSqft: 0,
    buildableAreaSqft: null,
    lotAreaSqft: lot.length >= 3 ? round1(polygonArea(lot)) : 0,
    warnings: [],
    error,
    ...extra,
  };
}

/**
 * The real fitting pass: does `plan`'s actual exterior footprint fit inside `lotInput` after a
 * uniform `setbackFt` setback, at 0/90/180/270 degrees? If so, returns the plan with every
 * coordinate (rooms, walls, doors incl. recomputed hinge sides, windows, furniture) transformed
 * into real lot-coordinate space at the best-fitting orientation + position. See this file's
 * header for the two scope boundaries (rotation steps, no scale) and why.
 */
export function fitPlanToLot(plan: FloorPlan, lotInput: Polygon, setbackFt: number): LotFitResult {
  if (!Array.isArray(lotInput) || lotInput.length < 3) {
    return failResult(lotInput ?? [], "A lot boundary needs at least 3 points.");
  }
  if (plan.rooms.some((r) => r.type === "stairs")) {
    return failResult(lotInput, "Lot fitting doesn't yet support multi-story plans — fit each floor's footprint as its own single-story plan instead.");
  }

  const lot = ensureCCW(lotInput);
  if (!isSimplePolygon(lot)) {
    return failResult(lot, "This lot boundary crosses itself — check the point order (it should trace the property line around once, without crossing back over itself).");
  }
  const lotAreaSqft = polygonArea(lot);
  if (lotAreaSqft < 1) {
    return failResult(lot, "This lot boundary has approximately zero area — check the points.");
  }

  const safeSetback = Math.max(0, setbackFt);
  const buildable = safeSetback > 0 ? insetPolygon(lot, safeSetback) : lot;
  if (!buildable) {
    const maxSetback = findMaxFeasibleSetback(lot);
    return failResult(
      lot,
      `A ${safeSetback}ft setback leaves no buildable area on this lot shape — the largest setback this lot can take is about ${maxSetback}ft.`,
      { lotAreaSqft: round1(lotAreaSqft) },
    );
  }
  const buildableAreaSqft = polygonArea(buildable);

  const footprint = extractFootprintPolygon(plan);
  if (!footprint) {
    return failResult(lot, "Could not trace this plan's exterior footprint into a boundary.", { lotAreaSqft: round1(lotAreaSqft), buildableAreaSqft: round1(buildableAreaSqft) });
  }
  const footprintAreaSqft = polygonArea(footprint);

  let bestFeasible: { k: number; offset: Point; score: number } | null = null;
  for (let k = 0; k < 4; k++) {
    const rotated = footprint.map((p) => rotate90(p, k));
    const placement = searchPlacement(rotated, buildable);
    if (placement.feasible && (!bestFeasible || placement.marginScore < bestFeasible.score)) {
      bestFeasible = { k, offset: placement.offset, score: placement.marginScore };
    }
  }

  if (!bestFeasible) {
    return failResult(
      lot,
      `This plan's real footprint (~${round1(footprintAreaSqft)} sqft) doesn't fit inside the buildable area after setbacks (~${round1(buildableAreaSqft)} sqft, on a ${round1(lotAreaSqft)} sqft lot) at any of the 4 standard orientations. Try a smaller setback, a bigger lot, or regenerate the plan at a smaller square footage before fitting.`,
      { footprintAreaSqft: round1(footprintAreaSqft), buildableAreaSqft: round1(buildableAreaSqft), lotAreaSqft: round1(lotAreaSqft) },
    );
  }

  const { k, offset } = bestFeasible;
  const transform: Transform = (p) => {
    const r = rotate90(p, k);
    return { x: r.x + offset.x, y: r.y + offset.y };
  };

  const fittedRooms = plan.rooms.map((r) => transformRoom(r, transform));
  const fittedWalls = plan.walls.map((w) => transformWall(w, transform));
  const fittedDoors = plan.doors.map((d) => transformDoor(d, transform, k));
  const fittedWindows = (plan.windows ?? []).map((w) => transformWindow(w, transform, k));
  const fittedFurniture = plan.furniture.map((f) => transformFurniture(f, transform, k));
  const fittedFootprintBounds = polygonBounds(footprint.map(transform));

  const warnings: string[] = [];
  if (safeSetback > 0) warnings.push(`Fitted with a uniform ${safeSetback}ft setback from the lot line on all sides.`);
  if (k !== 0) warnings.push(`Rotated ${k * 90}° from the plan's original orientation to make it fit this lot.`);
  const utilization = buildableAreaSqft > 0 ? (footprintAreaSqft / buildableAreaSqft) * 100 : 0;
  warnings.push(`Real footprint ~${round1(footprintAreaSqft)} sqft uses ~${round1(utilization)}% of the ~${round1(buildableAreaSqft)} sqft buildable area.`);

  const fittedPlan: FloorPlan = {
    ...plan,
    footprint: { w: round1(fittedFootprintBounds.maxX - fittedFootprintBounds.minX), h: round1(fittedFootprintBounds.maxY - fittedFootprintBounds.minY) },
    rooms: fittedRooms,
    walls: fittedWalls,
    doors: fittedDoors,
    windows: fittedWindows,
    furniture: fittedFurniture,
    warnings: [...plan.warnings, ...warnings],
  };

  return {
    feasible: true,
    plan: fittedPlan,
    orientationDeg: (k * 90) as 0 | 90 | 180 | 270,
    lot,
    buildable,
    footprintAreaSqft: round1(footprintAreaSqft),
    buildableAreaSqft: round1(buildableAreaSqft),
    lotAreaSqft: round1(lotAreaSqft),
    warnings,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Minimal real input UI support: parse/serialize a polygon as plain "x, y" lines, plus a few
// real preset lot shapes (including genuinely non-rectangular ones) so the feature is usable
// without a drawing tool, per this task's own "a reasonable minimal real UI is fine" scope.
// ---------------------------------------------------------------------------

export function parseLotPointsText(text: string): Polygon | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 3) return null;
  const points: Polygon = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
  }
  return points;
}

export function lotPointsToText(poly: Polygon): string {
  return poly.map((p) => `${p.x}, ${p.y}`).join("\n");
}

export interface LotPreset {
  id: string;
  label: string;
  description: string;
  points: Polygon;
}

export const LOT_PRESETS: LotPreset[] = [
  {
    id: "rect",
    label: "Rectangular — 70×130",
    description: "A plain rectangular lot, for comparison.",
    points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 130 }, { x: 0, y: 130 }],
  },
  {
    id: "trapezoid",
    label: "Trapezoid — narrower at the street",
    description: "Street frontage narrower than the rear line — common on a cul-de-sac.",
    points: [{ x: 10, y: 0 }, { x: 60, y: 0 }, { x: 75, y: 140 }, { x: -5, y: 140 }],
  },
  {
    id: "l-shape",
    label: "L-shaped lot",
    description: "An L-shaped parcel — a flag/notch cut from one back corner.",
    points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 90 }, { x: 50, y: 90 }, { x: 50, y: 150 }, { x: 0, y: 150 }],
  },
  {
    id: "corner",
    label: "Corner lot — angled street cut",
    description: "A corner lot with the street-corner point cut on the diagonal.",
    points: [{ x: 20, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 110 }, { x: 0, y: 110 }, { x: 0, y: 30 }],
  },
];
