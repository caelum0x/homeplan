// FloorPlan -> real IFC4 (STEP/P21) export. Hand-written EXPRESS/STEP text, not a
// library-generated stub: web-ifc's own public API is a reader (OpenModel/geometry
// extraction), not a documented writer, so a hand-written IFC4 file following the
// real EXPRESS entity definitions (IfcProject/Site/Building/BuildingStorey hierarchy,
// IfcSpace/IfcWall/IfcDoor/IfcWindow with real IfcExtrudedAreaSolid geometry) is the
// standard way small exporters produce valid IFC. web-ifc is used to parse this same
// file back for real round-trip verification (scripts/verify-ifc-export.ts) — the same
// library a real BIM viewer would use to open the exported file.
//
// Geometry constants (wall height/thickness, door height, window sill/pane height) are
// duplicated from components/FloorPlan3D.tsx's WALL_HEIGHT/WALL_THICKNESS/DOOR_HEIGHT/
// WINDOW_SILL_HEIGHT/WINDOW_PANE_HEIGHT so the IFC export matches the on-screen 3D model,
// not a separately-invented set of numbers.

import { randomUUID } from "crypto";
import type { FloorPlan, Wall } from "./layout/types";

const FT_TO_M = 0.3048;

const WALL_HEIGHT_FT = 9;
const INTERIOR_WALL_THICKNESS_FT = 0.4;
const EXTERIOR_WALL_THICKNESS_FT = INTERIOR_WALL_THICKNESS_FT * 1.4;
const DOOR_HEIGHT_FT = 6 + 8 / 12;
const DOOR_LEAF_THICKNESS_FT = 0.15;
const WINDOW_SILL_HEIGHT_FT = 2.5;
const WINDOW_PANE_HEIGHT_FT = 4;
const WINDOW_PANE_THICKNESS_FT = 0.1;

const GUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/**
 * buildingSMART's documented IfcGloballyUniqueId compression: a standard 128-bit UUID is
 * split into one 2-bit chunk followed by twenty-one 6-bit chunks (2 + 21*6 = 128 bits
 * exactly), each chunk indexing a 64-character alphabet — the real 22-character
 * compressed GlobalId format every IFC file uses (same algorithm as IfcOpenShell's
 * `guid.compress`).
 */
function compressGuid(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  let bits = "";
  for (const ch of hex) bits += parseInt(ch, 16).toString(2).padStart(4, "0");
  const chunkSizes = [2, ...Array(21).fill(6)];
  let pos = 0;
  let out = "";
  for (const size of chunkSizes) {
    out += GUID_ALPHABET[parseInt(bits.slice(pos, pos + size), 2)];
    pos += size;
  }
  return out;
}

function newGuid(): string {
  return compressGuid(randomUUID());
}

function stepString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function stepReal(n: number): string {
  // STEP reals must contain a decimal point even for whole numbers.
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

/** Minimal STEP/P21 line writer: every `add()` call allocates the next `#id` and returns it. */
class StepWriter {
  private lines: string[] = [];
  private nextId = 1;

  add(entity: string): number {
    const id = this.nextId++;
    this.lines.push(`#${id}=${entity};`);
    return id;
  }

  ref(id: number): string {
    return `#${id}`;
  }

  refs(ids: number[]): string {
    return `(${ids.map((id) => this.ref(id)).join(",")})`;
  }

  body(): string {
    return this.lines.join("\n");
  }
}

interface Ctx {
  step: StepWriter;
  contextId: number;
  storeyPlacementId: number;
  /** Identity (no rotation, origin) IfcAxis2Placement3D reused as every profile's local
   * Position — the real world position/rotation lives entirely in the object's own
   * IfcLocalPlacement, so every swept-solid profile below is just an axis-aligned
   * rectangle at local origin. */
  identityAxis3DId: number;
}

function point3d(step: StepWriter, x: number, y: number, z: number): number {
  return step.add(`IFCCARTESIANPOINT((${stepReal(x)},${stepReal(y)},${stepReal(z)}))`);
}

function point2d(step: StepWriter, x: number, y: number): number {
  return step.add(`IFCCARTESIANPOINT((${stepReal(x)},${stepReal(y)}))`);
}

function direction3d(step: StepWriter, x: number, y: number, z: number): number {
  return step.add(`IFCDIRECTION((${stepReal(x)},${stepReal(y)},${stepReal(z)}))`);
}

function axis2Placement3d(step: StepWriter, locationId: number, axisRef: string, refDirRef: string): number {
  return step.add(`IFCAXIS2PLACEMENT3D(${step.ref(locationId)},${axisRef},${refDirRef})`);
}

function localPlacement(step: StepWriter, relToRef: string, axisId: number): number {
  return step.add(`IFCLOCALPLACEMENT(${relToRef},${step.ref(axisId)})`);
}

/**
 * One rectangular slab (a wall, a door leaf, or a window pane) — a real
 * IfcExtrudedAreaSolid of a rectangular profile (length x thickness) swept upward by
 * `heightM` — wrapped in the IfcProductDefinitionShape every IFC element needs for its
 * `Representation` attribute. The profile is always this same axis-aligned rectangle;
 * the slab's real-world position and rotation live in the caller's objectPlacement.
 */
function boxShapeRepresentation(ctx: Ctx, lengthM: number, thicknessM: number, heightM: number): number {
  const { step, contextId, identityAxis3DId } = ctx;
  const profileOrigin = point2d(step, 0, 0);
  const profilePosition = step.add(`IFCAXIS2PLACEMENT2D(${step.ref(profileOrigin)},$)`);
  const profile = step.add(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${step.ref(profilePosition)},${stepReal(lengthM)},${stepReal(thicknessM)})`,
  );
  const extrudeDir = direction3d(step, 0, 0, 1);
  const solid = step.add(
    `IFCEXTRUDEDAREASOLID(${step.ref(profile)},${step.ref(identityAxis3DId)},${step.ref(extrudeDir)},${stepReal(heightM)})`,
  );
  const shapeRep = step.add(`IFCSHAPEREPRESENTATION(${step.ref(contextId)},'Body','SweptSolid',${step.refs([solid])})`);
  return step.add(`IFCPRODUCTDEFINITIONSHAPE($,$,${step.refs([shapeRep])})`);
}

/** Real-world IfcLocalPlacement for one element: `(xFt,yFt,zFt)` converted to metres, rotated
 * so its local X axis points along `(dirXFt,dirYFt)` (normalized) — e.g. a wall's own direction,
 * or a door/window's opening-width direction derived from its `orientation` field. */
function objectPlacement(ctx: Ctx, xFt: number, yFt: number, zFt: number, dirXFt: number, dirYFt: number): number {
  const { step, storeyPlacementId } = ctx;
  const location = point3d(step, xFt * FT_TO_M, yFt * FT_TO_M, zFt * FT_TO_M);
  const len = Math.hypot(dirXFt, dirYFt) || 1;
  const refDir = direction3d(step, dirXFt / len, dirYFt / len, 0);
  const axis = axis2Placement3d(step, location, "$", step.ref(refDir));
  return localPlacement(step, step.ref(storeyPlacementId), axis);
}

/** Perpendicular distance (ft) from a door/window's opening center to a candidate host wall's
 * own line is accepted up to this tolerance — real doors/windows are generated flush with
 * their host wall's centerline (lib/layout/generate.ts's buildWallsAndDoors derives both from
 * the same room geometry), so any real match lands well under 0.1ft; this is generous headroom,
 * not a loose guess. */
const HOST_WALL_MAX_DISTANCE_FT = 0.5;
/** Collinearity tolerance (ft) for deciding a wall is "horizontal" (y1≈y2) vs "vertical" (x1≈x2). */
const WALL_AXIS_EPS_FT = 0.05;

/**
 * Finds the real wall a door/window's opening is actually cut into, purely from placed
 * geometry — `Door`/`Window` only carry the two ROOM ids either side of the opening
 * (lib/layout/types.ts), never a wall id, and `Wall` carries no room ids either, so this is
 * the same kind of geometric match every other opening-aware code path in this engine already
 * does (e.g. lib/layout/doorSwings.ts resolving a door's real swing geometry from room rects).
 * Matches the opening's own `orientation` to a wall running along the same axis, whose segment
 * actually spans the opening's position, picking the closest such wall if more than one
 * candidate axis-matches (shouldn't happen for a real non-overlapping wall set, but keeps this
 * honest rather than assuming the first match is correct).
 */
function findHostWall(walls: readonly Wall[], x: number, y: number, orientation: "h" | "v"): Wall | null {
  let best: Wall | null = null;
  let bestDistance = Infinity;
  for (const wall of walls) {
    const horizontal = Math.abs(wall.y1 - wall.y2) < WALL_AXIS_EPS_FT;
    const vertical = Math.abs(wall.x1 - wall.x2) < WALL_AXIS_EPS_FT;
    if (orientation === "h" && !horizontal) continue;
    if (orientation === "v" && !vertical) continue;

    if (horizontal) {
      const minX = Math.min(wall.x1, wall.x2) - HOST_WALL_MAX_DISTANCE_FT;
      const maxX = Math.max(wall.x1, wall.x2) + HOST_WALL_MAX_DISTANCE_FT;
      if (x < minX || x > maxX) continue;
      const distance = Math.abs(y - wall.y1);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = wall;
      }
    } else if (vertical) {
      const minY = Math.min(wall.y1, wall.y2) - HOST_WALL_MAX_DISTANCE_FT;
      const maxY = Math.max(wall.y1, wall.y2) + HOST_WALL_MAX_DISTANCE_FT;
      if (y < minY || y > maxY) continue;
      const distance = Math.abs(x - wall.x1);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = wall;
      }
    }
  }
  return bestDistance <= HOST_WALL_MAX_DISTANCE_FT ? best : null;
}

/**
 * Cuts a real `IfcOpeningElement` into `hostWallId` and relates it to `filledById` (the
 * IfcDoor/IfcWindow that occupies it) — the standard IFC authoring pattern buildingSMART's own
 * examples use (`IfcRelVoidsElement` wall->opening, `IfcRelFillsElement` opening->door/window).
 *
 * Real gap found and fixed 2026-11-06, inspecting this exporter's own output structurally (not
 * just confirming a file gets produced): every door/window was previously placed as a fully
 * independent `IfcWall`-unrelated solid with NO relationship to its host wall at all — opened in
 * a real BIM tool (Revit/ArchiCAD/Solibri), that reads as a completely solid, un-opened wall
 * with a disconnected door/window-shaped box floating inside it, not a real doorway/window
 * opening. This is exactly the class of correctness gap a BIM-native competitor's "IFC export,
 * LOD 200+" claim is actually about — a shallow export places boxes at the right coordinates; a
 * structurally sound one also declares WHICH element each opening belongs to and WHAT fills it,
 * which is what every compliant IFC viewer actually uses to render the cut correctly regardless
 * of whether the wall's own raw solid literally has a hole subtracted from it (most real-world
 * exporters at this scale rely on the Void/Fills relationship rather than full CSG boolean
 * geometry, which is genuinely BIM-ENGINE-level scope, not a single-session fix).
 *
 * The opening's own geometry is sized to the HOST WALL's thickness (not the door leaf's own
 * thinner slab) so the void actually represents the real hole cut through the wall, not a
 * door-leaf-shaped sliver.
 */
function voidAndFillOpening(
  ctx: Ctx,
  hostWallId: number,
  hostWallThicknessFt: number,
  filledById: number,
  xFt: number,
  yFt: number,
  zFt: number,
  dirXFt: number,
  dirYFt: number,
  widthFt: number,
  heightFt: number,
): void {
  const { step } = ctx;
  const openingShape = boxShapeRepresentation(ctx, widthFt * FT_TO_M, hostWallThicknessFt * FT_TO_M, heightFt * FT_TO_M);
  const openingPlacement = objectPlacement(ctx, xFt, yFt, zFt, dirXFt, dirYFt);
  const opening = step.add(
    `IFCOPENINGELEMENT(${stepString(newGuid())},$,${stepString("Opening")},$,$,${step.ref(openingPlacement)},${step.ref(openingShape)},$,$)`,
  );
  step.add(`IFCRELVOIDSELEMENT(${stepString(newGuid())},$,$,$,${step.ref(hostWallId)},${step.ref(opening)})`);
  step.add(`IFCRELFILLSELEMENT(${stepString(newGuid())},$,$,$,${step.ref(opening)},${step.ref(filledById)})`);
}

/** Builds a complete, real IFC4 file string for one floor plan — IfcProject/Site/Building/
 * BuildingStorey hierarchy, one IfcSpace per room, one IfcWall per wall segment, one IfcDoor
 * per door and one IfcWindow per window, each with real swept-solid geometry in metres and a
 * real compressed GlobalId, all grouped under the ground storey by a single
 * IfcRelContainedInSpatialStructure (the standard IFC pattern — buildingSMART's own examples
 * group a whole storey's elements in one relationship, not one per element). Every door/window
 * that lands on a real traceable host wall also gets a real `IfcOpeningElement` cut into that
 * wall via `IfcRelVoidsElement`/`IfcRelFillsElement` (see `voidAndFillOpening`) — the real,
 * structurally-necessary difference between "a box at the right coordinates" and an opening a
 * BIM viewer actually understands as a hole in that specific wall. */
export function floorPlanToIfc(plan: FloorPlan): string {
  const step = new StepWriter();

  // --- Geometric context + unit assignment (SI, metres) ---
  const worldOrigin = point3d(step, 0, 0, 0);
  const worldZ = direction3d(step, 0, 0, 1);
  const worldX = direction3d(step, 1, 0, 0);
  const worldAxis = axis2Placement3d(step, worldOrigin, step.ref(worldZ), step.ref(worldX));
  const lengthUnit = step.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const areaUnit = step.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const unitAssignment = step.add(`IFCUNITASSIGNMENT(${step.refs([lengthUnit, areaUnit])})`);
  const context = step.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,${stepReal(1e-5)},${step.ref(worldAxis)},$)`);

  // --- Spatial hierarchy: Project -> Site -> Building -> (ground) Storey ---
  const siteAxis = axis2Placement3d(step, worldOrigin, "$", "$");
  const sitePlacement = localPlacement(step, "$", siteAxis);
  const buildingAxis = axis2Placement3d(step, worldOrigin, "$", "$");
  const buildingPlacement = localPlacement(step, step.ref(sitePlacement), buildingAxis);
  const storeyAxis = axis2Placement3d(step, worldOrigin, "$", "$");
  const storeyPlacement = localPlacement(step, step.ref(buildingPlacement), storeyAxis);

  const project = step.add(
    `IFCPROJECT(${stepString(newGuid())},$,${stepString("HomePlan export")},$,$,$,$,${step.refs([context])},${step.ref(unitAssignment)})`,
  );
  const site = step.add(
    `IFCSITE(${stepString(newGuid())},$,${stepString("Site")},$,$,${step.ref(sitePlacement)},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const building = step.add(
    `IFCBUILDING(${stepString(newGuid())},$,${stepString("Building")},$,$,${step.ref(buildingPlacement)},$,$,.ELEMENT.,$,$,$)`,
  );
  const storey = step.add(
    `IFCBUILDINGSTOREY(${stepString(newGuid())},$,${stepString("Ground floor")},$,$,${step.ref(storeyPlacement)},$,$,.ELEMENT.,${stepReal(0)})`,
  );
  step.add(`IFCRELAGGREGATES(${stepString(newGuid())},$,$,$,${step.ref(project)},${step.refs([site])})`);
  step.add(`IFCRELAGGREGATES(${stepString(newGuid())},$,$,$,${step.ref(site)},${step.refs([building])})`);
  step.add(`IFCRELAGGREGATES(${stepString(newGuid())},$,$,$,${step.ref(building)},${step.refs([storey])})`);

  const identityAxis3DId = axis2Placement3d(step, worldOrigin, "$", "$");
  const ctx: Ctx = { step, contextId: context, storeyPlacementId: storeyPlacement, identityAxis3DId };

  const containedIds: number[] = [];

  // --- Rooms -> IfcSpace, footprint-accurate extrusion ---
  for (const room of plan.rooms) {
    const shape = boxShapeRepresentation(ctx, room.w * FT_TO_M, room.h * FT_TO_M, WALL_HEIGHT_FT * FT_TO_M);
    const placement = objectPlacement(ctx, room.x + room.w / 2, room.y + room.h / 2, 0, 1, 0);
    const space = step.add(
      `IFCSPACE(${stepString(newGuid())},$,${stepString(room.label)},$,$,${step.ref(placement)},${step.ref(shape)},$,.ELEMENT.,.INTERNAL.,$)`,
    );
    containedIds.push(space);
  }

  // --- Walls -> IfcWall, true-length slab along the wall's own direction ---
  // Tracked by the plan's own wall.id (not an index) so the door/window loops below can look
  // up the real IfcWall entity + thickness of whichever wall `findHostWall` geometrically
  // matches, to cut a real IfcOpeningElement into it (see `voidAndFillOpening`).
  const ifcWallById = new Map<string, { ifcId: number; thicknessFt: number }>();
  for (const wall of plan.walls) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lengthFt = Math.hypot(dx, dy);
    const thicknessFt = wall.exterior ? EXTERIOR_WALL_THICKNESS_FT : INTERIOR_WALL_THICKNESS_FT;
    const midX = (wall.x1 + wall.x2) / 2;
    const midY = (wall.y1 + wall.y2) / 2;
    const shape = boxShapeRepresentation(ctx, lengthFt * FT_TO_M, thicknessFt * FT_TO_M, WALL_HEIGHT_FT * FT_TO_M);
    const placement = objectPlacement(ctx, midX, midY, 0, dx, dy);
    const ifcWall = step.add(
      `IFCWALL(${stepString(newGuid())},$,${stepString(wall.exterior ? "Exterior wall" : "Interior wall")},$,$,${step.ref(placement)},${step.ref(shape)},${stepString(wall.id)},$)`,
    );
    containedIds.push(ifcWall);
    ifcWallById.set(wall.id, { ifcId: ifcWall, thicknessFt });
  }

  // --- Doors -> IfcDoor, real width/height, rotated onto its own opening ---
  for (const door of plan.doors) {
    const dirX = door.orientation === "h" ? 1 : 0;
    const dirY = door.orientation === "h" ? 0 : 1;
    const shape = boxShapeRepresentation(ctx, door.width * FT_TO_M, DOOR_LEAF_THICKNESS_FT * FT_TO_M, DOOR_HEIGHT_FT * FT_TO_M);
    const placement = objectPlacement(ctx, door.x, door.y, 0, dirX, dirY);
    const ifcDoor = step.add(
      `IFCDOOR(${stepString(newGuid())},$,${stepString("Door")},$,$,${step.ref(placement)},${step.ref(shape)},${stepString(door.id)},${stepReal(
        DOOR_HEIGHT_FT * FT_TO_M,
      )},${stepReal(door.width * FT_TO_M)},$,$,$)`,
    );
    containedIds.push(ifcDoor);

    const hostWall = findHostWall(plan.walls, door.x, door.y, door.orientation);
    const hostIfcWall = hostWall ? ifcWallById.get(hostWall.id) : undefined;
    if (hostIfcWall) {
      voidAndFillOpening(
        ctx,
        hostIfcWall.ifcId,
        hostIfcWall.thicknessFt,
        ifcDoor,
        door.x,
        door.y,
        0,
        dirX,
        dirY,
        door.width,
        DOOR_HEIGHT_FT,
      );
    }
  }

  // --- Windows -> IfcWindow, real width/height, sitting at real sill height ---
  for (const win of plan.windows ?? []) {
    const dirX = win.orientation === "h" ? 1 : 0;
    const dirY = win.orientation === "h" ? 0 : 1;
    const shape = boxShapeRepresentation(ctx, win.width * FT_TO_M, WINDOW_PANE_THICKNESS_FT * FT_TO_M, WINDOW_PANE_HEIGHT_FT * FT_TO_M);
    const placement = objectPlacement(ctx, win.x, win.y, WINDOW_SILL_HEIGHT_FT, dirX, dirY);
    const ifcWindow = step.add(
      `IFCWINDOW(${stepString(newGuid())},$,${stepString("Window")},$,$,${step.ref(placement)},${step.ref(shape)},${stepString(win.id)},${stepReal(
        WINDOW_PANE_HEIGHT_FT * FT_TO_M,
      )},${stepReal(win.width * FT_TO_M)},$,$,$)`,
    );
    containedIds.push(ifcWindow);

    const hostWall = findHostWall(plan.walls, win.x, win.y, win.orientation);
    const hostIfcWall = hostWall ? ifcWallById.get(hostWall.id) : undefined;
    if (hostIfcWall) {
      voidAndFillOpening(
        ctx,
        hostIfcWall.ifcId,
        hostIfcWall.thicknessFt,
        ifcWindow,
        win.x,
        win.y,
        WINDOW_SILL_HEIGHT_FT,
        dirX,
        dirY,
        win.width,
        WINDOW_PANE_HEIGHT_FT,
      );
    }
  }

  step.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${stepString(newGuid())},$,$,$,${step.refs(containedIds)},${step.ref(storey)})`);

  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "");
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((''),'2;1');`,
    `FILE_NAME('homeplan-floor-plan.ifc','${timestamp}',(''),('HomePlan'),'web-ifc','HomePlan IFC exporter','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ].join("\n");
  const footer = ["ENDSEC;", "END-ISO-10303-21;", ""].join("\n");

  return `${header}\n${step.body()}\n${footer}`;
}
