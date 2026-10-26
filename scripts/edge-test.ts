import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";

const cases = [
  "studio apartment, 1 bath, 450 sqft",
  "6 bedroom 4.5 bath estate, 5200 sqft, with garage and office and dining",
  "1 bedroom 1 bath apartment 600 sqft",
  "tiny house 300 sqft 1 bed 1 bath",
];
for (const c of cases) {
  const input = parseDescription(c);
  try {
    const plan = generateFloorPlan(input);
    const EPS = 0.05;
    let bugs = 0;
    for (const r of plan.rooms) {
      if (r.x < -EPS || r.y < -EPS || r.x + r.w > plan.footprint.w + EPS || r.y + r.h > plan.footprint.h + EPS) bugs++;
    }
    console.log(`OK: "${c}" -> ${plan.rooms.length} rooms, ${plan.footprint.w}x${plan.footprint.h}, bounds-bugs=${bugs}, warnings=${plan.warnings.length}`);
  } catch (e) {
    console.log(`CRASH: "${c}" ->`, e);
  }
}
