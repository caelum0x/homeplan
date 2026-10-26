import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";

const examples = [
  "3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living",
  "4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office",
  "cozy 2 bedroom 1 bath cottage, 900 sqft",
];

for (const description of examples) {
  const input = parseDescription(description);
  const plan = generateFloorPlan(input);

  console.log("\n================================================================");
  console.log("INPUT:", description);
  console.log("PARSED:", JSON.stringify(input));
  console.log(`FOOTPRINT: ${plan.footprint.w}ft x ${plan.footprint.h}ft, total ${plan.totalAreaSqft} sqft`);
  console.log("ROOMS:");
  for (const r of plan.rooms) {
    console.log(
      `  - ${r.label.padEnd(32)} type=${r.type.padEnd(16)} x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.w.toFixed(1)} h=${r.h.toFixed(1)}  area=${r.areaSqft}sqft`,
    );
  }
  console.log(`DOORS: ${plan.doors.length}`);
  for (const d of plan.doors) {
    console.log(`  - ${d.connects[0]} <-> ${d.connects[1]} at (${d.x.toFixed(1)}, ${d.y.toFixed(1)})`);
  }
  console.log(`WALLS: ${plan.walls.length}`);
  if (plan.warnings.length) {
    console.log("WARNINGS:");
    for (const w of plan.warnings) console.log(`  ! ${w}`);
  } else {
    console.log("WARNINGS: none");
  }

  const EPS = 0.05;
  for (const r of plan.rooms) {
    if (r.x < -EPS || r.y < -EPS || r.x + r.w > plan.footprint.w + EPS || r.y + r.h > plan.footprint.h + EPS) {
      console.log(`  BOUNDS BUG: ${r.label} (${r.x},${r.y},${r.w},${r.h}) exceeds footprint ${plan.footprint.w}x${plan.footprint.h}`);
    }
  }
  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i];
      const b = plan.rooms[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > EPS && overlapY > EPS) {
        console.log(`  OVERLAP BUG: ${a.label} and ${b.label} overlap by ${overlapX.toFixed(2)}x${overlapY.toFixed(2)}`);
      }
    }
  }
}
