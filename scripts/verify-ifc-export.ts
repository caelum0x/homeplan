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
