import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import { floorPlanToSvgString } from "../lib/renderSvg";

const outDir = join(__dirname, "..", "examples");
mkdirSync(outDir, { recursive: true });

const examples: Array<{ slug: string; description: string }> = [
  { slug: "3bed-2bath-1400sqft-openplan", description: "3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living" },
  { slug: "4bed-3bath-2200sqft-garage-office", description: "4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office" },
  { slug: "2bed-1bath-900sqft-cottage", description: "cozy 2 bedroom 1 bath cottage, 900 sqft" },
];

for (const { slug, description } of examples) {
  const input = parseDescription(description);
  const plan = generateFloorPlan(input);
  const svg = floorPlanToSvgString(plan);
  const outPath = join(outDir, `${slug}.svg`);
  writeFileSync(outPath, svg, "utf8");
  console.log(`Wrote ${outPath} (${plan.footprint.w}x${plan.footprint.h}ft, ${plan.totalAreaSqft} sqft, ${plan.rooms.length} rooms)`);
}
