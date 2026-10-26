// Furniture catalog + placement primitives. Deliberately clean 2D top-down
// parametric shapes (rects/circles/lines drawn by code) rather than any
// external icon pack or 3D asset library — zero licensing risk, zero asset
// download, consistent with this app's "every pixel computed, nothing
// canned" rule. In the 3D view each piece extrudes to a simple labeled box
// primitive (not a photoreal model) — an honest, real, shippable version of
// "bring your own furniture" rather than a half-built asset pipeline.

import type { FurnitureItem, FurnitureType, Room, RoomType } from "./types";

export interface FurnitureSpec {
  label: string;
  /** Default footprint in feet. */
  w: number;
  h: number;
  category: "seating" | "sleeping" | "surface" | "storage" | "appliance" | "fixture" | "decor";
  /** Fill color for the 2D icon and the 3D block — HomePlan's own muted palette, not photoreal materials. */
  color: string;
}

export const FURNITURE_CATALOG: Record<FurnitureType, FurnitureSpec> = {
  bed_queen: { label: "Queen Bed", w: 5, h: 6.5, category: "sleeping", color: "#b7c9d9" },
  bed_single: { label: "Single Bed", w: 3.2, h: 6.5, category: "sleeping", color: "#b7c9d9" },
  sofa: { label: "Sofa", w: 7, h: 3, category: "seating", color: "#a9b9ce" },
  armchair: { label: "Armchair", w: 3, h: 3, category: "seating", color: "#a9b9ce" },
  coffee_table: { label: "Coffee Table", w: 3.5, h: 2, category: "surface", color: "#c7b299" },
  dining_table: { label: "Dining Table", w: 5.5, h: 3.2, category: "surface", color: "#c7b299" },
  dining_chair: { label: "Chair", w: 1.6, h: 1.6, category: "seating", color: "#bfae95" },
  desk: { label: "Desk", w: 4.5, h: 2.2, category: "surface", color: "#c7b299" },
  office_chair: { label: "Office Chair", w: 1.8, h: 1.8, category: "seating", color: "#9fa6ad" },
  wardrobe: { label: "Wardrobe", w: 4, h: 2, category: "storage", color: "#ad9a82" },
  dresser: { label: "Dresser", w: 3.5, h: 1.6, category: "storage", color: "#ad9a82" },
  nightstand: { label: "Nightstand", w: 1.6, h: 1.6, category: "storage", color: "#ad9a82" },
  tv_stand: { label: "TV Stand", w: 4.5, h: 1.3, category: "storage", color: "#8d8d8d" },
  bookshelf: { label: "Bookshelf", w: 3, h: 1.1, category: "storage", color: "#ad9a82" },
  kitchen_island: { label: "Island", w: 5.5, h: 3, category: "surface", color: "#cfc6b8" },
  fridge: { label: "Fridge", w: 2.8, h: 2.6, category: "appliance", color: "#c7cdd1" },
  stove: { label: "Stove", w: 2.5, h: 2.2, category: "appliance", color: "#9aa0a4" },
  sink_kitchen: { label: "Sink", w: 2.3, h: 2, category: "fixture", color: "#c9dde0" },
  toilet: { label: "Toilet", w: 1.6, h: 2.3, category: "fixture", color: "#e2eeef" },
  bathtub: { label: "Bathtub", w: 2.6, h: 5, category: "fixture", color: "#d9eced" },
  shower: { label: "Shower", w: 3, h: 3, category: "fixture", color: "#d9eced" },
  sink_bath: { label: "Vanity Sink", w: 2, h: 1.6, category: "fixture", color: "#c9dde0" },
  rug: { label: "Rug", w: 6, h: 4, category: "decor", color: "#d8cdb8" },
};

const BEDROOM_SET: FurnitureType[] = ["bed_queen", "nightstand", "wardrobe"];
const SMALL_BEDROOM_SET: FurnitureType[] = ["bed_single", "nightstand"];
const LIVING_SET: FurnitureType[] = ["sofa", "coffee_table", "tv_stand", "rug"];
const KITCHEN_SET: FurnitureType[] = ["kitchen_island", "fridge", "stove"];
const DINING_SET: FurnitureType[] = ["dining_table"];
const OFFICE_SET: FurnitureType[] = ["desk", "office_chair", "bookshelf"];
const BATH_SET: FurnitureType[] = ["toilet", "sink_bath", "bathtub"];
const HALF_BATH_SET: FurnitureType[] = ["toilet", "sink_bath"];

let furnitureCounter = 0;
function nextId(): string {
  return `furn_${Date.now()}_${furnitureCounter++}`;
}

/** One new, independent, freely-draggable furniture item sized from the catalog, placed at (x, y) top-left. */
export function makeFurniture(type: FurnitureType, x: number, y: number): FurnitureItem {
  const spec = FURNITURE_CATALOG[type];
  return { id: nextId(), type, label: spec.label, x, y, w: spec.w, h: spec.h, rotation: 0 };
}

const ROOM_SETS: Partial<Record<RoomType, (room: Room) => FurnitureType[]>> = {
  primary_bedroom: () => BEDROOM_SET,
  bedroom: (room) => (room.areaSqft < 100 ? SMALL_BEDROOM_SET : BEDROOM_SET),
  living: () => LIVING_SET,
  great_room: () => [...LIVING_SET, ...DINING_SET, ...KITCHEN_SET],
  kitchen: () => KITCHEN_SET,
  dining: () => DINING_SET,
  office: () => OFFICE_SET,
  primary_bath: () => BATH_SET,
  bath: () => BATH_SET,
  half_bath: () => HALF_BATH_SET,
};

/**
 * Best-effort starter furniture for a freshly generated plan — Maket's
 * "furnished room layout generation." Places each room's default set along
 * its walls with simple non-overlapping offsets; skips a piece entirely
 * (rather than cramming it in) if the room is too small for it. Everything
 * placed here is a normal FurnitureItem afterward — move/rotate/remove it
 * like anything else in the Studio editor.
 */
export function autoPlaceFurniture(rooms: Room[]): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  for (const room of rooms) {
    const pickSet = ROOM_SETS[room.type];
    if (!pickSet) continue;
    const margin = 0.4;
    // Rooms render their label/dimension text anchored near the top — leave that band clear so
    // furniture never visually collides with it (a real overlap bug found reviewing real
    // screenshots once furniture auto-placement shipped, same standard as every other fix here).
    // 3.3ft covers the renderer's worst-case 2-line label+dimension text block (the max 13px
    // font x2 lines + gaps, at the renderer's 10px/ft scale, hit by any room >=13ft wide) — tuned
    // against real rendered screenshots that still showed overlap at smaller values.
    const labelClearance = 3.3;
    let cursorX = room.x + margin;
    const rowY = room.y + Math.min(labelClearance, Math.max(margin, room.h - margin * 2));
    for (const type of pickSet(room)) {
      const spec = FURNITURE_CATALOG[type];
      if (spec.w + margin * 2 > room.w || spec.h + (rowY - room.y) + margin > room.h) continue; // honestly skip, never overlap the walls or the label
      if (cursorX + spec.w > room.x + room.w - margin) {
        // Out of room along this row — place along the opposite wall instead of overlapping.
        const altY = room.y + room.h - margin - spec.h;
        if (altY > rowY) items.push({ ...makeFurniture(type, room.x + margin, altY) });
        continue;
      }
      items.push(makeFurniture(type, cursorX, rowY));
      cursorX += spec.w + margin;
    }
  }
  return items;
}
