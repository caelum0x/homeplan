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
 * Only `sofa` is wired as the real, working proof of concept this task asked
 * for. bed/table/chair/desk assets are vendored (same directory, same
 * license) and ready — add their keys here to extend the same real-mesh
 * treatment to them in a follow-up pass; nothing else needs to change.
 */
export const FURNITURE_GLB_ASSETS: Partial<Record<FurnitureType, string>> = {
  sofa: "/assets/furniture-cc0/sofa.glb",
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
};

/** Uniform scale factor to best-fit `item`'s real footprint without distorting the mesh. */
export function furnitureModelFitScale(type: FurnitureType, item: { w: number; h: number }): number {
  const native = GLB_NATIVE_FOOTPRINT_FT[type];
  if (!native) return 1;
  const scaleX = item.w / native.w;
  const scaleZ = item.h / native.h;
  return (scaleX + scaleZ) / 2;
}
