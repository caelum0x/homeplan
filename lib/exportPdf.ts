// SVG/room-geometry -> real vector PDF export, using pdf-lib (MIT, OSS).
// Draws the same rooms/walls/doors the web UI renders — not a screenshot of
// the SVG, real vector rectangles/lines/text placed from the plan's actual
// coordinates, so dimensions stay crisp and selectable at any zoom level.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { FloorPlan, Room } from "./layout/types";

const MARGIN = 36; // points
const PAGE_W = 792; // US Letter, landscape
const PAGE_H = 612;

// Same palette as ROOM_FILL in lib/renderSvg.ts, converted to 0-1 RGB for pdf-lib.
const ROOM_FILL_RGB: Partial<Record<Room["type"], [number, number, number]>> = {
  entry: [0.91, 0.89, 0.85],
  great_room: [0.93, 0.95, 0.92],
  living: [0.93, 0.95, 0.92],
  kitchen: [0.95, 0.93, 0.88],
  dining: [0.94, 0.93, 0.89],
  primary_bedroom: [0.89, 0.93, 0.95],
  bedroom: [0.91, 0.95, 0.96],
  primary_bath: [0.86, 0.91, 0.92],
  bath: [0.89, 0.93, 0.94],
  half_bath: [0.89, 0.93, 0.94],
  hallway: [0.96, 0.96, 0.95],
  office: [0.93, 0.9, 0.95],
  garage: [0.87, 0.87, 0.86],
  closet: [0.93, 0.93, 0.93],
};

/** Builds a real multi-element vector PDF (not a screenshot) for one floor plan. Returns the raw PDF bytes. */
export async function floorPlanToPdf(plan: FloorPlan): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const drawableW = PAGE_W - MARGIN * 2;
  const drawableH = PAGE_H - MARGIN * 2 - 40; // reserve 40pt header for title/meta
  const scale = Math.min(drawableW / Math.max(plan.footprint.w, 1), drawableH / Math.max(plan.footprint.h, 1));

  const originX = MARGIN;
  const originY = MARGIN; // bottom-left of the drawing area in PDF space

  const toPt = (ft: number) => ft * scale;
  // PDF y-axis points up from the bottom; our plan's y-axis points down from the front wall.
  const planHeightPt = toPt(plan.footprint.h);
  const px = (x: number) => originX + toPt(x);
  const py = (y: number) => originY + (planHeightPt - toPt(y));

  page.drawText("HomePlan — generated floor plan", {
    x: MARGIN,
    y: PAGE_H - MARGIN + 10,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(
    `Footprint: ${plan.footprint.w}' x ${plan.footprint.h}'  ·  Total: ${plan.totalAreaSqft} sqft  ·  ${plan.rooms.length} rooms`,
    { x: MARGIN, y: PAGE_H - MARGIN - 6, size: 10, font, color: rgb(0.35, 0.35, 0.35) },
  );

  for (const room of plan.rooms) {
    const fillArr = ROOM_FILL_RGB[room.type] ?? [0.94, 0.94, 0.94];
    const x = px(room.x);
    const yTop = py(room.y); // top edge in PDF space (y of the room's min-y)
    const w = toPt(room.w);
    const h = toPt(room.h);
    const yBottom = yTop - h;

    page.drawRectangle({
      x,
      y: yBottom,
      width: w,
      height: h,
      color: rgb(fillArr[0], fillArr[1], fillArr[2]),
      borderColor: rgb(0.79, 0.79, 0.79),
      borderWidth: 0.75,
    });

    drawCenteredText(page, room.label, x + w / 2, yBottom + h / 2 + 5, font, Math.min(10, Math.max(6, w / 9)));
    drawCenteredText(
      page,
      `${room.w.toFixed(1)}' x ${room.h.toFixed(1)}' (${room.areaSqft} sqft)`,
      x + w / 2,
      yBottom + h / 2 - 7,
      font,
      Math.max(5, Math.min(8, w / 10)),
    );
  }

  for (const wall of plan.walls) {
    page.drawLine({
      start: { x: px(wall.x1), y: py(wall.y1) },
      end: { x: px(wall.x2), y: py(wall.y2) },
      thickness: wall.exterior ? 2.2 : 1.1,
      color: rgb(0.17, 0.17, 0.17),
    });
  }

  for (const door of plan.doors) {
    const cx = px(door.x);
    const cy = py(door.y);
    const half = toPt(door.width) / 2;
    if (door.orientation === "h") {
      page.drawLine({ start: { x: cx - half, y: cy }, end: { x: cx + half, y: cy }, thickness: 2.2, color: rgb(1, 1, 1) });
    } else {
      page.drawLine({ start: { x: cx, y: cy - half }, end: { x: cx, y: cy + half }, thickness: 2.2, color: rgb(1, 1, 1) });
    }
  }

  return doc.save();
}

function drawCenteredText(page: PDFPage, text: string, cx: number, y: number, font: PDFFont, size: number) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - width / 2, y, size, font, color: rgb(0.2, 0.2, 0.2) });
}
