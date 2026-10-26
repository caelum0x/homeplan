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
//
// Anything that doesn't match a known shape returns a clear error message
// naming what was understood vs. not — never a silent no-op.

import type { FloorPlan, Room, RoomType } from "./types";
import { addRoom, moveRoom, removeRoom, renameRoom, resizeRoom } from "./edit";

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

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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

  const entry = ROOM_TYPE_WORDS.find((e) => e.words.some((w) => typeWord === w || typeWord.endsWith(w)));
  if (!entry) return byLabelSubstring[0] ?? null;

  const family =
    entry.type === "bedroom"
      ? plan.rooms.filter((r) => r.type === "bedroom" || r.type === "primary_bedroom")
      : entry.type === "bath"
        ? plan.rooms.filter((r) => r.type === "bath" || r.type === "primary_bath" || r.type === "half_bath")
        : plan.rooms.filter((r) => r.type === entry.type);

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

/** Applies one natural-language command to `plan`. Pure — never mutates, always returns a fresh result. */
export function applyChatCommand(plan: FloorPlan, rawCommand: string): ChatEditResult {
  const command = normalize(rawCommand);
  if (!command) return { ok: false, message: "Type a command, e.g. “make the primary bedroom bigger”." };

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
    const entry = ROOM_TYPE_WORDS.find((e) => e.words.some((w) => typeWord === w || typeWord.endsWith(w)));
    const type: RoomType = entry?.type ?? "bedroom";
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
      'Didn’t recognize that command. Try: "make the kitchen bigger", "shrink bedroom 2 by 15%", "move the bathroom left", "rename the office to Studio", "add a bedroom", or "remove the closet".',
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
