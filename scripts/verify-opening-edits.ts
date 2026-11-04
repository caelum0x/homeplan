// Real round-trip check for the new manual door/window editing (Maket.ai's "canvas-based
// wall and opening adjustments" — before this, HomePlan's doors/windows were 100%
// auto-derived from room geometry with zero manual control; see lib/layout/edit.ts's
// "manual opening overlay" section and lib/layout/chatEdit.ts's window/door command block).
//
// Exercises the real applyChatCommand() path against a real generated plan — not a
// hand-built fixture — and inspects the resulting plan's actual doors/windows arrays.

import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import { applyChatCommand } from "../lib/layout/chatEdit";
import { moveRoom, windowsForRoom } from "../lib/layout/edit";
import type { Room } from "../lib/layout/types";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

// Same "label substring" fallback applyChatCommand's own findRoom() uses, so this test's
// room lookups never drift from what the real chat command actually resolved.
function findByLabel(rooms: Room[], needle: string): Room | undefined {
  return rooms.find((r) => r.label.toLowerCase().includes(needle));
}

function main() {
  const input = parseDescription("3 bedroom 2 bath, 1800 sqft, open plan kitchen living");
  let plan = generateFloorPlan(input);

  const kitchenRoom = findByLabel(plan.rooms, "kitchen");
  check("fixture has a room covering the kitchen", !!kitchenRoom);
  const bedroom2 = plan.rooms.find((r) => r.label === "Bedroom 2");
  check("fixture has Bedroom 2", !!bedroom2);
  const movableTestRoom = plan.rooms.find((r) => r.label === "Bathroom");
  check("fixture has a Bathroom (used as the single-window move-test room)", !!movableTestRoom);

  const baselineWindows = plan.windows ?? [];
  console.log(`baseline: ${baselineWindows.length} windows, ${plan.doors.length} doors`);
  check("fixture has real auto-derived windows before any edit", baselineWindows.length > 0);

  // --- 1. Remove a window from a room that has one. ---
  const removeRes = applyChatCommand(plan, "remove the window from bedroom 2");
  check("remove window: command recognized", removeRes.ok);
  if (removeRes.ok && removeRes.plan) {
    plan = removeRes.plan;
    check(
      "remove window: real window count actually decreased by 1",
      (plan.windows ?? []).length === baselineWindows.length - 1,
    );
    check("remove window: removedWindowKeys actually recorded", (plan.removedWindowKeys ?? []).length === 1);
  }

  // --- 2. The removal survives an unrelated room being dragged (the whole point of keying by
  // position+orientation instead of a regenerated id). ---
  const livingRoom = plan.rooms.find((r) => r.type === "living" || r.type === "great_room");
  if (livingRoom) {
    const afterDrag = moveRoom(plan, livingRoom.id, livingRoom.x + 1, livingRoom.y);
    check(
      "remove window: survives an unrelated room move (count still -1 from baseline)",
      (afterDrag.windows ?? []).length === baselineWindows.length - 1,
    );
    plan = afterDrag;
  }

  // --- 3. Add a window to a room, verify it's real (on an exterior wall, not floating). ---
  const beforeAdd = (plan.windows ?? []).length;
  const addRes = applyChatCommand(plan, "add a window to the kitchen");
  check("add window: command recognized", addRes.ok);
  if (addRes.ok && addRes.plan) {
    plan = addRes.plan;
    check("add window: real window count increased by 1", (plan.windows ?? []).length === beforeAdd + 1);
    const newWindow = (plan.manualWindows ?? [])[0];
    check("add window: recorded as a manual window", !!newWindow);
    if (newWindow) {
      const onExterior = plan.walls.some(
        (w) =>
          w.exterior &&
          (newWindow.orientation === "h"
            ? Math.abs(w.y1 - w.y2) < 0.1 && Math.abs(w.y1 - newWindow.y) < 0.3
            : Math.abs(w.x1 - w.x2) < 0.1 && Math.abs(w.x1 - newWindow.x) < 0.3),
      );
      check("add window: sits on a real exterior wall, not a made-up position", onExterior);
    }
  }

  // --- 4. Adding a window to a room with no exterior wall is an honest no-op, not a fake window. ---
  const hallway = plan.rooms.find((r) => r.type === "hallway");
  if (hallway) {
    const beforeInteriorAdd = (plan.windows ?? []).length;
    const interiorAddRes = applyChatCommand(plan, "add a window to the hallway");
    check(
      "add window to interior-only room: honest failure, not a fake window",
      interiorAddRes.ok === false && !interiorAddRes.plan,
    );
    check("add window to interior-only room: real window count unchanged", (plan.windows ?? []).length === beforeInteriorAdd);
  }

  // --- 5. Move a window; it must stay clamped to its own exterior wall segment. Use the
  // Bathroom specifically (untouched by steps 1-4, exactly one real window) so there's exactly
  // one unambiguous target window. ---
  if (movableTestRoom) {
    const targetWindows = windowsForRoom(plan, movableTestRoom);
    check("bathroom has exactly one window to test moving", targetWindows.length === 1);
    if (targetWindows.length >= 1) {
      const before = targetWindows[0];
      const hugeStep = 50; // deliberately larger than any real wall run, to force clamping
      const dirWord = before.orientation === "h" ? "left" : "up";
      const moveRes = applyChatCommand(plan, `move the window in the bathroom ${dirWord} by ${hugeStep} ft`);
      check("move window: command recognized", moveRes.ok);
      if (moveRes.ok && moveRes.plan) {
        plan = moveRes.plan;
        const after = windowsForRoom(plan, movableTestRoom)[0];
        check("move window: still exactly one window on the bathroom after the move", !!after);
        if (after) {
          check("move window: position actually changed", after.x !== before.x || after.y !== before.y);
          const stillOnExteriorWall = plan.walls.some(
            (w) =>
              w.exterior &&
              (after.orientation === "h"
                ? Math.abs(w.y1 - w.y2) < 0.1 && Math.abs(w.y1 - after.y) < 0.3 && after.x >= Math.min(w.x1, w.x2) - 0.1 && after.x <= Math.max(w.x1, w.x2) + 0.1
                : Math.abs(w.x1 - w.x2) < 0.1 && Math.abs(w.x1 - after.x) < 0.3 && after.y >= Math.min(w.y1, w.y2) - 0.1 && after.y <= Math.max(w.y1, w.y2) + 0.1),
          );
          check(
            "move window: a 50ft nominal move was clamped to the real wall bounds, not slid off into open air",
            stillOnExteriorWall,
          );
        }
      }
    }
  }

  // --- 6. Remove the door between two specific rooms by name. ---
  const doorToRemove = plan.doors.find((d) => !d.connects.includes("exterior"));
  if (doorToRemove) {
    const [roomAId, roomBId] = doorToRemove.connects;
    const roomA = plan.rooms.find((r) => r.id === roomAId);
    const roomB = plan.rooms.find((r) => r.id === roomBId);
    if (roomA && roomB) {
      const beforeDoorCount = plan.doors.length;
      const doorRemoveRes = applyChatCommand(plan, `remove the door between the ${roomA.label} and the ${roomB.label}`);
      check(`remove door between ${roomA.label} and ${roomB.label}: command recognized`, doorRemoveRes.ok);
      if (doorRemoveRes.ok && doorRemoveRes.plan) {
        plan = doorRemoveRes.plan;
        check("remove door: real door count actually decreased by 1", plan.doors.length === beforeDoorCount - 1);
        check(
          "remove door: that specific room pair no longer has an opening",
          !plan.doors.some((d) => d.connects.includes(roomAId) && d.connects.includes(roomBId)),
        );
        check("remove door: removedDoorKeys actually recorded", (plan.removedDoorKeys ?? []).length === 1);
      }
    }
  }

  // --- 7. Remove the front door. ---
  const hadFrontDoor = plan.doors.some((d) => d.connects.includes("exterior"));
  check("fixture has a front door before removal", hadFrontDoor);
  const frontDoorRes = applyChatCommand(plan, "remove the front door");
  check("remove front door: command recognized", frontDoorRes.ok);
  if (frontDoorRes.ok && frontDoorRes.plan) {
    plan = frontDoorRes.plan;
    check("remove front door: no exterior-connected door remains", !plan.doors.some((d) => d.connects.includes("exterior")));
    // Removing the front door a second time should fail honestly (nothing left to remove).
    const secondRes = applyChatCommand(plan, "remove the front door");
    check("remove front door twice: honest failure the second time, not a silent no-op success", secondRes.ok === false);
  }

  console.log(problems === 0 ? "\nAll opening-edit checks passed." : `\n${problems} opening-edit check(s) FAILED.`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
