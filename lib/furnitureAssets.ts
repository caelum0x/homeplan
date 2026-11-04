// Real CC0-licensed .glb furniture meshes — the proof-of-concept swap-in for
// buildFurnitureObject's hand-stacked box/cylinder primitives (see
// components/FloorPlan3D.tsx). Every file under public/assets/furniture-cc0/
// is vendored, unmodified geometry from Kenney's "Furniture Kit" (CC0 1.0 /
// public domain, https://kenney.nl/assets/furniture-kit — see that
// directory's LICENSE.txt for the full chain of custody and the other CC0
// sources evaluated for this set). This is additive: a furniture item whose
// type has no entry here keeps rendering the existing parametric geometry,
// exactly as before.
"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FurnitureType } from "./layout/types";

/**
 * Every vendored CC0 mesh (sofa, bed, table, chair, desk — see
 * public/assets/furniture-cc0/LICENSE.txt) is wired here, each via the exact
 * same real-mesh swap-in path in FloorPlan3D.tsx. Mapped to the catalog type
 * each Kenney source model actually depicts (bedDouble -> bed_queen, the
 * plain table -> dining_table, the plain chair -> dining_chair, desk ->
 * desk) — any other FurnitureType with no entry here keeps rendering the
 * existing parametric geometry, exactly as before.
 */
export const FURNITURE_GLB_ASSETS: Partial<Record<FurnitureType, string>> = {
  sofa: "/assets/furniture-cc0/sofa.glb",
  bed_queen: "/assets/furniture-cc0/bed.glb",
  dining_table: "/assets/furniture-cc0/table.glb",
  dining_chair: "/assets/furniture-cc0/chair.glb",
  desk: "/assets/furniture-cc0/desk.glb",
};

let cachedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!cachedLoader) cachedLoader = new GLTFLoader();
  return cachedLoader;
}

const modelPromiseCache = new Map<string, Promise<THREE.Object3D>>();

/**
 * Loads (and caches) the real mesh at `url`, resolving to a fresh, independent
 * clone every call so multiple placed instances of the same piece (e.g. two
 * sofas in one plan) never share a single Object3D across the scene graph.
 * Never rejects the caller into an unhandled state the render loop has to
 * special-case: load failures reject the returned promise and the caller
 * (FloorPlan3D) is expected to keep its already-rendered parametric fallback.
 */
export function loadFurnitureModel(url: string): Promise<THREE.Object3D> {
  let cached = modelPromiseCache.get(url);
  if (!cached) {
    cached = new Promise<THREE.Object3D>((resolve, reject) => {
      getLoader().load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
    modelPromiseCache.set(url, cached);
  }
  return cached.then((scene) => scene.clone(true));
}

/**
 * Real-world footprint (feet) the vendored mesh was authored at, used to scale
 * the loaded model onto HomePlan's own furniture item dimensions instead of
 * stretching it to fit the floor plan's exact (often programmatically chosen)
 * rectangle — a uniform scale keeps the model's real proportions intact, the
 * same principle buildFurnitureObject already applies with its DIM constants.
 */
const GLB_NATIVE_FOOTPRINT_FT: Partial<Record<FurnitureType, { w: number; h: number }>> = {
  // Kenney's loungeSofa.glb measured bounding box: 0.98m x 0.41m footprint.
  sofa: { w: 0.98 / 0.3048, h: 0.41 / 0.3048 },
  // Kenney's bedDouble.glb measured bounding box: 0.956m x 1.125m footprint.
  bed_queen: { w: 0.956 / 0.3048, h: 1.125 / 0.3048 },
  // Kenney's table.glb measured bounding box: 0.841m x 0.447m footprint.
  dining_table: { w: 0.841 / 0.3048, h: 0.447 / 0.3048 },
  // Kenney's chair.glb measured bounding box: 0.2m x 0.2m footprint.
  dining_chair: { w: 0.2 / 0.3048, h: 0.2 / 0.3048 },
  // Kenney's desk.glb measured bounding box: 0.734m x 0.384m footprint.
  desk: { w: 0.734 / 0.3048, h: 0.384 / 0.3048 },
};

/** Uniform scale factor to best-fit `item`'s real footprint without distorting the mesh. */
export function furnitureModelFitScale(type: FurnitureType, item: { w: number; h: number }): number {
  const native = GLB_NATIVE_FOOTPRINT_FT[type];
  if (!native) return 1;
  const scaleX = item.w / native.w;
  const scaleZ = item.h / native.h;
  return (scaleX + scaleZ) / 2;
}
