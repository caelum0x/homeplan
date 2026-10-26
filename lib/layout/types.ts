// Core data types for Planforge's floor plan generation engine.
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
