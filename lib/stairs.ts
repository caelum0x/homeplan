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
}

/** Null for any room that isn't a stair or predates `stairRun` (old share links/templates). */
export function stairGraphics(room: Room): StairGraphics | null {
  if (room.type !== "stairs" || !room.stairRun) return null;
  const { start, length, bottomAt, floor } = room.stairRun;
  // Clamp to the room so a Studio resize that shortens the strip never draws treads outside it.
  const y0 = room.y + Math.max(0, start);
  const y1 = Math.min(room.y + room.h, room.y + start + length);
  if (y1 - y0 <= 0.1) return null;

  const inset = Math.min(0.4, room.w * 0.1);
  const left = room.x + inset;
  const right = room.x + room.w - inset;
  const treadCount = STAIR_RISERS - 1;
  const treads: PlanSegment[] = [];
  for (let i = 0; i <= treadCount; i++) {
    const y = y0 + ((y1 - y0) * i) / treadCount;
    treads.push({ x1: left, y1: y, x2: right, y2: y });
  }

  const bottomY = bottomAt === "start" ? y0 : y1;
  const topY = bottomAt === "start" ? y1 : y0;
  const cx = room.x + room.w / 2;
  const goingUp = floor === "lower";
  const fromY = goingUp ? bottomY : topY;
  const toY = goingUp ? topY : bottomY;
  const dir = Math.sign(toY - fromY) || 1;
  const head = Math.min(0.9, room.w * 0.25);
  const arrow = { x1: cx, y1: fromY + dir * 0.6, x2: cx, y2: toY - dir * 0.4 };

  return {
    treads,
    arrow,
    arrowHead: [
      { x1: cx, y1: arrow.y2, x2: cx - head, y2: arrow.y2 - dir * head },
      { x1: cx, y1: arrow.y2, x2: cx + head, y2: arrow.y2 - dir * head },
    ],
    label: goingUp ? "UP" : "DN",
    labelAt: { x: cx, y: fromY - dir * 1.1 },
    nameAt: longestClearStretch(room, y0, y1, cx),
  };
}

function longestClearStretch(room: Room, flightStart: number, flightEnd: number, cx: number): { x: number; y: number; span: number } {
  const before = flightStart - room.y;
  const after = room.y + room.h - flightEnd;
  // Leave ~2ft for the UP/DN label sitting in the landing right next to the flight.
  return before > after
    ? { x: cx, y: room.y + (before - 2) / 2, span: Math.max(0, before - 2) }
    : { x: cx, y: flightEnd + 2 + (after - 2) / 2, span: Math.max(0, after - 2) };
}
