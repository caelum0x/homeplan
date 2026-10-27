// Natural-language editing on top of an already-generated plan — the
// "type a change, see the plan update" flow that's explicitly Maket's other
// headline feature alongside the drag/numeric Studio editor (see
// plans/homeplan.md). Deliberately regex-based, same philosophy as
// lib/parseDescription.ts: free, instant, deterministic, nothing to
// hallucinate, and every match is inspectable instead of an opaque LLM call.
//
// Supported command shapes (case-insensitive, room referenced by its
// current label, a loose substring of it, or its type + ordinal e.g.
// "bedroom 2"):
//   "make the primary bedroom bigger"
//   "make bedroom 2 smaller by 20%"
//   "enlarge the kitchen by 40 sqft"
//   "shrink the office to 100 sqft"
//   "move the bathroom left by 3 ft" / "move bedroom 2 down"
//   "rename the office to Studio"
//   "add a bedroom" / "add an office called Den"
//   "remove the closet" / "delete bedroom 3"
//   "add a sofa to the living room" / "add a bed to bedroom 2"
//   "remove the dining table from the dining room"
//   "move the sofa in the living room left" / "... by 2 ft"
//   "rotate the bed in bedroom 1" / "rotate the sofa in the living room by 180 degrees"
//
// Anything that doesn't match a known shape returns a clear error message
// naming what was understood vs. not — never a silent no-op.

import type { FloorPlan, FurnitureItem, FurnitureType, Room, RoomType } from "./types";
import { addRoom, addFurniture, moveFurniture, moveRoom, removeFurniture, removeRoom, renameRoom, resizeRoom, rotateFurniture } from "./edit";
import { FURNITURE_CATALOG } from "./furniture";

export interface ChatEditResult {
  ok: boolean;
  message: string;
  plan?: FloorPlan;
}

const SIZE_STEP = 0.18; // "bigger"/"smaller" with no explicit amount = 18% change
const MOVE_STEP_FT = 3;

const ROOM_TYPE_WORDS: Array<{ words: string[]; type: RoomType }> = [
  { words: ["primary bedroom", "master bedroom", "main bedroom"], type: "primary_bedroom" },
  { words: ["bedroom", "room"], type: "bedroom" },
  { words: ["primary bath", "master bath", "ensuite"], type: "primary_bath" },
  { words: ["half bath", "powder room"], type: "half_bath" },
  { words: ["bath", "bathroom"], type: "bath" },
  { words: ["great room"], type: "great_room" },
  { words: ["living room", "living"], type: "living" },
  { words: ["kitchen"], type: "kitchen" },
  { words: ["dining room", "dining"], type: "dining" },
  { words: ["office", "den", "study"], type: "office" },
  { words: ["hallway", "hall"], type: "hallway" },
  { words: ["garage"], type: "garage" },
  { words: ["closet"], type: "closet" },
  { words: ["entry", "foyer"], type: "entry" },
];

// Furniture-type vocabulary, same "longest/most-specific phrase first" scheme
// as ROOM_TYPE_WORDS above. Bare ambiguous words ("table", "chair", "sink")
// aren't listed here — they're resolved against the target room's type in
// resolveFurnitureType() instead, since the catalog has multiple real items
// that word could mean.
const FURNITURE_TYPE_WORDS: Array<{ words: string[]; type: FurnitureType }> = [
  { words: ["queen bed", "double bed"], type: "bed_queen" },
  { words: ["single bed", "twin bed"], type: "bed_single" },
  { words: ["bed"], type: "bed_queen" },
  { words: ["sofa", "couch"], type: "sofa" },
  { words: ["armchair", "accent chair"], type: "armchair" },
  { words: ["coffee table"], type: "coffee_table" },
  { words: ["dining table"], type: "dining_table" },
  { words: ["dining chair"], type: "dining_chair" },
  { words: ["office chair", "desk chair"], type: "office_chair" },
  { words: ["desk"], type: "desk" },
  { words: ["wardrobe"], type: "wardrobe" },
  { words: ["dresser"], type: "dresser" },
  { words: ["nightstand", "night stand"], type: "nightstand" },
  { words: ["tv stand", "television stand", "tv"], type: "tv_stand" },
  { words: ["bookshelf", "bookcase", "shelf"], type: "bookshelf" },
  { words: ["kitchen island", "island"], type: "kitchen_island" },
  { words: ["fridge", "refrigerator"], type: "fridge" },
  { words: ["stove", "oven", "range"], type: "stove" },
  { words: ["kitchen sink"], type: "sink_kitchen" },
  { words: ["bathroom sink", "vanity sink", "vanity"], type: "sink_bath" },
  { words: ["toilet"], type: "toilet" },
  { words: ["bathtub", "tub"], type: "bathtub" },
  { words: ["shower"], type: "shower" },
  { words: ["rug", "carpet"], type: "rug" },
];

const FURNITURE_MOVE_STEP_FT = 2;
const FURNITURE_ROTATE_STEP_DEG = 90;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolves a free-text furniture reference ("sofa", "the dining table", "a chair") to a real catalog type, disambiguating "table"/"chair"/"sink" by the target room's type since the catalog has more than one real item those bare words could mean. */
function resolveFurnitureType(wordRaw: string, room: Room | null): FurnitureType | null {
  const w = normalize(wordRaw).replace(/^(the|a|an)\s+/, "");
  const entry = FURNITURE_TYPE_WORDS.find((e) => e.words.some((word) => w === word || w.endsWith(word)));
  if (entry) return entry.type;

  if (w === "table" || w.endsWith(" table")) {
    if (room?.type === "dining") return "dining_table";
    if (room?.type === "living" || room?.type === "great_room") return "coffee_table";
    return "dining_table";
  }
  if (w === "chair" || w.endsWith(" chair")) {
    if (room?.type === "dining") return "dining_chair";
    if (room?.type === "office") return "office_chair";
    return "armchair";
  }
  if (w === "sink") {
    if (room?.type === "bath" || room?.type === "primary_bath" || room?.type === "half_bath") return "sink_bath";
    return "sink_kitchen";
  }
  return null;
}

/** Furniture whose center point falls inside `room`'s rectangle — independent position, so this is the honest "is it really in this room" check rather than trusting a stored room id. */
function furnitureInRoom(plan: FloorPlan, room: Room, type?: FurnitureType): FurnitureItem[] {
  return plan.furniture.filter((f) => {
    if (type && f.type !== type) return false;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    return cx >= room.x && cx <= room.x + room.w && cy >= room.y && cy <= room.y + room.h;
  });
}

function describeFurnitureInRoom(plan: FloorPlan, room: Room): string {
  const labels = furnitureInRoom(plan, room).map((f) => f.label);
  return labels.length > 0 ? labels.join(", ") : "(none)";
}

/** A reasonable starting spot for a new piece inside `room`: centered horizontally, below the room label's render band (same 3.3ft clearance autoPlaceFurniture uses) when the room is deep enough, else vertically centered. Never collision-checked against existing furniture — same "warn visually, never silently block" rule the Studio drag editor already uses. */
function placementInRoom(room: Room, w: number, h: number): { x: number; y: number } {
  const margin = 0.5;
  const labelClearance = 3.3;
  const x = Math.max(room.x + margin, room.x + (room.w - w) / 2);
  const y = room.h > labelClearance + h + margin ? room.y + labelClearance : Math.max(room.y + margin, room.y + (room.h - h) / 2);
  return { x, y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Resolves a room-type word against ROOM_TYPE_WORDS by the LONGEST matching
 * phrase, not array order. Real bug this fixes: with a plain first-match
 * `.find()`, "living room" matched the generic `{words: ["bedroom","room"],
 * type:"bedroom"}` entry first (since "living room".endsWith("room")), so
 * "add a sofa to the living room" silently added it to the Primary Bedroom
 * instead — caught live by actually running the new furniture commands
 * against a real open-plan brief, not visible from reading the code alone.
 */
function matchRoomTypeWord(typeWord: string): RoomType | null {
  let best: { word: string; type: RoomType } | null = null;
  for (const entry of ROOM_TYPE_WORDS) {
    for (const w of entry.words) {
      if ((typeWord === w || typeWord.endsWith(w)) && (!best || w.length > best.word.length)) {
        best = { word: w, type: entry.type };
      }
    }
  }
  return best?.type ?? null;
}

/** Finds the room a free-text reference ("the primary bedroom", "bedroom 2", "kitchen") points to. */
function findRoom(plan: FloorPlan, ref: string): Room | null {
  const q = normalize(ref).replace(/^(the|a|an)\s+/, "");

  // Exact or substring label match first (most specific — handles custom/renamed rooms).
  const byLabel = plan.rooms.find((r) => normalize(r.label) === q);
  if (byLabel) return byLabel;
  const byLabelSubstring = plan.rooms.filter((r) => normalize(r.label).includes(q) || q.includes(normalize(r.label)));
  if (byLabelSubstring.length === 1) return byLabelSubstring[0];

  // "bedroom 2" / "bathroom 1" style: type word + ordinal among rooms of that family.
  const ordinalMatch = q.match(/^(.+?)\s*(\d+)$/);
  const typeWord = ordinalMatch ? ordinalMatch[1].trim() : q;
  const ordinal = ordinalMatch ? parseInt(ordinalMatch[2], 10) : null;

  const entryType = matchRoomTypeWord(typeWord);
  if (!entryType) return byLabelSubstring[0] ?? null;

  const family =
    entryType === "bedroom"
      ? plan.rooms.filter((r) => r.type === "bedroom" || r.type === "primary_bedroom")
      : entryType === "bath"
        ? plan.rooms.filter((r) => r.type === "bath" || r.type === "primary_bath" || r.type === "half_bath")
        : plan.rooms.filter((r) => r.type === entryType);

  // "the living room" when the brief merged living/kitchen/dining into one
  // open-plan room: there's no room with type "living" at all, but the
  // great room IS functionally the living room, so fall back to it instead
  // of reporting "no room found" for a reference that's obviously valid.
  if (family.length === 0 && entryType === "living") {
    const greatRoom = plan.rooms.filter((r) => r.type === "great_room");
    if (greatRoom.length > 0) return greatRoom[0];
  }

  if (family.length === 0) return null;
  if (ordinal !== null) return family[ordinal - 1] ?? null;
  if (family.length === 1) return family[0];
  // Ambiguous ("the bedroom" with 3 bedrooms, no number) — prefer the primary if asking for a bedroom.
  return family.find((r) => r.type === "primary_bedroom" || r.type === "primary_bath") ?? family[0];
}

function describeRooms(plan: FloorPlan): string {
  const labels = plan.rooms.map((r) => r.label);
  return labels.length > 0 ? labels.join(", ") : "(no rooms)";
}

function furnitureCatalogLabels(): string {
  return Array.from(new Set(Object.values(FURNITURE_CATALOG).map((spec) => spec.label.toLowerCase()))).join(", ");
}

/** Applies one natural-language command to `plan`. Pure — never mutates, always returns a fresh result. */
export function applyChatCommand(plan: FloorPlan, rawCommand: string): ChatEditResult {
  const command = normalize(rawCommand);
  if (!command) return { ok: false, message: "Type a command, e.g. “make the primary bedroom bigger”." };

  // ---- furniture add: add a/an <furniture> to/in (the) <room>  (checked before the
  // generic room-add match below, which would otherwise swallow this as a bad room type)
  const furnitureAddMatch = command.match(/^add\s+(?:a|an)?\s*(.+?)\s+(?:to|in)\s+(?:the\s+)?(.+)$/);
  if (furnitureAddMatch) {
    const [, furnitureWordRaw, roomRef] = furnitureAddMatch;
    const room = findRoom(plan, roomRef);
    if (room) {
      const type = resolveFurnitureType(furnitureWordRaw, room);
      if (!type) {
        return {
          ok: false,
          message: `Didn't recognize furniture type "${furnitureWordRaw.trim()}". Try: ${furnitureCatalogLabels()}.`,
        };
      }
      const spec = FURNITURE_CATALOG[type];
      const withItem = addFurniture(plan, type);
      const newItem = withItem.furniture[withItem.furniture.length - 1];
      const { x, y } = placementInRoom(room, spec.w, spec.h);
      const placed = moveFurniture(withItem, newItem.id, x, y);
      return { ok: true, plan: placed, message: `Added ${spec.label} to ${room.label}.` };
    }
    // Room reference didn't resolve — fall through to the generic room-add match below
    // (e.g. "add a bedroom to the house" isn't a furniture command at all).
  }

  // ---- furniture remove: remove/delete (the) <furniture> from (the) <room>
  const furnitureRemoveMatch = command.match(/^(?:remove|delete)\s+(?:the\s+)?(.+?)\s+from\s+(?:the\s+)?(.+)$/);
  if (furnitureRemoveMatch) {
    const [, furnitureWordRaw, roomRef] = furnitureRemoveMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const type = resolveFurnitureType(furnitureWordRaw, room);
    if (!type) {
      return { ok: false, message: `Didn't recognize furniture type "${furnitureWordRaw.trim()}". Try: ${furnitureCatalogLabels()}.` };
    }
    const matches = furnitureInRoom(plan, room, type);
    if (matches.length === 0) {
      return {
        ok: false,
        message: `There's no ${FURNITURE_CATALOG[type].label.toLowerCase()} in ${room.label} to remove. Furniture there: ${describeFurnitureInRoom(plan, room)}.`,
      };
    }
    const target = matches[0];
    const nextPlan = removeFurniture(plan, target.id);
    return { ok: true, plan: nextPlan, message: `Removed ${target.label} from ${room.label}.` };
  }

  // ---- furniture move: move (the) <furniture> in (the) <room> left/right/up/down/... [by N ft]
  const furnitureMoveMatch = command.match(
    /^move\s+(?:the\s+)?(.+?)\s+in\s+(?:the\s+)?(.+?)\s+(left|right|up|down|forward|back|toward the front|toward the back)\s*(?:by\s+(\d+(?:\.\d+)?)\s*(?:ft|feet)?)?$/,
  );
  if (furnitureMoveMatch) {
    const [, furnitureWordRaw, roomRef, dir, amountStr] = furnitureMoveMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const type = resolveFurnitureType(furnitureWordRaw, room);
    if (!type) {
      return { ok: false, message: `Didn't recognize furniture type "${furnitureWordRaw.trim()}". Try: ${furnitureCatalogLabels()}.` };
    }
    const matches = furnitureInRoom(plan, room, type);
    if (matches.length === 0) {
      return {
        ok: false,
        message: `There's no ${FURNITURE_CATALOG[type].label.toLowerCase()} in ${room.label} to move. Furniture there: ${describeFurnitureInRoom(plan, room)}.`,
      };
    }
    const target = matches[0];
    const step = amountStr ? parseFloat(amountStr) : FURNITURE_MOVE_STEP_FT;
    let nx = target.x;
    let ny = target.y;
    if (dir === "left") nx -= step;
    else if (dir === "right") nx += step;
    else if (dir === "up" || dir === "forward" || dir === "toward the front") ny -= step;
    else if (dir === "down" || dir === "back" || dir === "toward the back") ny += step;
    nx = clamp(nx, room.x, room.x + room.w - target.w);
    ny = clamp(ny, room.y, room.y + room.h - target.h);
    const nextPlan = moveFurniture(plan, target.id, nx, ny);
    return { ok: true, plan: nextPlan, message: `Moved ${target.label} ${dir} in ${room.label}.` };
  }

  // ---- furniture rotate: rotate (the) <furniture> in (the) <room> [by N degrees]
  const furnitureRotateMatch = command.match(
    /^rotate\s+(?:the\s+)?(.+?)\s+in\s+(?:the\s+)?(.+?)(?:\s+by\s+(\d+(?:\.\d+)?)\s*(?:deg|degrees)?)?$/,
  );
  if (furnitureRotateMatch) {
    const [, furnitureWordRaw, roomRef, amountStr] = furnitureRotateMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const type = resolveFurnitureType(furnitureWordRaw, room);
    if (!type) {
      return { ok: false, message: `Didn't recognize furniture type "${furnitureWordRaw.trim()}". Try: ${furnitureCatalogLabels()}.` };
    }
    const matches = furnitureInRoom(plan, room, type);
    if (matches.length === 0) {
      return {
        ok: false,
        message: `There's no ${FURNITURE_CATALOG[type].label.toLowerCase()} in ${room.label} to rotate. Furniture there: ${describeFurnitureInRoom(plan, room)}.`,
      };
    }
    const target = matches[0];
    const delta = amountStr ? parseFloat(amountStr) : FURNITURE_ROTATE_STEP_DEG;
    const nextPlan = rotateFurniture(plan, target.id, delta);
    const updated = nextPlan.furniture.find((f) => f.id === target.id)!;
    return { ok: true, plan: nextPlan, message: `Rotated ${target.label} in ${room.label} to ${updated.rotation}°.` };
  }

  // ---- resize: make/enlarge/expand/grow/shrink/reduce <room> [bigger/smaller|by N%|by N sqft|to N sqft]
  const resizeMatch = command.match(
    /^(?:make|enlarge|expand|grow|shrink|reduce|increase|decrease)\s+(.+?)\s+(bigger|larger|smaller|wider|narrower|deeper|shallower)?\s*(?:(by|to)\s+)?(?:(\d+(?:\.\d+)?)\s*(%|percent|sqft|sq ft|square feet|ft|feet))?$/,
  );
  if (resizeMatch) {
    const [, roomRef, direction, byOrTo, amountStr, unit] = resizeMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };

    const growing = !/smaller|narrower|shallower|reduce|shrink|decrease/.test(command.slice(0, command.indexOf(roomRef)) + " " + (direction ?? ""));
    const sign = growing ? 1 : -1;

    let nextW = room.w;
    let nextH = room.h;
    const amount = amountStr ? parseFloat(amountStr) : null;

    if (amount !== null && (unit === "%" || unit === "percent")) {
      const factor = 1 + (sign * amount) / 100;
      nextW = room.w * Math.sqrt(factor);
      nextH = room.h * Math.sqrt(factor);
    } else if (amount !== null && (unit === "sqft" || unit === "sq ft" || unit === "square feet")) {
      // "to N sqft" / a bare "N sqft" with no direction word = an absolute target area.
      // "by N sqft" / "bigger|smaller ... N sqft" = relative to the current area.
      const isRelative = byOrTo === "by" || (byOrTo !== "to" && direction !== undefined);
      const targetArea = isRelative ? room.areaSqft + sign * amount : amount;
      const factor = Math.max(0.1, targetArea / room.areaSqft);
      nextW = room.w * Math.sqrt(factor);
      nextH = room.h * Math.sqrt(factor);
    } else if (amount !== null && (unit === "ft" || unit === "feet")) {
      // Directional: "wider"/"narrower" scales width, "deeper"/"shallower" scales depth, else both.
      if (direction === "wider" || direction === "narrower") nextW = room.w + sign * amount;
      else if (direction === "deeper" || direction === "shallower") nextH = room.h + sign * amount;
      else {
        nextW = room.w + sign * amount;
        nextH = room.h + sign * amount;
      }
    } else {
      // No explicit amount: default step, directional if given.
      if (direction === "wider" || direction === "narrower") nextW = room.w * (1 + sign * SIZE_STEP);
      else if (direction === "deeper" || direction === "shallower") nextH = room.h * (1 + sign * SIZE_STEP);
      else {
        nextW = room.w * (1 + sign * SIZE_STEP);
        nextH = room.h * (1 + sign * SIZE_STEP);
      }
    }

    const nextPlan = resizeRoom(plan, room.id, nextW, nextH);
    const updated = nextPlan.rooms.find((r) => r.id === room.id)!;
    const overlapWarning = nextPlan.warnings.find((w) => w.includes(updated.label));
    return {
      ok: true,
      plan: nextPlan,
      message: `${updated.label} resized to ${updated.w.toFixed(1)}' × ${updated.h.toFixed(1)}' (${updated.areaSqft} sqft).${
        overlapWarning ? ` Heads up: ${overlapWarning}` : ""
      }`,
    };
  }

  // ---- move: move <room> left/right/up/down/toward the front/toward the back [by N ft]
  const moveMatch = command.match(/^move\s+(.+?)\s+(left|right|up|down|forward|back|toward the front|toward the back)\s*(?:by\s+(\d+(?:\.\d+)?)\s*(?:ft|feet)?)?$/);
  if (moveMatch) {
    const [, roomRef, dir, amountStr] = moveMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const step = amountStr ? parseFloat(amountStr) : MOVE_STEP_FT;
    let nx = room.x;
    let ny = room.y;
    if (dir === "left") nx -= step;
    else if (dir === "right") nx += step;
    else if (dir === "up" || dir === "forward" || dir === "toward the front") ny -= step;
    else if (dir === "down" || dir === "back" || dir === "toward the back") ny += step;

    const nextPlan = moveRoom(plan, room.id, nx, ny);
    const updated = nextPlan.rooms.find((r) => r.id === room.id)!;
    const overlapWarning = nextPlan.warnings.find((w) => w.includes(updated.label));
    return {
      ok: true,
      plan: nextPlan,
      message: `${updated.label} moved ${dir} ${step}ft.${overlapWarning ? ` Heads up: ${overlapWarning}` : ""}`,
    };
  }

  // ---- rename: rename <room> to <new label>
  const renameMatch = command.match(/^rename\s+(.+?)\s+(?:to|as)\s+(.+)$/);
  if (renameMatch) {
    const [, roomRef, newLabelRaw] = renameMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const newLabel = newLabelRaw.trim().replace(/^./, (c) => c.toUpperCase());
    const nextPlan = renameRoom(plan, room.id, newLabel, room.type);
    return { ok: true, plan: nextPlan, message: `Renamed "${room.label}" to "${newLabel}".` };
  }

  // ---- add: add a/an <roomtype> [called/named <label>]
  const addMatch = command.match(/^add\s+(?:a|an)?\s*(.+?)(?:\s+(?:called|named)\s+(.+))?$/);
  if (addMatch) {
    const [, typeWordRaw, customLabel] = addMatch;
    const typeWord = typeWordRaw.trim();
    const type: RoomType = matchRoomTypeWord(typeWord) ?? "bedroom";
    const label = customLabel ? customLabel.trim().replace(/^./, (c) => c.toUpperCase()) : defaultLabelFor(type, plan);
    const nextPlan = addRoom(plan, type, label);
    return { ok: true, plan: nextPlan, message: `Added "${label}" (${nextPlan.rooms.length} rooms total) — drag it into place in the Studio view.` };
  }

  // ---- remove: remove/delete the <room>
  const removeMatch = command.match(/^(?:remove|delete)\s+(.+)$/);
  if (removeMatch) {
    const [, roomRef] = removeMatch;
    const room = findRoom(plan, roomRef);
    if (!room) return { ok: false, message: `Couldn't find a room matching "${roomRef.trim()}". Rooms on this plan: ${describeRooms(plan)}.` };
    const nextPlan = removeRoom(plan, room.id);
    return { ok: true, plan: nextPlan, message: `Removed "${room.label}" (${nextPlan.rooms.length} rooms left).` };
  }

  return {
    ok: false,
    message:
      'Didn’t recognize that command. Try: "make the kitchen bigger", "shrink bedroom 2 by 15%", "move the bathroom left", "rename the office to Studio", "add a bedroom", "remove the closet", "add a sofa to the living room", "remove the bed from bedroom 2", "move the sofa in the living room left", or "rotate the bed in bedroom 1".',
  };
}

function defaultLabelFor(type: RoomType, plan: FloorPlan): string {
  const sameType = plan.rooms.filter((r) => r.type === type).length;
  const base = type
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return sameType === 0 ? base : `${base} ${sameType + 1}`;
}
