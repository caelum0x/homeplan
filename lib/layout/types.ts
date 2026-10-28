// Core data types for HomePlan's floor plan generation engine.
// Everything here is plain, serializable data — no classes, no mutation.

export type RoomType =
  | "entry"
  | "great_room" // open-plan living + kitchen + dining merged
  | "living"
  | "kitchen"
  | "dining"
  | "primary_bedroom"
  | "bedroom"
  | "primary_bath"
  | "bath"
  | "half_bath"
  | "hallway"
  | "office"
  | "garage"
  | "closet"
  | "courtyard"
  // Multi-story only (lib/layout/multiStory.ts): the stair strip on the ground floor and
  // the identical-footprint landing strip directly above it on the upper floor.
  | "stairs";

export interface Room {
  id: string;
  type: RoomType;
  label: string;
  /** Feet, origin at the footprint's top-left corner (0,0), x = across the front, y = depth from the front wall. */
  x: number;
  y: number;
  w: number;
  h: number;
  areaSqft: number;
  /** Optional override of the default per-type fill color (materials picker) — a hex string, e.g. "#e8d9c4" for oak floor. Undefined = use the default ROOM_FILL for this room's type. */
  floorColor?: string;
  /**
   * Only set on "stairs" rooms (lib/layout/multiStory.ts). The actual stair flight inside the
   * strip, relative to the room's own top edge (room.y) so it survives a Studio move: treads run
   * along the room's long (y) axis from `start` for `length` feet. `bottomAt` says which end of
   * the flight is the bottom step ("start" = the smaller-y end). Identical on both floors of a
   * multi-story plan — on the ground floor it's the stair you climb, on the upper floor it's the
   * open stairwell you arrive through. Optional so every pre-existing plan still parses.
   */
  stairRun?: { start: number; length: number; bottomAt: "start" | "end"; floor: "lower" | "upper" };
}

export type FurnitureType =
  | "bed_queen"
  | "bed_single"
  | "sofa"
  | "armchair"
  | "coffee_table"
  | "dining_table"
  | "dining_chair"
  | "desk"
  | "office_chair"
  | "wardrobe"
  | "dresser"
  | "nightstand"
  | "tv_stand"
  | "bookshelf"
  | "kitchen_island"
  | "fridge"
  | "stove"
  | "sink_kitchen"
  | "toilet"
  | "bathtub"
  | "shower"
  | "sink_bath"
  | "rug";

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  label: string;
  /** Feet, same coordinate system as Room — absolute, not room-relative, so furniture can be dragged freely. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, rotation around the piece's own center. */
  rotation: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Exterior walls render thicker than interior partitions. */
  exterior: boolean;
}

export interface Door {
  id: string;
  /** Midpoint of the opening, in feet. */
  x: number;
  y: number;
  /** "h" = door sits on a horizontal wall (swings north/south), "v" = on a vertical wall. */
  orientation: "h" | "v";
  width: number;
  /** Room ids on each side of the opening, for reasoning/debugging. */
  connects: [string, string];
  /** Which end of the opening the leaf hinges on — computed by `computeDoorSwings`
   * (lib/layout/doorSwings.ts) by scoring real clearance against placed furniture.
   * Optional so a plan saved/shared before this existed (old share links, localStorage
   * templates) still parses instead of crashing a renderer that expects it. */
  hingeSide?: "start" | "end";
  /** Room id the leaf swings into (never "exterior"). See `hingeSide`. */
  swingInto?: string;
}

export interface Window {
  id: string;
  /** Midpoint of the opening, in feet. */
  x: number;
  y: number;
  /** "h" = window sits on a horizontal (front/back-facing) exterior wall, "v" = on a vertical (side-facing) one. */
  orientation: "h" | "v";
  width: number;
}

export interface FloorPlan {
  footprint: { w: number; h: number };
  totalAreaSqft: number;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  warnings: string[];
  /** Placed furniture — always present (possibly empty) so every plan, generated or hand-built, has a stable shape. */
  furniture: FurnitureItem[];
  /**
   * Derived from the plan's own exterior-wall geometry (see lib/layout/windows.ts) —
   * optional so a plan object saved/shared before this field existed (localStorage
   * templates, old share links) still parses instead of crashing a renderer that
   * expects it; every renderer reads it as `plan.windows ?? []`.
   */
  windows?: Window[];
  /** Optional override of the default exterior/interior wall color (materials picker). Undefined = the renderer's default. */
  wallColor?: string;
}

export interface BriefInput {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  openPlan: boolean;
  hasGarage: boolean;
  hasOffice: boolean;
  hasDining: boolean;
  raw: string;
  /**
   * Number of above-grade floors. Undefined or 1 = the original single-story engine
   * (generateFloorPlan), completely unchanged. 2 = lib/layout/multiStory.ts: public rooms +
   * garage on the ground floor, bedrooms/baths upstairs, one shared footprint and a vertically
   * aligned stair.
   */
  stories?: 1 | 2;
  /**
   * Real L-shaped massing (lib/layout/generate.ts's L_SHAPE_SETBACK_* constants): the
   * private (bedroom) zone is laid out narrower than the public zone above it, stepped in
   * on one side — a genuine non-rectangular footprint, not a cosmetic relabeling. Undefined
   * or false = the original rectangular footprint, unchanged. v1 scope: single-story only
   * (ignored by lib/layout/multiStory.ts) and mutually exclusive with the courtyard
   * topology (see pickPrivateTopology).
   */
  lShaped?: boolean;
}
