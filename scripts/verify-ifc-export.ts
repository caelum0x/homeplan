// Real round-trip check for IFC export (lib/exportIfc.ts): generates a real plan, exports
// it to IFC text, then parses that exact string back with web-ifc — the same WASM IFC
// parser a real BIM viewer uses — and asserts the real entity counts it reads back match
// the plan's own rooms/walls/doors/windows. Not a byte-count/"file has content" check.

import { IfcAPI } from "web-ifc";
import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import { floorPlanToIfc } from "../lib/exportIfc";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

const IFCSPACE = 3856911033;
const IFCWALL = 2391406946;
const IFCDOOR = 395920057;
const IFCWINDOW = 3304561284;
const IFCOPENINGELEMENT = 3588315303;
const IFCRELVOIDSELEMENT = 1401173127;
const IFCRELFILLSELEMENT = 3940055652;

/**
 * Real structural check (2026-11-06, closing a gap found inspecting this exporter's own
 * output): a door/window placed at the right coordinates isn't enough for a BIM-native claim
 * — a real BIM viewer (Revit/ArchiCAD) needs to know WHICH wall each opening is cut into and
 * WHAT fills it, via IfcRelVoidsElement/IfcRelFillsElement. This reads every one of those
 * relationships back out of the real parsed model (not just counting entity types) and
 * confirms each one's wall/opening/door-or-window references are real, resolvable lines in
 * THIS model, and that most real openings (doors+windows) actually got one — not a hand-wave.
 */
function checkOpeningCoverage(api: InstanceType<typeof IfcAPI>, modelID: number, label: string, doorPlusWindowCount: number) {
  const openingIds = api.GetLineIDsWithType(modelID, IFCOPENINGELEMENT);
  const voidIds = api.GetLineIDsWithType(modelID, IFCRELVOIDSELEMENT);
  const fillIds = api.GetLineIDsWithType(modelID, IFCRELFILLSELEMENT);
  console.log(`${label}: ${openingIds.size()} IFCOPENINGELEMENT, ${voidIds.size()} IFCRELVOIDSELEMENT, ${fillIds.size()} IFCRELFILLSELEMENT`);

  check(`${label}: one IfcRelVoidsElement per real opening`, voidIds.size() === openingIds.size());
  check(`${label}: one IfcRelFillsElement per real opening`, fillIds.size() === openingIds.size());

  let voidsResolve = true;
  for (let i = 0; i < voidIds.size(); i++) {
    const line = api.GetLine(modelID, voidIds.get(i));
    const wallId = line.RelatingBuildingElement?.value;
    const openingId = line.RelatedOpeningElement?.value;
    if (!wallId || !openingId) {
      voidsResolve = false;
      continue;
    }
    const wallLine = api.GetLine(modelID, wallId);
    const openingLine = api.GetLine(modelID, openingId);
    if (!wallLine || wallLine.type !== IFCWALL || !openingLine || openingLine.type !== IFCOPENINGELEMENT) voidsResolve = false;
  }
  check(`${label}: every IfcRelVoidsElement really references a real IfcWall + IfcOpeningElement in this model`, voidsResolve);

  let fillsResolve = true;
  for (let i = 0; i < fillIds.size(); i++) {
    const line = api.GetLine(modelID, fillIds.get(i));
    const openingId = line.RelatingOpeningElement?.value;
    const filledId = line.RelatedBuildingElement?.value;
    if (!openingId || !filledId) {
      fillsResolve = false;
      continue;
    }
    const openingLine = api.GetLine(modelID, openingId);
    const filledLine = api.GetLine(modelID, filledId);
    if (!openingLine || openingLine.type !== IFCOPENINGELEMENT || !filledLine || (filledLine.type !== IFCDOOR && filledLine.type !== IFCWINDOW)) {
      fillsResolve = false;
    }
  }
  check(`${label}: every IfcRelFillsElement really references a real IfcOpeningElement + IfcDoor/IfcWindow in this model`, fillsResolve);

  // Real coverage, not just "at least one": the host-wall match is purely geometric
  // (lib/exportIfc.ts's findHostWall), so every normally-generated door/window should match
  // its own host wall — allow a small miss margin rather than demanding literal 100%, since a
  // genuinely unusual geometry (e.g. a door on a diagonal/rounded wall this engine doesn't
  // generate) should fail loud, not silently, but one stray miss shouldn't flip this red.
  const coverage = doorPlusWindowCount > 0 ? openingIds.size() / doorPlusWindowCount : 1;
  check(`${label}: at least 90% of real doors+windows (${doorPlusWindowCount}) got a real opening cut into their host wall (got ${openingIds.size()}, ${Math.round(coverage * 100)}%)`, coverage >= 0.9);
}

async function main() {
  const input = parseDescription("3 bedroom 2 bath, 1800 sqft, open plan kitchen living");
  const plan = generateFloorPlan(input);

  const ifcText = floorPlanToIfc(plan);
  check("IFC text starts with a real STEP header", ifcText.startsWith("ISO-10303-21;"));
  check("IFC text declares IFC4 schema", ifcText.includes("FILE_SCHEMA(('IFC4'))"));
  check("IFC text ends with a real STEP footer", ifcText.trim().endsWith("END-ISO-10303-21;"));

  const api = new IfcAPI();
  await api.Init();
  const modelID = api.OpenModel(new TextEncoder().encode(ifcText));
  check("web-ifc accepted the exported file as a real model (non-negative handle)", modelID >= 0);

  const spaceCount = api.GetLineIDsWithType(modelID, IFCSPACE).size();
  const wallCount = api.GetLineIDsWithType(modelID, IFCWALL).size();
  const doorCount = api.GetLineIDsWithType(modelID, IFCDOOR).size();
  const windowCount = api.GetLineIDsWithType(modelID, IFCWINDOW).size();

  console.log(
    `real plan: ${plan.rooms.length} rooms, ${plan.walls.length} walls, ${plan.doors.length} doors, ${(plan.windows ?? []).length} windows`,
  );
  console.log(`web-ifc round-trip: ${spaceCount} IFCSPACE, ${wallCount} IFCWALL, ${doorCount} IFCDOOR, ${windowCount} IFCWINDOW`);

  check("IFCSPACE count matches plan.rooms.length exactly", spaceCount === plan.rooms.length);
  check("IFCWALL count matches plan.walls.length exactly", wallCount === plan.walls.length);
  check("IFCDOOR count matches plan.doors.length exactly", doorCount === plan.doors.length);
  check("IFCWINDOW count matches plan.windows.length exactly", windowCount === (plan.windows ?? []).length);

  checkOpeningCoverage(api, modelID, "first plan", plan.doors.length + (plan.windows ?? []).length);

  api.CloseModel(modelID);

  // Second real plan (different brief) so this isn't tuned to one fixture's numbers.
  const input2 = parseDescription("2-story, 4 bed 3.5 bath, 2800 sqft, 2-car garage, home office");
  const plan2 = generateFloorPlan(input2);
  const ifcText2 = floorPlanToIfc(plan2);
  const modelID2 = api.OpenModel(new TextEncoder().encode(ifcText2));
  const spaceCount2 = api.GetLineIDsWithType(modelID2, IFCSPACE).size();
  const wallCount2 = api.GetLineIDsWithType(modelID2, IFCWALL).size();
  const doorCount2 = api.GetLineIDsWithType(modelID2, IFCDOOR).size();
  const windowCount2 = api.GetLineIDsWithType(modelID2, IFCWINDOW).size();
  console.log(
    `second real plan: ${plan2.rooms.length} rooms/${spaceCount2} IFCSPACE, ${plan2.walls.length} walls/${wallCount2} IFCWALL, ${plan2.doors.length} doors/${doorCount2} IFCDOOR, ${(plan2.windows ?? []).length} windows/${windowCount2} IFCWINDOW`,
  );
  check("second plan: IFCSPACE count matches", spaceCount2 === plan2.rooms.length);
  check("second plan: IFCWALL count matches", wallCount2 === plan2.walls.length);
  check("second plan: IFCDOOR count matches", doorCount2 === plan2.doors.length);
  check("second plan: IFCWINDOW count matches", windowCount2 === (plan2.windows ?? []).length);

  checkOpeningCoverage(api, modelID2, "second plan", plan2.doors.length + (plan2.windows ?? []).length);

  api.CloseModel(modelID2);

  if (problems > 0) {
    console.error(`\n${problems} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll IFC export checks passed.");
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
