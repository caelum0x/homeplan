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
  | "closet";

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
}
