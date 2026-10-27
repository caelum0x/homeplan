// FloorPlan -> real DXF export, using @tarikjabiri/dxf (MIT, actively
// maintained TypeScript DXF writer). Real DXF entities (LWPOLYLINE for room
// outlines, LINE for walls/doors, TEXT for labels) in feet, on named layers —
// not an SVG dumped into a DXF wrapper.

import { DxfWriter, point2d, point3d, Units } from "@tarikjabiri/dxf";
import type { FloorPlan, FurnitureItem } from "./layout/types";
import { furnitureFootprintCorners, furnitureIconMarks, type PlanPoint } from "./furnitureTransform";

/**
 * Builds a DXF document string for one floor plan. Coordinates are in feet;
 * walls/room outlines/doors/text each live on their own layer so the file
 * opens cleanly in any CAD viewer with layers already organized.
 */
export function floorPlanToDxf(plan: FloorPlan): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Feet);

  dxf.addLayer("ROOMS", 7, "Continuous");
  dxf.addLayer("WALLS", 0, "Continuous"); // 0 = black/white, renders as the current color
  dxf.addLayer("DOORS", 1, "Continuous"); // 1 = red, so openings are visually distinct from walls
  dxf.addLayer("TEXT", 3, "Continuous"); // 3 = green
  dxf.addLayer("FURNITURE", 6, "Continuous"); // 6 = magenta, its own layer so a CAD user can toggle it independently

  // DXF's Y axis points up; our plan's y axis points down the depth of the
  // house from the front wall. Flip so "up" on screen in a CAD viewer
  // matches "up" (toward the street) on the generated SVG.
  const maxY = plan.footprint.h;
  const flip = (y: number) => maxY - y;

  dxf.setCurrentLayerName("ROOMS");
  for (const room of plan.rooms) {
    dxf.addLWPolyline(
      [
        { point: point2d(room.x, flip(room.y)) },
        { point: point2d(room.x + room.w, flip(room.y)) },
        { point: point2d(room.x + room.w, flip(room.y + room.h)) },
        { point: point2d(room.x, flip(room.y + room.h)) },
      ],
      { flags: 1 }, // LWPolylineFlags.Closed
    );
  }

  dxf.setCurrentLayerName("WALLS");
  for (const wall of plan.walls) {
    dxf.addLine(point3d(wall.x1, flip(wall.y1), 0), point3d(wall.x2, flip(wall.y2), 0));
  }

  dxf.setCurrentLayerName("DOORS");
  for (const door of plan.doors) {
    const half = door.width / 2;
    if (door.orientation === "h") {
      dxf.addLine(point3d(door.x - half, flip(door.y), 0), point3d(door.x + half, flip(door.y), 0));
    } else {
      dxf.addLine(point3d(door.x, flip(door.y - half), 0), point3d(door.x, flip(door.y + half), 0));
    }
  }

  dxf.setCurrentLayerName("TEXT");
  const textHeight = 0.8; // feet
  for (const room of plan.rooms) {
    const cx = room.x + room.w / 2;
    const cy = flip(room.y + room.h / 2);
    dxf.addText(point3d(cx, cy + textHeight * 0.6, 0), textHeight, room.label, {
      horizontalAlignment: 1, // Center
    });
    dxf.addText(point3d(cx, cy - textHeight * 0.8, 0), textHeight * 0.7, `${room.w.toFixed(1)}' x ${room.h.toFixed(1)}'`, {
      horizontalAlignment: 1,
    });
  }

  // Furniture draws last, on its own layer — same stacking order lib/renderSvg.ts
  // uses, so the DXF matches the on-screen plan and can be hidden independently.
  dxf.setCurrentLayerName("FURNITURE");
  for (const item of plan.furniture ?? []) {
    drawFurnitureDxf(dxf, item, flip);
  }

  return dxf.stringify();
}

/** Draws one furniture item's real (rotated) footprint + icon-detail marks as real DXF entities. */
function drawFurnitureDxf(dxf: DxfWriter, item: FurnitureItem, flip: (y: number) => number) {
  const toDxfPoint = (p: PlanPoint) => point2d(p.x, flip(p.y));

  const corners = furnitureFootprintCorners(item).map((p) => ({ point: toDxfPoint(p) }));
  dxf.addLWPolyline(corners, { flags: 1 });

  for (const mark of furnitureIconMarks(item)) {
    if (mark.kind === "line") {
      dxf.addLine(point3d(mark.a.x, flip(mark.a.y), 0), point3d(mark.b.x, flip(mark.b.y), 0));
    } else if (mark.kind === "circle") {
      dxf.addCircle(point3d(mark.center.x, flip(mark.center.y), 0), mark.radiusFt);
    } else {
      dxf.addLWPolyline(mark.corners.map((p) => ({ point: toDxfPoint(p) })), { flags: 1 });
    }
  }

  // Label at the item's own (unrotated) center — not worth rotating text for a 90deg-stepped label.
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  dxf.addText(point3d(cx, flip(cy), 0), 0.5, item.label, { horizontalAlignment: 1 });
}
