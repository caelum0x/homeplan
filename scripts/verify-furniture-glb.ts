// Real check for the CC0 .glb furniture-asset proof of concept (lib/furnitureAssets.ts +
// components/FloorPlan3D.tsx's real-mesh swap-in): every vendored .glb under
// public/assets/furniture-cc0/ actually parses as a valid glTF model with real geometry (not
// a placeholder/corrupt download), FURNITURE_GLB_ASSETS points at a file that exists on disk,
// and furnitureModelFitScale produces a sane, positive scale for the catalog's real sofa
// dimensions — not just "the file has bytes."

import * as fs from "fs";
import * as path from "path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FURNITURE_CATALOG } from "../lib/layout/furniture";
import { FURNITURE_GLB_ASSETS, furnitureModelFitScale } from "../lib/furnitureAssets";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

const PUBLIC_DIR = path.join(__dirname, "..", "public");

function countMeshes(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) n++;
  });
  return n;
}

function parseGlb(absPath: string): Promise<THREE.Object3D> {
  const buf = fs.readFileSync(absPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
  });
}

// scripts/sand3d/*.py-generated meshes (second furniture-realism pass, 2026-11-06):
// each is a real multi-part model (cabinet + seams + pulls, case + shelves, body +
// burners + knobs, etc. — see each .py file and public/assets/furniture-sand3d/
// LICENSE.txt for provenance), so beyond ">=1 mesh" each gets its own real minimum
// part count asserted below — proof it is not one undifferentiated box like the
// placeholder it replaces.
const SAND3D_MIN_MESH_COUNT: Record<string, number> = {
  "wardrobe.glb": 6,
  "dresser.glb": 8,
  "nightstand.glb": 8,
  "tv_stand.glb": 9,
  "bookshelf.glb": 4,
  "fridge.glb": 6,
  "stove.glb": 11,
  "kitchen_island.glb": 7,
};

async function main() {
  // Every vendored asset (not just the one currently wired) must be a real, parseable glTF —
  // these are "vendored and ready for a follow-up pass," so they should already be real files.
  const vendoredFiles = ["sofa.glb", "bed.glb", "table.glb", "chair.glb", "desk.glb"];
  for (const file of vendoredFiles) {
    const absPath = path.join(PUBLIC_DIR, "assets", "furniture-cc0", file);
    check(`${file} exists on disk`, fs.existsSync(absPath));
    if (!fs.existsSync(absPath)) continue;
    const sizeBytes = fs.statSync(absPath).size;
    check(`${file} is a real asset, not an empty/stub file (>1KB)`, sizeBytes > 1024);
    try {
      const scene = await parseGlb(absPath);
      const meshCount = countMeshes(scene);
      check(`${file} parses as a valid glTF with real geometry (>=1 mesh)`, meshCount >= 1);
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      check(`${file} has a non-degenerate bounding box (all dims > 0)`, size.x > 0 && size.y > 0 && size.z > 0);
    } catch (err) {
      check(`${file} parses as a valid glTF with real geometry (>=1 mesh)`, false);
      console.error(`  parse error: ${err}`);
    }
  }

  check("LICENSE.txt is vendored alongside the assets", fs.existsSync(path.join(PUBLIC_DIR, "assets", "furniture-cc0", "LICENSE.txt")));

  // Every originally-generated sand3d asset (scripts/sand3d/*.py) must also be a real,
  // parseable glTF with the real multi-part geometry its generator script built — not a
  // single undifferentiated box.
  const sand3dFiles = Object.keys(SAND3D_MIN_MESH_COUNT);
  for (const file of sand3dFiles) {
    const absPath = path.join(PUBLIC_DIR, "assets", "furniture-sand3d", file);
    check(`${file} exists on disk`, fs.existsSync(absPath));
    if (!fs.existsSync(absPath)) continue;
    const sizeBytes = fs.statSync(absPath).size;
    check(`${file} is a real asset, not an empty/stub file (>1KB)`, sizeBytes > 1024);
    try {
      const scene = await parseGlb(absPath);
      const meshCount = countMeshes(scene);
      check(
        `${file} is a real multi-part model (>=${SAND3D_MIN_MESH_COUNT[file]} meshes, not one undifferentiated box)`,
        meshCount >= SAND3D_MIN_MESH_COUNT[file],
      );
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      check(`${file} has a non-degenerate bounding box (all dims > 0)`, size.x > 0 && size.y > 0 && size.z > 0);
      check(`${file}'s base sits on the floor (bbox min.y ~= 0)`, Math.abs(box.min.y) < 0.01);
    } catch (err) {
      check(`${file} parses as a valid glTF with real geometry`, false);
      console.error(`  parse error: ${err}`);
    }
  }

  check("LICENSE.txt is vendored alongside the sand3d assets", fs.existsSync(path.join(PUBLIC_DIR, "assets", "furniture-sand3d", "LICENSE.txt")));

  // The real wiring: every entry in FURNITURE_GLB_ASSETS must point at a file that actually
  // exists, and the scale computed for that type's real catalog footprint must be sane
  // (positive, and close enough to 1x that the real mesh fills roughly the same floor
  // footprint as the parametric placeholder it replaces, not visibly tiny or room-filling).
  const wiredTypes = Object.keys(FURNITURE_GLB_ASSETS) as Array<keyof typeof FURNITURE_GLB_ASSETS>;
  const expectedWiredTypes = [
    "sofa",
    "bed_queen",
    "dining_table",
    "dining_chair",
    "desk",
    "wardrobe",
    "dresser",
    "nightstand",
    "tv_stand",
    "bookshelf",
    "fridge",
    "stove",
    "kitchen_island",
  ];
  check(
    `all ${expectedWiredTypes.length} vendored furniture types are wired to a real mesh (${expectedWiredTypes.join(", ")})`,
    wiredTypes.length === expectedWiredTypes.length &&
      expectedWiredTypes.every((t) => wiredTypes.includes(t as (typeof wiredTypes)[number])),
  );

  for (const type of wiredTypes) {
    const url = FURNITURE_GLB_ASSETS[type];
    check(`FURNITURE_GLB_ASSETS wires ${type} to a real asset path`, typeof url === "string" && url.length > 0);
    if (url) {
      const relPath = url.replace(/^\//, "");
      check(`FURNITURE_GLB_ASSETS.${type} points at a file that exists in public/`, fs.existsSync(path.join(PUBLIC_DIR, relPath)));
    }

    const catalogEntry = FURNITURE_CATALOG[type];
    const scale = furnitureModelFitScale(type, catalogEntry);
    check(`furnitureModelFitScale returns a finite positive scale for the real ${type} catalog entry`, Number.isFinite(scale) && scale > 0);
    check(`furnitureModelFitScale's scale keeps the swapped-in ${type} mesh within a sane range of the placeholder's footprint (0.3x-3x)`, scale > 0.3 && scale < 3);
  }

  if (problems === 0) {
    console.log("\nAll furniture .glb checks passed.");
    process.exit(0);
  } else {
    console.error(`\n${problems} problem(s) found.`);
    process.exit(1);
  }
}

main();
