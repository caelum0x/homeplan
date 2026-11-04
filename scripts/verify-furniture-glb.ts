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

  // The real wiring: FURNITURE_GLB_ASSETS must point sofa at a file that actually exists, and
  // the scale computed for the catalog's real sofa footprint must be sane (positive, and close
  // enough to 1x that the real mesh fills roughly the same floor footprint as the parametric
  // placeholder it replaces, not visibly tiny or room-filling).
  const sofaUrl = FURNITURE_GLB_ASSETS.sofa;
  check("FURNITURE_GLB_ASSETS wires sofa to a real asset path", typeof sofaUrl === "string" && sofaUrl.length > 0);
  if (sofaUrl) {
    const relPath = sofaUrl.replace(/^\//, "");
    check("FURNITURE_GLB_ASSETS.sofa points at a file that exists in public/", fs.existsSync(path.join(PUBLIC_DIR, relPath)));
  }

  const catalogSofa = FURNITURE_CATALOG.sofa;
  const scale = furnitureModelFitScale("sofa", catalogSofa);
  check("furnitureModelFitScale returns a finite positive scale for the real sofa catalog entry", Number.isFinite(scale) && scale > 0);
  check("furnitureModelFitScale's scale keeps the swapped-in mesh within a sane range of the placeholder's footprint (0.3x-3x)", scale > 0.3 && scale < 3);

  // Every other furniture type must be untouched — this is a proof of concept for one piece,
  // not a silent catalog-wide change.
  const wiredTypes = Object.keys(FURNITURE_GLB_ASSETS);
  check("exactly one furniture type is wired to a real mesh so far (sofa)", wiredTypes.length === 1 && wiredTypes[0] === "sofa");

  if (problems === 0) {
    console.log("\nAll furniture .glb checks passed.");
    process.exit(0);
  } else {
    console.error(`\n${problems} problem(s) found.`);
    process.exit(1);
  }
}

main();
