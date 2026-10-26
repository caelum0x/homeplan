import type { FloorPlan, Room, RoomType } from "./layout/types";

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
  const walls = plan.walls
    .map(
      (w) =>
        `<line x1="${toPx(w.x1)}" y1="${toPx(w.y1)}" x2="${toPx(w.x2)}" y2="${toPx(w.y2)}" stroke="#2b2b2b" stroke-width="${
          w.exterior ? 4 : 2
        }" stroke-linecap="square" />`,
    )
    .join("\n");
  const doors = plan.doors
    .map((d) => {
      const cx = toPx(d.x);
      const cy = toPx(d.y);
      const half = toPx(d.width) / 2;
      return d.orientation === "h"
        ? `<line x1="${cx - half}" y1="${cy}" x2="${cx + half}" y2="${cy}" stroke="#ffffff" stroke-width="4" />`
        : `<line x1="${cx}" y1="${cy - half}" x2="${cx}" y2="${cy + half}" stroke="#ffffff" stroke-width="4" />`;
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff" />`,
    `<g transform="translate(${SVG_PADDING}, ${SVG_PADDING})">`,
    rooms,
    walls,
    doors,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

function roomToSvg(room: Room, toPx: (ft: number) => number): string {
  const x = toPx(room.x);
  const y = toPx(room.y);
  const w = toPx(room.w);
  const h = toPx(room.h);
  const fontSize = Math.round(Math.min(13, Math.max(9, w / 10)) * 10) / 10;
  const fill = ROOM_FILL[room.type] ?? "#f0f0f0";
  const label = escapeXml(room.label);
  const dims = `${room.w.toFixed(1)}' x ${room.h.toFixed(1)}' (${room.areaSqft} sqft)`;
  // Clip text to the room's own rect so a narrow room (e.g. a 4ft entry strip)
  // never bleeds its label/dimensions into the room next to it.
  const clipId = `clip_${room.id}`;

  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#c9c9c9" stroke-width="1" />`,
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" /></clipPath>`,
    `<g clip-path="url(#${clipId})">`,
    `<text x="${x + w / 2}" y="${y + h / 2 - 6}" text-anchor="middle" font-size="${fontSize}" font-weight="600" fill="#2b2b2b">${label}</text>`,
    `<text x="${x + w / 2}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="${fontSize - 2}" fill="#5a5a5a">${escapeXml(dims)}</text>`,
    `</g>`,
  ].join("\n");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
