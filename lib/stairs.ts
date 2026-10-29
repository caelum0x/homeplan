// Plan-space stair graphics for a "stairs" room — the standard architectural convention
// (one line per tread across the flight, a travel arrow, "UP" on the lower floor / "DN" on
// the upper floor) computed once here from the room's own `stairRun` so every renderer
// (SVG string, React 2D view, Studio, PDF, DXF) draws the exact same flight in the exact
// same place on both floors. Pure geometry, in feet — each renderer maps it to its own space.

import type { Room } from "./layout/types";
import { STAIR_RISERS } from "./layout/stairSpec";

export interface PlanSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface StairGraphics {
  /** One line per tread nosing, across the flight's width. */
  treads: PlanSegment[];
  /** Travel arrow shaft, pointing in the direction you'd walk on THIS floor (up the flight downstairs, down it upstairs). */
  arrow: PlanSegment;
  /** Two short arrowhead strokes at `arrow`'s (x2, y2) end. */
  arrowHead: [PlanSegment, PlanSegment];
  label: "UP" | "DN";
  /** Where to put the label: in the landing just before the arrow's tail. */
  labelAt: { x: number; y: number };
  /**
   * Centre + length (ft) of the longest clear stretch of the strip outside the flight — where a
   * renderer should put the room's own name, rotated to run along the strip (a 4ft-wide strip
   * clips any horizontal label longer than ~7 characters).
   */
  nameAt: { x: number; y: number; span: number };
  /**
   * Which real axis the flight travels along ("y" = vertical, the default for every freshly-
   * generated plan; "x" = horizontal, only after lib/layout/lotFit.ts rotates a multi-story plan
   * 90/270 degrees — see Room.stairRun's doc comment). A renderer that rotates `nameAt`'s label
   * text to run along the strip (lib/renderSvg.ts, lib/exportPdf.ts) only needs that rotation
   * when `axis === "y"`; an "x"-axis strip already reads along its long side unrotated.
   */
  axis: "x" | "y";
}

/** Null for any room that isn't a stair or predates `stairRun` (old share links/templates). */
export function stairGraphics(room: Room): StairGraphics | null {
  if (room.type !== "stairs" || !room.stairRun) return null;
  const { start, length, bottomAt, floor } = room.stairRun;
  const axis = room.stairRun.axis ?? "y";
  // "along" is the axis the flight travels/the room is long on; "across" is the flight's width.
  const roomAlongStart = axis === "x" ? room.x : room.y;
  const roomAlongSize = axis === "x" ? room.w : room.h;
  const roomAcrossStart = axis === "x" ? room.y : room.x;
  const roomAcrossSize = axis === "x" ? room.h : room.w;
  const toPoint = (along: number, across: number): { x: number; y: number } =>
    axis === "x" ? { x: along, y: across } : { x: across, y: along };

  // Clamp to the room so a Studio resize that shortens the strip never draws treads outside it.
  const a0 = roomAlongStart + Math.max(0, start);
  const a1 = Math.min(roomAlongStart + roomAlongSize, roomAlongStart + start + length);
  if (a1 - a0 <= 0.1) return null;

  const inset = Math.min(0.4, roomAcrossSize * 0.1);
  const acrossLow = roomAcrossStart + inset;
  const acrossHigh = roomAcrossStart + roomAcrossSize - inset;
  const treadCount = STAIR_RISERS - 1;
  const treads: PlanSegment[] = [];
  for (let i = 0; i <= treadCount; i++) {
    const a = a0 + ((a1 - a0) * i) / treadCount;
    const p1 = toPoint(a, acrossLow);
    const p2 = toPoint(a, acrossHigh);
    treads.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }

  const bottomA = bottomAt === "start" ? a0 : a1;
  const topA = bottomAt === "start" ? a1 : a0;
  const acrossCenter = roomAcrossStart + roomAcrossSize / 2;
  const goingUp = floor === "lower";
  const fromA = goingUp ? bottomA : topA;
  const toA = goingUp ? topA : bottomA;
  const dir = Math.sign(toA - fromA) || 1;
  const head = Math.min(0.9, roomAcrossSize * 0.25);
  const arrowFrom = toPoint(fromA + dir * 0.6, acrossCenter);
  const arrowTo = toPoint(toA - dir * 0.4, acrossCenter);
  const arrow = { x1: arrowFrom.x, y1: arrowFrom.y, x2: arrowTo.x, y2: arrowTo.y };
  const head1 = toPoint(toA - dir * 0.4 - dir * head, acrossCenter - head);
  const head2 = toPoint(toA - dir * 0.4 - dir * head, acrossCenter + head);
  const labelAt = toPoint(fromA - dir * 1.1, acrossCenter);

  return {
    treads,
    arrow,
    arrowHead: [
      { x1: arrow.x2, y1: arrow.y2, x2: head1.x, y2: head1.y },
      { x1: arrow.x2, y1: arrow.y2, x2: head2.x, y2: head2.y },
    ],
    label: goingUp ? "UP" : "DN",
    labelAt,
    nameAt: longestClearStretch(roomAlongStart, roomAlongSize, a0, a1, acrossCenter, toPoint),
    axis,
  };
}

function longestClearStretch(
  roomAlongStart: number,
  roomAlongSize: number,
  flightStart: number,
  flightEnd: number,
  acrossCenter: number,
  toPoint: (along: number, across: number) => { x: number; y: number },
): { x: number; y: number; span: number } {
  const before = flightStart - roomAlongStart;
  const after = roomAlongStart + roomAlongSize - flightEnd;
  // Leave ~2ft for the UP/DN label sitting in the landing right next to the flight.
  const chosen =
    before > after
      ? { along: roomAlongStart + (before - 2) / 2, span: Math.max(0, before - 2) }
      : { along: flightEnd + 2 + (after - 2) / 2, span: Math.max(0, after - 2) };
  const point = toPoint(chosen.along, acrossCenter);
  return { x: point.x, y: point.y, span: chosen.span };
}
