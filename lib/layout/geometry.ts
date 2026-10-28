export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AllocItem {
  id: string;
  ideal: number;
  min: number;
}

export interface AllocResult {
  lengths: Map<string, number>;
  /** False if even the minimums didn't fit and everything had to be scaled down uniformly. */
  feasible: boolean;
}

/**
 * Splits `total` length across `items` proportional to their `ideal` share,
 * while trying to respect each item's `min`. This is the one real geometry
 * primitive the whole layout engine is built on (public-zone rooms sliced
 * across the front, private-zone rows sliced across the back) — a plain
 * constrained-proportional allocation, not a lookup table.
 *
 * Algorithm: scale everything to `ideal` proportions first; any item that
 * falls below its minimum gets pinned at its minimum and removed from the
 * pool; the remaining budget is re-proportioned across the remaining pool.
 * Repeats until stable. If pinning every item at its minimum still doesn't
 * fit, every minimum is scaled down uniformly and `feasible` is false (the
 * caller turns this into a user-facing warning instead of silently lying
 * about the room sizes).
 */
export function allocateLengths(total: number, items: AllocItem[]): AllocResult {
  if (items.length === 0) return { lengths: new Map(), feasible: true };

  const pinned = new Map<string, number>();
  let pool = items.slice();
  let remaining = total;

  for (let pass = 0; pass < items.length + 1; pass++) {
    if (pool.length === 0) break;
    const idealSum = pool.reduce((s, it) => s + it.ideal, 0);
    const scale = idealSum > 0 ? remaining / idealSum : 0;

    const underMin = pool.filter((it) => it.ideal * scale < it.min);
    if (underMin.length === 0) {
      for (const it of pool) pinned.set(it.id, Math.max(0, it.ideal * scale));
      pool = [];
      break;
    }

    for (const it of underMin) {
      pinned.set(it.id, it.min);
      remaining -= it.min;
    }
    pool = pool.filter((it) => !underMin.includes(it));
  }

  // Leftover pool after too many passes (shouldn't happen, but stay safe).
  for (const it of pool) pinned.set(it.id, it.min);

  const minSum = items.reduce((s, it) => s + it.min, 0);
  if (minSum > total && total > 0) {
    const shrink = total / minSum;
    const lengths = new Map<string, number>();
    for (const it of items) lengths.set(it.id, it.min * shrink);
    return { lengths, feasible: false };
  }

  return { lengths: pinned, feasible: true };
}

/** Lays `items` side by side left-to-right starting at `originX`, each spanning the same `depth`. */
export function layoutRow(
  items: AllocItem[],
  originX: number,
  y: number,
  totalWidth: number,
  depth: number,
): { rects: Map<string, Rect>; feasible: boolean } {
  const { lengths, feasible } = allocateLengths(totalWidth, items);
  const rects = new Map<string, Rect>();
  let cursor = originX;
  for (const it of items) {
    const w = lengths.get(it.id) ?? 0;
    rects.set(it.id, { x: cursor, y, w, h: depth });
    cursor += w;
  }
  return { rects, feasible };
}

/** Lays `items` stacked top-to-bottom starting at `originY`, each spanning the same `width` — the column-axis counterpart to `layoutRow`, used by the side-hallway private-zone topology (a single-loaded corridor stacks rooms front-to-back instead of side by side). */
export function layoutColumn(
  items: AllocItem[],
  x: number,
  originY: number,
  totalDepth: number,
  width: number,
): { rects: Map<string, Rect>; feasible: boolean } {
  const { lengths, feasible } = allocateLengths(totalDepth, items);
  const rects = new Map<string, Rect>();
  let cursor = originY;
  for (const it of items) {
    const h = lengths.get(it.id) ?? 0;
    rects.set(it.id, { x, y: cursor, w: width, h });
    cursor += h;
  }
  return { rects, feasible };
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EXTERIOR_EPS = 0.01;

/** Merges overlapping/touching [a,b] intervals into the minimal sorted set that covers the same total range. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i];
    const last = merged[merged.length - 1];
    if (a <= last[1] + EXTERIOR_EPS) {
      last[1] = Math.max(last[1], b);
    } else {
      merged.push([a, b]);
    }
  }
  return merged;
}

/** The portion(s) of [lo, hi] not covered by any interval in `covered`. */
function subtractIntervals(lo: number, hi: number, covered: Array<[number, number]>): Array<[number, number]> {
  const merged = mergeIntervals(covered);
  const leftover: Array<[number, number]> = [];
  let cursor = lo;
  for (const [a, b] of merged) {
    if (a > cursor + EXTERIOR_EPS) leftover.push([cursor, Math.min(a, hi)]);
    cursor = Math.max(cursor, b);
    if (cursor >= hi - EXTERIOR_EPS) break;
  }
  if (cursor < hi - EXTERIOR_EPS) leftover.push([cursor, hi]);
  return leftover.filter(([a, b]) => b - a > EXTERIOR_EPS);
}

/**
 * Real exterior-wall perimeter for ANY arrangement of axis-aligned rectangles — not a
 * hardcoded rectangle, not a bounding box, not a "main block + one special-cased garage
 * notch." For every rectangle's 4 sides, this subtracts whatever portion is covered by
 * another rectangle's directly-abutting edge (a real interior wall — callers already
 * derive those separately via `sharedEdgeOverlap`) and keeps only the leftover,
 * truly-uncovered portion as a real exterior wall segment.
 *
 * This is the one piece of infrastructure that makes an L/T/U-shaped footprint render
 * with a correct exterior perimeter automatically, with zero "which shape is this"
 * special-casing anywhere downstream: a rectangle's uncovered edge IS the real exterior
 * wall, whatever the reason it's uncovered (a narrower private wing, a shallower garage,
 * a courtyard void, or a user dragging a room into an odd position in Studio). Replaces
 * two previous, narrower approaches that both predate this: generate.ts's
 * buildWallsAndDoors used a single hardcoded rectangle plus a special-cased garage notch;
 * edit.ts's buildWallsAndDoorsFromGeometry used a pure bounding box that silently "filled
 * in" any notch the moment a user touched Studio. One correct algorithm now backs both.
 */
export function computeExteriorSegments(rects: Rect[]): Segment[] {
  const segments: Segment[] = [];

  for (const r of rects) {
    const right = r.x + r.w;
    const rightCovered = rects
      .filter((o) => o !== r && Math.abs(o.x - right) < EXTERIOR_EPS)
      .map((o): [number, number] => [Math.max(r.y, o.y), Math.min(r.y + r.h, o.y + o.h)])
      .filter(([a, b]) => b - a > EXTERIOR_EPS);
    for (const [a, b] of subtractIntervals(r.y, r.y + r.h, rightCovered)) {
      segments.push({ x1: right, y1: a, x2: right, y2: b });
    }

    const left = r.x;
    const leftCovered = rects
      .filter((o) => o !== r && Math.abs(o.x + o.w - left) < EXTERIOR_EPS)
      .map((o): [number, number] => [Math.max(r.y, o.y), Math.min(r.y + r.h, o.y + o.h)])
      .filter(([a, b]) => b - a > EXTERIOR_EPS);
    for (const [a, b] of subtractIntervals(r.y, r.y + r.h, leftCovered)) {
      segments.push({ x1: left, y1: a, x2: left, y2: b });
    }

    const bottom = r.y + r.h;
    const bottomCovered = rects
      .filter((o) => o !== r && Math.abs(o.y - bottom) < EXTERIOR_EPS)
      .map((o): [number, number] => [Math.max(r.x, o.x), Math.min(r.x + r.w, o.x + o.w)])
      .filter(([a, b]) => b - a > EXTERIOR_EPS);
    for (const [a, b] of subtractIntervals(r.x, r.x + r.w, bottomCovered)) {
      segments.push({ x1: a, y1: bottom, x2: b, y2: bottom });
    }

    const top = r.y;
    const topCovered = rects
      .filter((o) => o !== r && Math.abs(o.y + o.h - top) < EXTERIOR_EPS)
      .map((o): [number, number] => [Math.max(r.x, o.x), Math.min(r.x + r.w, o.x + o.w)])
      .filter(([a, b]) => b - a > EXTERIOR_EPS);
    for (const [a, b] of subtractIntervals(r.x, r.x + r.w, topCovered)) {
      segments.push({ x1: a, y1: top, x2: b, y2: top });
    }
  }

  return segments;
}

/** Length of the overlap between two rectangles' shared edge, or 0 if they don't share one. */
export function sharedEdgeOverlap(a: Rect, b: Rect): { x: number; y: number; length: number; orientation: "h" | "v" } | null {
  const EPS = 0.01;

  // Vertical shared wall: a's right touches b's left, or vice versa.
  const touchesVertically = Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS;
  if (touchesVertically) {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.h, b.y + b.h);
    const length = bottom - top;
    if (length > EPS) {
      const x = Math.abs(a.x + a.w - b.x) < EPS ? a.x + a.w : b.x + b.w;
      return { x, y: (top + bottom) / 2, length, orientation: "v" };
    }
  }

  // Horizontal shared wall: a's bottom touches b's top, or vice versa.
  const touchesHorizontally = Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS;
  if (touchesHorizontally) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const length = right - left;
    if (length > EPS) {
      const y = Math.abs(a.y + a.h - b.y) < EPS ? a.y + a.h : b.y + b.h;
      return { x: (left + right) / 2, y, length, orientation: "h" };
    }
  }

  return null;
}
