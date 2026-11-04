// Real geometric check for the parametric furniture refactor in components/FloorPlan3D.tsx's
// buildFurnitureObject: builds every furniture type in the real catalog and asserts (a) each
// piece is a real composite (more than one mesh, not a single undifferentiated box) and (b)
// each piece's real bounding-box height falls inside the real-world range for that furniture
// type — not just "the file compiles."

import * as THREE from "three";
import { buildFurnitureObject } from "../components/FloorPlan3D";
import { FURNITURE_CATALOG, makeFurniture } from "../lib/layout/furniture";
import type { FurnitureType } from "../lib/layout/types";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

function countMeshes(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) n++;
  });
  return n;
}

function realHeightIn(obj: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(obj);
  return (box.max.y - box.min.y) * 12; // feet -> inches
}

// [type, minMeshes, heightRangeIn | null (null = not a real floor-to-ceiling-relevant height)]
const EXPECTATIONS: Array<[FurnitureType, number, [number, number] | null]> = [
  ["bed_queen", 3, [40, 60]], // frame+mattress+headboard+pillow, headboard top well above mattress
  ["sofa", 4, [34, 42]], // seat 18" + back rising ~20" above it
  ["armchair", 4, [34, 42]],
  ["dining_chair", 2, [34, 40]], // seat 18" + back rising ~20" above it
  ["office_chair", 2, [34, 40]],
  ["coffee_table", 2, [16, 20]], // real coffee table height ~18"
  ["dining_table", 2, [28, 32]], // real dining table height ~30"
  ["desk", 2, [27, 31]], // real desk height ~29"
  ["kitchen_island", 2, [34, 38]], // real counter height ~36"
  ["fridge", 2, [64, 72]], // real fridge height ~68"
  ["stove", 2, [34, 40]], // real range height ~36" + cooktop lip
  ["wardrobe", 2, [68, 76]], // real wardrobe height ~72"
  ["dresser", 2, [28, 36]], // real dresser height ~32"
  ["nightstand", 2, [20, 28]], // real nightstand height ~24"
  ["tv_stand", 2, [16, 24]], // real low TV stand height ~20"
  ["bookshelf", 4, [68, 76]], // real tall bookshelf height ~72"
  ["toilet", 2, [14, 22]],
  ["bathtub", 2, [14, 20]],
  ["shower", 2, [60, 70]], // glass panel height dominates the bounding box
  ["sink_bath", 2, [30, 36]],
  ["sink_kitchen", 2, [30, 36]],
  ["rug", 1, null], // flat, deliberately unchanged
];

function main() {
  for (const [type, minMeshes, heightRange] of EXPECTATIONS) {
    const spec = FURNITURE_CATALOG[type];
    const item = makeFurniture(type, 0, 0);
    const obj = buildFurnitureObject(item, spec);
    const meshCount = countMeshes(obj);
    check(`${type}: real composite (>= ${minMeshes} meshes, not one undifferentiated box) — got ${meshCount}`, meshCount >= minMeshes);
    if (heightRange) {
      const h = realHeightIn(obj);
      const [lo, hi] = heightRange;
      check(`${type}: real-world height ${h.toFixed(1)}in within [${lo}, ${hi}]in`, h >= lo && h <= hi);
    }
  }

  if (problems > 0) {
    console.error(`\n${problems} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll furniture geometry checks passed.");
}

main();
