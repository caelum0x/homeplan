// Pure geometry helpers for rendering a FurnitureItem's real (possibly rotated)
// footprint and icon-detail marks into a non-SVG export target (PDF, DXF).
// lib/renderSvg.ts draws furniture via an SVG `<g transform="translate(...)
// rotate(item.rotation, w/2, h/2)">` — neither pdf-lib nor the DXF writer has
// an equivalent local-transform group, so this re-derives the same rotation
// (clockwise, matching SVG's y-down convention) directly in absolute plan-space
// feet coordinates, the same coordinate system Room/Wall/Door already use.

import type { FurnitureItem } from "./layout/types";
import { furnitureIconDetails } from "./furnitureIcon";

export interface PlanPoint {
  x: number;
  y: number;
}

/** Rotates (x, y) by the item's own rotation, clockwise, around the item's own center — in plan-space feet. */
export function rotateAroundItemCenter(item: FurnitureItem, x: number, y: number): PlanPoint {
  if (item.rotation === 0) return { x, y };
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** The furniture item's real (rotated) footprint corners in plan-space feet, closed order. */
export function furnitureFootprintCorners(item: FurnitureItem): PlanPoint[] {
  const { x, y, w, h } = item;
  return [
    rotateAroundItemCenter(item, x, y),
    rotateAroundItemCenter(item, x + w, y),
    rotateAroundItemCenter(item, x + w, y + h),
    rotateAroundItemCenter(item, x, y + h),
  ];
}

export type PlanIconMark =
  | { kind: "rect"; corners: PlanPoint[]; dashed?: boolean }
  | { kind: "circle"; center: PlanPoint; radiusFt: number }
  | { kind: "line"; a: PlanPoint; b: PlanPoint };

/**
 * The furniture item's detail marks (bed headboards, sofa arms, stove burners, ...)
 * — same source shapes lib/furnitureIcon.ts describes for the SVG renderer, resolved
 * to absolute rotated plan-space points instead of an SVG local transform.
 */
export function furnitureIconMarks(item: FurnitureItem): PlanIconMark[] {
  const toPlan = (u: number, v: number) => rotateAroundItemCenter(item, item.x + u * item.w, item.y + v * item.h);
  return furnitureIconDetails(item.type).map((shape): PlanIconMark => {
    if (shape.kind === "rect") {
      return {
        kind: "rect",
        corners: [
          toPlan(shape.x, shape.y),
          toPlan(shape.x + shape.w, shape.y),
          toPlan(shape.x + shape.w, shape.y + shape.h),
          toPlan(shape.x, shape.y + shape.h),
        ],
        dashed: shape.dashed,
      };
    }
    if (shape.kind === "circle") {
      return { kind: "circle", center: toPlan(shape.cx, shape.cy), radiusFt: shape.r * Math.min(item.w, item.h) };
    }
    return { kind: "line", a: toPlan(shape.x1, shape.y1), b: toPlan(shape.x2, shape.y2) };
  });
}
