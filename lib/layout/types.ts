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
  /**
   * Overrides the generic per-`RoomType` comfortable-minimum (program.ts's MIN_AREA
   * table) that `checkMinimums` would otherwise cite. Set whenever a ProgramRoom's own
   * `minArea` was deliberately changed from that type's house-scale default — currently
   * only the studio sleeping-nook override (buildRoomProgram). Without this, a studio's
   * intentionally-smaller "Sleeping Area" (target ~64 sqft) got measured against the
   * full house "Primary Bedroom" minimum (140 sqft) the warning text itself quoted,
   * which was simply the wrong number for what this room was actually trying to be —
   * found live, 2026-11-05, generating a real studio-apartment brief end to end.
   */
  minAreaOverride?: number;
  /** Optional override of the default per-type fill color (materials picker) — a hex string, e.g. "#e8d9c4" for oak floor. Undefined = use the default ROOM_FILL for this room's type. */
  floorColor?: string;
  /**
   * Only set on "stairs" rooms (lib/layout/multiStory.ts). The actual stair flight inside the
   * strip, relative to the room's own top-left edge (room.x/room.y) so it survives a Studio move:
   * treads run along `axis` from `start` for `length` feet, measured from that edge. `bottomAt`
   * says which end of the flight is the bottom step ("start" = the smaller-coordinate end along
   * `axis`). Identical on both floors of a multi-story plan — on the ground floor it's the stair
   * you climb, on the upper floor it's the open stairwell you arrive through. Optional so every
   * pre-existing plan still parses.
   *
   * `axis` defaults to "y" (every freshly-generated plan's own convention — the flight always
   * runs along the room's depth) when absent, so pre-existing plans/share links still render
   * exactly as before. It only ever becomes "x" after lib/layout/lotFit.ts rotates a multi-story
   * plan by 90/270 degrees to fit a lot, which swaps which global axis the flight travels along —
   * see that file's transformStairRun for the real geometry that derives it, never carried over
   * unchanged.
   */
  stairRun?: { start: number; length: number; bottomAt: "start" | "end"; floor: "lower" | "upper"; axis?: "x" | "y" };
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
  /**
   * Manual opening overrides -- Maket.ai's "canvas-based wall and opening adjustments"
   * (add/remove/move a door or window independent of the auto-derived geometry). Every
   * window/door is still *derived* from real room geometry by default (lib/layout/windows.ts,
   * lib/layout/edit.ts's buildWallsAndDoorsFromGeometry); these three fields are the honest
   * "a human overrode this specific opening" overlay applied every recompute() so the
   * override survives a later drag/resize of an unrelated room. See lib/layout/edit.ts's
   * "manual opening overlay" section for the real read/write rules. All optional so every
   * pre-existing plan (old share links, localStorage templates, freshly generated plans)
   * still parses with the exact same behavior as before this existed.
   */
  manualWindows?: Window[];
  /** Keys (`${orientation}:${x}:${y}`, see edit.ts's windowKey) of auto-derived windows a human explicitly removed. */
  removedWindowKeys?: string[];
  /** Keys (sorted `connects` pair joined by `|`, see edit.ts's doorKey) of doors a human explicitly removed. */
  removedDoorKeys?: string[];
}

/**
 * The private (bedroom) zone's genuinely distinct layout shapes — see
 * `listEligibleTopologies`/`resolvePrivateTopology` in `lib/layout/generate.ts` for the
 * full real documentation of what each one means and when it's structurally eligible.
 * Defined here (not in generate.ts, which is where it conceptually belongs and where it's
 * re-exported from) so `BriefInput.styleTopologyPreferences` below can reference it without
 * types.ts importing from generate.ts — generate.ts already imports `BriefInput` etc. from
 * this file, so the reverse import would be a cycle.
 */
export type PrivateTopology = "single" | "side-hallway" | "double-row" | "courtyard";

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
  /**
   * Ordered private-zone topology preferences parsed from the user's own free-text brief
   * (see lib/parseDescription.ts's STYLE_TOPOLOGY_PATTERNS) — e.g. the word "courtyard"
   * produces `["courtyard"]`, and a brief mentioning both "courtyard" and "center hall"
   * produces `["courtyard", "double-row"]` in the order they appear in the text. This is
   * distinct from `LayoutVariant.privateTopologyPreferences` (lib/layout/generate.ts),
   * which is the engine's own per-variant aesthetic default — this is the user's own
   * explicit intent, and `generateFloorPlan` merges it ahead of the variant's preference
   * so it wins whenever both are structurally eligible. Undefined = no style keyword
   * found in the brief, defer entirely to the variant/engine defaults (unchanged behavior
   * for every existing brief/caller).
   */
  styleTopologyPreferences?: PrivateTopology[];
  /**
   * A real studio apartment: one open sleeping/living/kitchen/dining room by
   * definition, not a small house. Undefined/false = every existing brief's
   * behavior, completely unchanged. When true, buildRoomProgram (lib/layout/program.ts)
   * shrinks the primary bedroom to a real alcove-studio sleeping-nook size (no
   * separate full bedroom) instead of applying a full house's 140 sqft minimum —
   * found live, 2026-11-05, generating a real "studio apartment 450 sqft" brief
   * through the live site: every variant warned the bedroom/bathrooms "don't
   * comfortably fit" because the room program never actually treated studios any
   * differently from a 1-bedroom house below this flag's addition.
   */
  isStudio?: boolean;
  /**
   * A real ADU (accessory dwelling unit) / granny flat / in-law suite: a genuinely
   * small, complete standalone unit — most US jurisdictions cap these around
   * 600-1200 sqft by right — not a small house with the SAME house-scale room
   * minimums as a 2000+ sqft brief. Undefined/false = every existing brief's
   * behavior, completely unchanged. Same bug class, and the same fix, as
   * `isStudio` above (generalized 2026-11-06, not re-derived): when true,
   * `parseDescription` forces `openPlan=true` (merges living/kitchen/dining into
   * one great_room instead of 3 separate rooms each measured against a full
   * house's minimum) and defaults bathrooms to 1 instead of 2, and
   * `buildRoomProgram` (lib/layout/program.ts) shrinks the primary bedroom to the
   * same real small-footprint size `isStudio` already uses. Unlike `isStudio`,
   * an ADU genuinely has its own separate bedroom (a real door, not merged into
   * the great room) — so the room keeps its ordinary "Primary Bedroom"/"Bedroom"
   * label, it just isn't sized like a full house's primary suite. Real gap
   * found live, 2026-11-06, generating a real "standalone 1-bed ADU, kitchenette,
   * full bath, stacked laundry, single story, 600 sqft" brief through the live
   * generator: `isADU` didn't exist yet, so the engine applied the full-house
   * living+kitchen+dining(+office) program and a 2-bath default to a 600 sqft
   * unit, producing 7-8 warnings on every variant — the exact same root cause
   * `isStudio` was added to fix for studio apartments on 2026-11-05, just never
   * extended past the literal word "studio".
   */
  isADU?: boolean;
}
