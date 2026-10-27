import type { Door, FloorPlan, FurnitureItem, Room, RoomType } from "./layout/types";
import { FURNITURE_CATALOG } from "./layout/furniture";
import { furnitureIconDetails } from "./furnitureIcon";
import { resolveDoorSwingGeometry } from "./layout/doorSwings";

export const ROOM_FILL: Partial<Record<RoomType, string>> = {
  entry: "#e8e3d8",
  great_room: "#eef2ec",
  living: "#eef2ec",
  kitchen: "#f3ece0",
  dining: "#f0ece4",
  primary_bedroom: "#e4eef2",
  bedroom: "#e9f1f4",
  primary_bath: "#dbe9ea",
  bath: "#e2eeef",
  half_bath: "#e2eeef",
  hallway: "#f6f5f2",
  office: "#ece6f2",
  garage: "#dfdfdc",
  closet: "#ececec",
  courtyard: "#d7e6cf", // real open void — a garden-green tint, not a room shade
};

export const SVG_SCALE = 10; // px per foot
export const SVG_PADDING = 40;

/**
 * Pure server-side SVG string renderer — same scale/colors as
 * components/FloorPlanSvg.tsx, usable from scripts (see
 * scripts/render-examples.ts) or a future "export SVG/PNG" API route
 * without pulling in React.
 */
export function floorPlanToSvgString(plan: FloorPlan): string {
  const toPx = (ft: number) => ft * SVG_SCALE;
  const width = toPx(plan.footprint.w) + SVG_PADDING * 2;
  const height = toPx(plan.footprint.h) + SVG_PADDING * 2;

  const rooms = plan.rooms.map((room) => roomToSvg(room, toPx)).join("\n");
  const wallColor = plan.wallColor ?? "#2b2b2b";
  const walls = plan.walls
    .map(
      (w) =>
        `<line x1="${toPx(w.x1)}" y1="${toPx(w.y1)}" x2="${toPx(w.x2)}" y2="${toPx(w.y2)}" stroke="${wallColor}" stroke-width="${
          w.exterior ? 4 : 2
        }" stroke-linecap="square" />`,
    )
    .join("\n");
  const doors = plan.doors.map((d) => doorToSvg(d, plan.rooms, toPx)).join("\n");
  // `windows` is optional on FloorPlan (a plan saved/shared before this field existed
  // — localStorage templates, old share links — won't have it), so always fall back
  // to an empty list rather than crash a renderer handed stale data.
  const windows = (plan.windows ?? []).map((w) => windowToSvg(w, toPx)).join("\n");
  const furniture = (plan.furniture ?? []).map((f) => furnitureToSvg(f, toPx)).join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff" />`,
    `<g transform="translate(${SVG_PADDING}, ${SVG_PADDING})">`,
    rooms,
    walls,
    windows,
    doors,
    furniture,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

/**
 * A door reads as the opening gap plus a real architectural swing symbol — a dashed quarter-circle
 * arc and a solid leaf line from the hinge to the open tip — computed from `computeDoorSwings`'s
 * own hinge/swing-into choice (lib/layout/doorSwings.ts), never redrawn from a separate guess. The
 * arc is sampled as a polyline rather than an SVG elliptical-arc command specifically to sidestep
 * getting the large-arc/sweep flags backwards for an unpredictable mix of hinge sides and swing
 * directions — a plain parametric sweep from 0° to 90° is correct by construction for all of them.
 * Falls back to the plain gap line for a door saved before `hingeSide`/`swingInto` existed.
 */
function doorToSvg(d: Door, rooms: Room[], toPx: (ft: number) => number): string {
  const cx = toPx(d.x);
  const cy = toPx(d.y);
  const half = toPx(d.width) / 2;
  const gapLine =
    d.orientation === "h"
      ? `<line x1="${cx - half}" y1="${cy}" x2="${cx + half}" y2="${cy}" stroke="#ffffff" stroke-width="4" />`
      : `<line x1="${cx}" y1="${cy - half}" x2="${cx}" y2="${cy + half}" stroke="#ffffff" stroke-width="4" />`;

  const geometry = resolveDoorSwingGeometry(d, rooms);
  if (!geometry) return gapLine;

  const { hinge, openTip, closedTip } = geometry;
  const along = { x: (closedTip.x - hinge.x) / d.width, y: (closedTip.y - hinge.y) / d.width };
  const normal = { x: (openTip.x - hinge.x) / d.width, y: (openTip.y - hinge.y) / d.width };
  const steps = 12;
  const arcPoints: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (Math.PI / 2) * (i / steps);
    const px = toPx(hinge.x + d.width * (along.x * Math.cos(angle) + normal.x * Math.sin(angle)));
    const py = toPx(hinge.y + d.width * (along.y * Math.cos(angle) + normal.y * Math.sin(angle)));
    arcPoints.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  const hingePx = { x: toPx(hinge.x), y: toPx(hinge.y) };
  const openPx = { x: toPx(openTip.x), y: toPx(openTip.y) };

  return [
    gapLine,
    `<polyline points="${arcPoints.join(" ")}" fill="none" stroke="#b7b2a3" stroke-width="1" stroke-dasharray="2 2" />`,
    `<line x1="${hingePx.x}" y1="${hingePx.y}" x2="${openPx.x}" y2="${openPx.y}" stroke="#8a8578" stroke-width="1.5" />`,
  ].join("\n");
}

/** A window reads as a pale blue bar with a thin white mullion line down the middle, set into the exterior wall — visually distinct from a door's plain white gap. */
function windowToSvg(w: { x: number; y: number; orientation: "h" | "v"; width: number }, toPx: (ft: number) => number): string {
  const cx = toPx(w.x);
  const cy = toPx(w.y);
  const half = toPx(w.width) / 2;
  if (w.orientation === "h") {
    return [
      `<line x1="${cx - half}" y1="${cy}" x2="${cx + half}" y2="${cy}" stroke="#7fb3d9" stroke-width="5" />`,
      `<line x1="${cx - half}" y1="${cy}" x2="${cx + half}" y2="${cy}" stroke="#ffffff" stroke-width="1.5" />`,
    ].join("\n");
  }
  return [
    `<line x1="${cx}" y1="${cy - half}" x2="${cx}" y2="${cy + half}" stroke="#7fb3d9" stroke-width="5" />`,
    `<line x1="${cx}" y1="${cy - half}" x2="${cx}" y2="${cy + half}" stroke="#ffffff" stroke-width="1.5" />`,
  ].join("\n");
}

function furnitureToSvg(item: FurnitureItem, toPx: (ft: number) => number): string {
  const w = toPx(item.w);
  const h = toPx(item.h);
  const spec = FURNITURE_CATALOG[item.type];
  const details = furnitureIconDetails(item.type);
  const detailSvg = details
    .map((shape) => {
      if (shape.kind === "rect") {
        const dash = shape.dashed ? ` stroke-dasharray="4 3"` : "";
        return `<rect x="${shape.x * w}" y="${shape.y * h}" width="${shape.w * w}" height="${shape.h * h}" fill="${shape.fill === "base" ? spec.color : "none"}" stroke="${shape.stroke ? "#5a5a5a" : "none"}" stroke-width="1" rx="${(shape.rx ?? 0) * Math.min(w, h)}"${dash} />`;
      }
      if (shape.kind === "circle") {
        return `<circle cx="${shape.cx * w}" cy="${shape.cy * h}" r="${shape.r * Math.min(w, h)}" fill="${shape.fill === "base" ? spec.color : "none"}" stroke="#5a5a5a" stroke-width="1" />`;
      }
      return `<line x1="${shape.x1 * w}" y1="${shape.y1 * h}" x2="${shape.x2 * w}" y2="${shape.y2 * h}" stroke="#5a5a5a" stroke-width="1" />`;
    })
    .join("\n");

  return [
    `<g transform="translate(${toPx(item.x)}, ${toPx(item.y)}) rotate(${item.rotation}, ${w / 2}, ${h / 2})">`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${spec.color}" fill-opacity="${item.type === "rug" ? 0.5 : 0.85}" stroke="#5a5a5a" stroke-width="0.75" rx="2" />`,
    detailSvg,
    `</g>`,
  ].join("\n");
}

function roomToSvg(room: Room, toPx: (ft: number) => number): string {
  const x = toPx(room.x);
  const y = toPx(room.y);
  const w = toPx(room.w);
  const h = toPx(room.h);
  const fontSize = Math.round(Math.min(13, Math.max(9, w / 10)) * 10) / 10;
  const fill = room.floorColor ?? ROOM_FILL[room.type] ?? "#f0f0f0";
  const label = escapeXml(room.label);
  const dims = `${room.w.toFixed(1)}' x ${room.h.toFixed(1)}' (${room.areaSqft} sqft)`;
  // Clip text to the room's own rect so a narrow room (e.g. a 4ft entry strip)
  // never bleeds its label/dimensions into the room next to it.
  const clipId = `clip_${room.id}`;

  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#c9c9c9" stroke-width="1" />`,
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" /></clipPath>`,
    `<g clip-path="url(#${clipId})">`,
    // Anchored near the top of the room (not vertically centered) so furniture icons placed in
    // the room body never visually collide with the label — a real overlap bug found by
    // reviewing real rendered screenshots once furniture was added, not assumed away.
    `<text x="${x + w / 2}" y="${y + fontSize + 4}" text-anchor="middle" font-size="${fontSize}" font-weight="600" fill="#2b2b2b">${label}</text>`,
    `<text x="${x + w / 2}" y="${y + fontSize * 2 + 6}" text-anchor="middle" font-size="${fontSize - 2}" fill="#5a5a5a">${escapeXml(dims)}</text>`,
    `</g>`,
  ].join("\n");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
