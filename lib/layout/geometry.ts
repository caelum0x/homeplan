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
