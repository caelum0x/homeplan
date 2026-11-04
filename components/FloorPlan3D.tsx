"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Door, FloorPlan, FurnitureItem, Room, Wall, Window as PlanWindow } from "@/lib/layout/types";
import { FURNITURE_CATALOG, type FurnitureSpec } from "@/lib/layout/furniture";
import { FURNITURE_GLB_ASSETS, furnitureModelFitScale, loadFurnitureModel } from "@/lib/furnitureAssets";
import { resolveDoorSwingGeometry } from "@/lib/layout/doorSwings";
import { ROOM_FILL } from "@/lib/renderSvg";
import { STAIR_RISERS } from "@/lib/layout/stairSpec";

/**
 * Real residential dimensions (inches, converted to feet below), used by
 * buildFurnitureObject's composite shapes — each piece's proportions match the actual
 * furniture it represents (a fridge is genuinely taller than a range, a nightstand
 * genuinely shorter than a wardrobe) instead of one undifferentiated per-category box.
 */
const IN = (inches: number) => inches / 12;
const DIM = {
  bedFrame: IN(14),
  mattress: IN(10),
  headboardAboveMattress: IN(24),
  pillow: IN(6),
  sofaSeat: IN(18),
  sofaBack: IN(20),
  sofaArm: IN(24),
  chairSeat: IN(18),
  chairBack: IN(20),
  chairLegRadius: IN(1),
  coffeeTable: IN(18),
  deskHeight: IN(29),
  diningTable: IN(30),
  tableTop: IN(1.5),
  tableLegInset: IN(2.5),
  islandCounter: IN(36),
  islandCounterTop: IN(1.5),
  fridgeHeight: IN(68),
  rangeHeight: IN(36),
  rangeCooktop: IN(1.2),
  wardrobeHeight: IN(72),
  dresserHeight: IN(32),
  nightstandHeight: IN(24),
  tvStandHeight: IN(20),
  bookshelfHeight: IN(72),
  toiletBowl: IN(16),
  toiletTank: IN(20),
  bathtubHeight: IN(16),
  showerCurb: IN(3),
  showerGlassHeight: IN(66),
  vanityCounter: IN(32),
} as const;

/** Clamps the corner radius so `RoundedBoxGeometry` never receives a radius larger than
 * half the smallest dimension (which would otherwise produce degenerate/self-intersecting
 * geometry) — every rounded piece below goes through this instead of a bare `new
 * RoundedBoxGeometry(...)` call. */
function roundedBox(w: number, h: number, d: number, radius: number, segments = 2): RoundedBoxGeometry {
  const safeRadius = Math.max(0, Math.min(radius, Math.min(w, h, d) / 2 - 0.001));
  return new RoundedBoxGeometry(w, h, d, segments, safeRadius);
}

/**
 * Cheaply checks for real WebGL support with a throwaway canvas before we
 * ever construct a THREE.WebGLRenderer. Some environments (old browsers,
 * locked-down corporate machines, certain headless/sandboxed contexts) have
 * no WebGL at all — in that case THREE.WebGLRenderer's constructor can throw
 * or, worse, the browser's GPU process can crash outright instead of
 * returning a catchable error. Checking first avoids ever reaching that path.
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

/** Frees GPU buffers for a removed-from-scene object — used when the real-mesh furniture
 * swap-in (see FURNITURE_GLB_ASSETS) replaces a parametric placeholder that's otherwise still
 * referenced nowhere, so its geometry/material would otherwise leak for the rest of the session. */
function disposeObject3D(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

const WALL_HEIGHT = 9; // feet
const WALL_THICKNESS = 0.4; // feet, just for visual volume — not structural
const WINDOW_SILL_HEIGHT = 2.5; // feet off the floor — standard residential sill height
const WINDOW_PANE_HEIGHT = 4; // feet — sill (2.5') + pane (4') = 6.5' head height, under the 9' wall
const DOOR_HEIGHT = 6 + 8 / 12; // 6'8" — standard residential interior door height
/** How close (in feet) a door/window midpoint must sit to a wall's line and span to be
 * treated as "on" that wall — generous enough to absorb float drift from the layout engine's
 * own arithmetic, tight enough to never pick the wrong parallel wall in a tight floor plan. */
const OPENING_WALL_TOLERANCE = 0.25;

type Opening = { x: number; y: number; orientation: "h" | "v"; width: number; height: number; sill: number };

function wallIsHorizontal(wall: Wall): boolean {
  return Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);
}

/** Finds the wall segment an opening's midpoint actually sits on, by orientation + line +
 * span — the same geometry `lib/layout/generate.ts` used to place the opening in the first
 * place, so this only ever fails to match if the two disagree (defensive, not expected). */
function findOwningWall(opening: Opening, walls: Wall[]): Wall | undefined {
  let best: Wall | undefined;
  let bestDist = Infinity;
  for (const wall of walls) {
    const horizontal = wallIsHorizontal(wall);
    if ((opening.orientation === "h") !== horizontal) continue;
    const lineCoord = horizontal ? wall.y1 : wall.x1;
    const openingLineCoord = horizontal ? opening.y : opening.x;
    const dist = Math.abs(lineCoord - openingLineCoord);
    if (dist > OPENING_WALL_TOLERANCE) continue;
    const spanCoord = horizontal ? opening.x : opening.y;
    const [lo, hi] = horizontal ? [Math.min(wall.x1, wall.x2), Math.max(wall.x1, wall.x2)] : [Math.min(wall.y1, wall.y2), Math.max(wall.y1, wall.y2)];
    if (spanCoord < lo - OPENING_WALL_TOLERANCE || spanCoord > hi + OPENING_WALL_TOLERANCE) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = wall;
    }
  }
  return best;
}

/**
 * Builds each wall as a real solid CSG `Brush` (three-bvh-csg, the same boolean-geometry
 * library Pascal/pascalorg's BIM editor depends on — adopted here directly rather than
 * hand-rolled) and subtracts a brush per door/window opening that lands on it, so doors and
 * windows cut an actual hole through the wall instead of the previous honest-but-flat
 * simplification (a floor marker for doors, a glass pane floating in front of a solid box for
 * windows, with no real gap in the wall geometry behind either).
 */
export function buildWallMeshes(walls: Wall[], doors: Door[], windows: PlanWindow[], wallHeightFactor: number): THREE.Mesh[] {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const wallHeight = WALL_HEIGHT * wallHeightFactor;

  const openingsByWall = new Map<Wall, Opening[]>();
  for (const door of doors) {
    const opening: Opening = { x: door.x, y: door.y, orientation: door.orientation, width: door.width, height: DOOR_HEIGHT, sill: 0 };
    const wall = findOwningWall(opening, walls);
    if (!wall) continue;
    const list = openingsByWall.get(wall) ?? [];
    list.push(opening);
    openingsByWall.set(wall, list);
  }
  for (const win of windows) {
    const opening: Opening = { x: win.x, y: win.y, orientation: win.orientation, width: win.width, height: WINDOW_PANE_HEIGHT, sill: WINDOW_SILL_HEIGHT };
    const wall = findOwningWall(opening, walls);
    if (!wall) continue;
    const list = openingsByWall.get(wall) ?? [];
    list.push(opening);
    openingsByWall.set(wall, list);
  }

  const meshes: THREE.Mesh[] = [];
  for (const wall of walls) {
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (length < 0.1) continue;
    const thickness = wall.exterior ? WALL_THICKNESS * 1.4 : WALL_THICKNESS;
    const material = new THREE.MeshStandardMaterial({
      color: wall.exterior ? WALL_COLOR_EXTERIOR : WALL_COLOR_INTERIOR,
      roughness: 0.88,
    });
    const midX = (wall.x1 + wall.x2) / 2;
    const midZ = (wall.y1 + wall.y2) / 2;
    const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
    const horizontal = wallIsHorizontal(wall);

    let brush: Brush = new Brush(new THREE.BoxGeometry(length, wallHeight, thickness), material);
    brush.position.set(midX, wallHeight / 2, midZ);
    brush.rotation.y = -angle;
    brush.updateMatrixWorld();

    const openings = openingsByWall.get(wall) ?? [];
    for (const opening of openings) {
      // Cut straight through the wall's own axis (not just its nominal thickness) so the
      // subtraction brush can never leave a sliver of un-cut geometry from rotation rounding.
      const cutGeo = new THREE.BoxGeometry(
        horizontal ? opening.width : thickness * 4,
        opening.height,
        horizontal ? thickness * 4 : opening.width,
      );
      const cutBrush = new Brush(cutGeo);
      cutBrush.position.set(opening.x, opening.sill + opening.height / 2, opening.y);
      cutBrush.updateMatrixWorld();
      const result = evaluator.evaluate(brush, cutBrush, SUBTRACTION);
      result.material = material;
      brush = result;
    }

    brush.castShadow = true;
    brush.receiveShadow = true;
    meshes.push(brush);
  }
  return meshes;
}

/** Warm cream, matching the product's own `--color-bg`/`--color-surface-sunken` paper tones
 * (app/globals.css) — replaces the prior flat gray so walls read as a material, not a shell. */
const WALL_COLOR_EXTERIOR = 0xe6d9bd;
const WALL_COLOR_INTERIOR = 0xf0e6cd;

const BATH_TYPES = new Set(["bath", "primary_bath", "half_bath"]);

/**
 * `ROOM_FILL` (lib/renderSvg.ts) is the single source of truth for a room's identity color.
 * A pure algorithmic saturation-boost of those hex values was tried first and discarded: several
 * room types (bedroom, primary_bedroom) sit at ~195° hue and bath types sit at ~185° — nearly
 * identical blues once boosted, so bedrooms and bathrooms rendered as the same "blue-gray" in 3D,
 * not the distinct materials Maket's reference shows. Worse, several types (great_room/living,
 * garage, hallway, closet) have near-zero original saturation, so their *computed* hue is
 * numerically arbitrary — boosting saturation on an arbitrary hue gives an unpredictable color,
 * not a meaningful one. This explicit per-type map is a deliberate, reliable fix: each entry is
 * still drawn from that room type's existing ROOM_FILL hue *family* (kitchen/dining/entry stay
 * warm tan, office stays lavender-purple, garage/closet/hallway stay neutral) but bedroom is
 * pushed to a clear warm blush and living/great_room to a clear mint — the two hues that were
 * colliding — so each room type is reliably visually distinct, matching the reference comparison.
 * Falls back to a boosted ROOM_FILL hue only for a room type not listed here (forward-compat).
 */
const VIVID_ROOM_COLOR: Partial<Record<Room["type"], number>> = {
  entry: 0xd9c9a8,
  great_room: 0xb8ddc4,
  living: 0xb8ddc4,
  kitchen: 0xe8d9b8,
  dining: 0xe0d2b0,
  primary_bedroom: 0xe8c4d0,
  bedroom: 0xecd0da,
  office: 0xcdbfe0,
  garage: 0xc9c9c4,
  closet: 0xdcdcd6,
  hallway: 0xe8e4d8,
  stairs: 0xc8a97e, // oak-stair tone, clearly distinct from the pale entry/hallway it sits beside
};

function vividForLighting(hex: string): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const s = Math.min(1, Math.max(hsl.s, 0.4));
  const l = Math.min(0.78, Math.max(0.42, hsl.l - 0.08));
  return new THREE.Color().setHSL(hsl.h, s, l);
}

let tileTextureCache: THREE.Texture | null = null;
/** A small procedural checker tile texture for bathroom floors — code-drawn (zero licensing
 * risk, matches this project's existing "code-drawn, not an asset pack" furniture/icon approach),
 * giving bathrooms the same "this is tile, not carpet" visual read Maket's reference has. */
function bathTileTexture(): THREE.Texture {
  if (tileTextureCache) return tileTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const light = "#eaf4f6";
  const grout = "#c7dde1";
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const inset = 3;
  ctx.fillStyle = light;
  ctx.fillRect(inset, inset, size / 2 - inset * 1.5, size / 2 - inset * 1.5);
  ctx.fillRect(size / 2 + inset * 0.5, inset, size / 2 - inset * 1.5, size / 2 - inset * 1.5);
  ctx.fillRect(inset, size / 2 + inset * 0.5, size / 2 - inset * 1.5, size / 2 - inset * 1.5);
  ctx.fillRect(size / 2 + inset * 0.5, size / 2 + inset * 0.5, size / 2 - inset * 1.5, size / 2 - inset * 1.5);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tileTextureCache = tex;
  return tex;
}

function roomFloorMaterial(room: Room): THREE.Material {
  if (room.floorColor) {
    // User picked this exact color in the materials picker — honor it exactly (boosted for
    // legibility), don't override their explicit choice with the type-based vivid map.
    return new THREE.MeshStandardMaterial({ color: vividForLighting(room.floorColor), roughness: 0.82 });
  }
  if (BATH_TYPES.has(room.type)) {
    const tex = bathTileTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, room.w / 1.5), Math.max(1, room.h / 1.5));
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 });
  }
  const vivid = VIVID_ROOM_COLOR[room.type];
  if (vivid !== undefined) {
    return new THREE.MeshStandardMaterial({ color: vivid, roughness: 0.82 });
  }
  return new THREE.MeshStandardMaterial({ color: vividForLighting(ROOM_FILL[room.type] ?? "#f0f0f0"), roughness: 0.82 });
}

/**
 * Builds a real, recognizable low-poly silhouette per furniture category instead of one
 * undifferentiated box — a bed gets a headboard + pillow, a sofa gets a back + arms, a table
 * gets a top + legs, etc. Still deliberately code-drawn primitives (consistent with this
 * project's existing 2D furniture-icon approach), not an external asset pack.
 */
export function buildFurnitureObject(item: FurnitureItem, spec: FurnitureSpec): THREE.Object3D {
  const group = new THREE.Group();
  const w = item.w;
  const d = item.h;
  const base = new THREE.Color(spec.color);
  const darker = base.clone().multiplyScalar(0.8);
  const lighter = base.clone().lerp(new THREE.Color(0xffffff), 0.4);
  const mat = (c: THREE.Color, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color: c, roughness, metalness });
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const label = spec.label.toLowerCase();

  switch (spec.category) {
    case "sleeping": {
      const frameH = DIM.bedFrame;
      add(new THREE.BoxGeometry(w, frameH, d), mat(darker), 0, frameH / 2, 0);
      const inset = IN(2);
      add(
        roundedBox(w - inset * 2, DIM.mattress, d - inset * 2, DIM.mattress * 0.4),
        mat(base),
        0,
        frameH + DIM.mattress / 2,
        0,
      );
      const headboardH = frameH + DIM.mattress + DIM.headboardAboveMattress;
      add(new THREE.BoxGeometry(w, headboardH, IN(3)), mat(darker), 0, headboardH / 2, -d / 2 + IN(1.5));
      add(
        roundedBox(w * 0.38, DIM.pillow, d * 0.22, DIM.pillow * 0.45),
        mat(lighter),
        0,
        frameH + DIM.mattress + DIM.pillow / 2,
        -d / 2 + d * 0.18,
      );
      break;
    }
    case "seating": {
      if (label.includes("sofa") || label.includes("armchair")) {
        const seatH = DIM.sofaSeat;
        const seatDepth = d * 0.72;
        add(roundedBox(w, seatH, seatDepth, seatH * 0.22), mat(base), 0, seatH / 2, d / 2 - seatDepth / 2);
        const backH = DIM.sofaBack;
        add(roundedBox(w, backH, IN(7), IN(2.5)), mat(darker), 0, seatH + backH / 2, -d / 2 + IN(3.5));
        const armW = Math.max(IN(5), Math.min(IN(7), w * 0.12));
        const armH = DIM.sofaArm;
        add(roundedBox(armW, armH, d * 0.85, IN(2)), mat(darker), -(w / 2 - armW / 2), armH / 2, 0);
        add(roundedBox(armW, armH, d * 0.85, IN(2)), mat(darker), w / 2 - armW / 2, armH / 2, 0);
      } else {
        // Dining/office chair: real 18" seat height, legs the full height of the seat, a
        // backrest rising a real 20" above the seat.
        const seatH = DIM.chairSeat;
        add(roundedBox(w, IN(2), d, IN(0.6)), mat(base), 0, seatH, 0);
        const legR = DIM.chairLegRadius;
        for (const [sx, sz] of [
          [-w / 2 + legR * 1.5, -d / 2 + legR * 1.5],
          [w / 2 - legR * 1.5, -d / 2 + legR * 1.5],
          [-w / 2 + legR * 1.5, d / 2 - legR * 1.5],
          [w / 2 - legR * 1.5, d / 2 - legR * 1.5],
        ]) {
          add(new THREE.CylinderGeometry(legR, legR, seatH, 8), mat(darker, 0.6, 0.2), sx, seatH / 2, sz);
        }
        const backH = DIM.chairBack;
        add(roundedBox(w, backH, IN(1.5), IN(0.5)), mat(base), 0, seatH + backH / 2, -d / 2 + IN(0.9));
      }
      break;
    }
    case "surface": {
      const topThickness = DIM.tableTop;
      const legR = IN(1.5);
      if (label.includes("island")) {
        // Kitchen island: a solid cabinet base with a thin overhanging counter top, not a
        // legged table — real residential islands are built-in casework, not furniture legs.
        const baseH = DIM.islandCounter - DIM.islandCounterTop;
        add(new THREE.BoxGeometry(w * 0.94, baseH, d * 0.94), mat(darker), 0, baseH / 2, 0);
        add(roundedBox(w, DIM.islandCounterTop, d, IN(0.3)), mat(lighter, 0.4, 0.1), 0, baseH + DIM.islandCounterTop / 2, 0);
        break;
      }
      const legH = label.includes("coffee")
        ? DIM.coffeeTable - topThickness
        : label.includes("desk")
          ? DIM.deskHeight - topThickness
          : DIM.diningTable - topThickness; // dining table default
      add(roundedBox(w, topThickness, d, IN(0.4)), mat(base), 0, legH + topThickness / 2, 0);
      const legInset = DIM.tableLegInset;
      for (const [sx, sz] of [
        [-w / 2 + legInset, -d / 2 + legInset],
        [w / 2 - legInset, -d / 2 + legInset],
        [-w / 2 + legInset, d / 2 - legInset],
        [w / 2 - legInset, d / 2 - legInset],
      ]) {
        add(new THREE.CylinderGeometry(legR, legR, legH, 8), mat(darker, 0.6, 0.2), sx, legH / 2, sz);
      }
      break;
    }
    case "appliance": {
      if (label.includes("fridge")) {
        const h = DIM.fridgeHeight;
        add(new THREE.BoxGeometry(w, h, d), mat(base, 0.35, 0.6), 0, h / 2, 0);
        add(new THREE.BoxGeometry(w * 0.03, h * 0.9, d * 0.6), mat(darker, 0.4, 0.3), -w * 0.18, h / 2, d * 0.1);
      } else {
        const h = DIM.rangeHeight;
        add(new THREE.BoxGeometry(w, h, d), mat(base, 0.35, 0.6), 0, h / 2, 0);
        add(new THREE.BoxGeometry(w * 0.9, DIM.rangeCooktop, d * 0.85), mat(darker, 0.3, 0.7), 0, h + DIM.rangeCooktop / 2, -d * 0.02);
      }
      break;
    }
    case "fixture": {
      if (label.includes("toilet")) {
        const bowlH = DIM.toiletBowl;
        add(new THREE.CylinderGeometry(w * 0.38, w * 0.3, bowlH, 12), mat(base), 0, bowlH / 2, d * 0.12);
        const tankH = DIM.toiletTank;
        add(roundedBox(w * 0.85, tankH, d * 0.3, IN(0.5)), mat(lighter), 0, tankH / 2, -d / 2 + d * 0.15);
      } else if (label.includes("bathtub")) {
        const h = DIM.bathtubHeight;
        add(roundedBox(w, h, d, IN(1.2)), mat(base), 0, h / 2, 0);
        add(new THREE.BoxGeometry(w * 0.82, IN(1), d * 0.82), mat(lighter, 0.25, 0), 0, h - IN(2), 0);
      } else if (label.includes("shower")) {
        add(new THREE.BoxGeometry(w, DIM.showerCurb, d), mat(base), 0, DIM.showerCurb / 2, 0);
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0xcfe6ea,
          transparent: true,
          opacity: 0.25,
          roughness: 0.1,
        });
        add(new THREE.BoxGeometry(w, DIM.showerGlassHeight, IN(1)), glassMat, 0, DIM.showerGlassHeight / 2, -d / 2 + IN(0.5));
      } else {
        const counterH = DIM.vanityCounter;
        add(roundedBox(w, counterH, d, IN(1)), mat(base), 0, counterH / 2, 0);
        add(roundedBox(w * 0.6, IN(1.2), d * 0.5, IN(0.3)), mat(lighter), 0, counterH - IN(1), 0);
      }
      break;
    }
    case "storage": {
      // Real per-piece heights (a wardrobe is genuinely ~2x a nightstand) instead of one
      // undifferentiated category height.
      const h = label.includes("wardrobe")
        ? DIM.wardrobeHeight
        : label.includes("bookshelf")
          ? DIM.bookshelfHeight
          : label.includes("nightstand")
            ? DIM.nightstandHeight
            : label.includes("tv")
              ? DIM.tvStandHeight
              : DIM.dresserHeight; // dresser default
      add(roundedBox(w, h, d, IN(0.5)), mat(base), 0, h / 2, 0);
      const seams = label.includes("bookshelf") ? 3 : 1;
      for (let i = 1; i <= seams; i++) {
        add(new THREE.BoxGeometry(w * 0.96, IN(0.3), IN(0.15)), mat(darker), 0, (h * i) / (seams + 1), d / 2 - IN(0.1));
      }
      break;
    }
    default: {
      // decor (rug): thin, semi-transparent — unchanged behavior from before.
      add(
        new THREE.BoxGeometry(w, 0.05, d),
        new THREE.MeshStandardMaterial({ color: base, transparent: true, opacity: 0.85, roughness: 0.9 }),
        0,
        0.025,
        0,
      );
    }
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

interface FloorPlan3DProps {
  plan: FloorPlan;
  /** Initial camera placement, as multiples of the plan's diagonal. Shared default used
   * by both the in-app Studio 3D tab and the marketing hero capture (`public/hero-3d.png`
   * is a screenshot of this same component) — keep enough margin here (model should not
   * touch any frame edge) since neither caller currently overrides it. */
  cameraRadiusFactor?: number;
  cameraElevationFactor?: number;
  /** Multiplier on the real 9ft wall height — defaults to 1. */
  wallHeightFactor?: number;
}

/**
 * Real Three.js scene built directly from the plan's own room rectangles
 * and wall segments — no photogrammetry, no placeholder box, every floor
 * slab / wall / door gap has the actual coordinates from `plan`. Orbit
 * controls let the architect walk the camera around and look inside.
 */
/** Exposed to the host page so a toolbar button outside this component can trigger a real
 * export of exactly what's on screen — no second render pipeline, no AI call, the same
 * CSG walls/doors/windows/furniture/stairs geometry the live orbit view already shows. */
export interface FloorPlan3DHandle {
  /** Returns a `data:image/png;base64,...` URL of the current scene at a higher pixel
   * density than the live canvas, or `null` if the scene isn't mounted/ready (WebGL
   * unsupported, or called before the first real frame). Never throws. */
  captureImage: () => string | null;
}

export const FloorPlan3D = forwardRef<FloorPlan3DHandle, FloorPlan3DProps>(function FloorPlan3D(
  { plan, cameraRadiusFactor = 0.8, cameraElevationFactor = 1.75, wallHeightFactor = 1 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dimsRef = useRef<{ width: number; height: number }>({ width: 800, height: 520 });

  useImperativeHandle(
    ref,
    () => ({
      captureImage: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        const { width, height } = dimsRef.current;
        const originalPixelRatio = renderer.getPixelRatio();
        // Render one extra frame at a higher pixel density than the live view uses — a real
        // export deserves more detail than the 520px-tall on-screen canvas, but we don't want
        // to permanently resize the interactive view just to take a snapshot.
        const exportPixelRatio = Math.min(4, Math.max(2, originalPixelRatio * 2));
        try {
          renderer.setPixelRatio(exportPixelRatio);
          renderer.setSize(width, height, false);
          renderer.render(scene, camera);
          return renderer.domElement.toDataURL("image/png");
        } catch {
          return null;
        } finally {
          renderer.setPixelRatio(originalPixelRatio);
          renderer.setSize(width, height, false);
          renderer.render(scene, camera);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!hasWebGL()) {
      setStatus("unsupported");
      return;
    }

    // Guards the async real-mesh furniture swap-in below: the GLB load can resolve after this
    // effect has already torn down (plan changed, component unmounted) — without this flag a
    // late resolve would call scene.add()/scene.remove() on a scene nothing renders anymore,
    // a real (if harmless-looking) leak of the loaded mesh's GPU buffers.
    let cancelled = false;

    const width = container.clientWidth || 800;
    const height = 520;

    dimsRef.current = { width, height };

    let renderer: THREE.WebGLRenderer;
    try {
      // preserveDrawingBuffer: captureImage() above calls toDataURL() on this same canvas;
      // without this flag some browsers can clear the drawing buffer before that read happens.
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false, preserveDrawingBuffer: true });
    } catch {
      setStatus("unsupported");
      return;
    }
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f4);
    sceneRef.current = scene;

    const centerX = plan.footprint.w / 2;
    const centerZ = plan.footprint.h / 2;
    const diag = Math.hypot(plan.footprint.w, plan.footprint.h);

    // Narrower FOV + a higher elevation ratio than a typical walkthrough camera reads closer to a
    // clean 3/4 isometric massing render (flatter perspective distortion) while staying a real
    // perspective camera (no extra orthographic-camera plumbing needed for this honest massing view).
    const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 1000);
    camera.position.set(centerX + diag * cameraRadiusFactor, diag * cameraElevationFactor, centerZ + diag * cameraRadiusFactor);
    cameraRef.current = camera;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    setStatus("ready");

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0, centerZ);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't let the camera dip below the floor
    controls.update();

    // Soft sky/ground hemisphere fill (warm above, muted below) plus one shadow-casting "sun" —
    // this is what gives walls/floors real shading gradients instead of flat, uniformly-lit color.
    scene.add(new THREE.HemisphereLight(0xfff3df, 0xd8d2c4, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.05);
    sun.position.set(centerX + diag * 0.4, diag * 0.9, centerZ - diag * 0.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowSpan = diag * 0.75;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = diag * 3;
    sun.shadow.bias = -0.0015;
    sun.target.position.set(centerX, 0, centerZ);
    scene.add(sun);
    scene.add(sun.target);

    // Ground slab, slightly larger than the footprint so the house doesn't look like it floats on nothing.
    const groundGeo = new THREE.PlaneGeometry(plan.footprint.w + 20, plan.footprint.h + 20);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, -0.05, centerZ);
    ground.receiveShadow = true;
    scene.add(ground);

    // One floor slab per room, materials pulled from the shared ROOM_FILL palette (boosted for
    // 3D legibility) with real tile for bathrooms and the materials-picker override honored.
    for (const room of plan.rooms) {
      const floorGeo = new THREE.BoxGeometry(room.w, 0.2, room.h);
      const floor = new THREE.Mesh(floorGeo, roomFloorMaterial(room));
      floor.position.set(room.x + room.w / 2, 0.1, room.y + room.h / 2);
      floor.receiveShadow = true;
      scene.add(floor);
    }

    // Stairs: real stepped geometry from the room's own stairRun (the same flight lib/stairs.ts
    // draws as treads in 2D). Ground floor = 14 solid treads rising toward the top of the flight,
    // each one riser higher (floor-to-ceiling height / STAIR_RISERS); upper floor = the open
    // stairwell over that same flight, drawn as a dark void with a guard rail along its open side.
    for (const room of plan.rooms) {
      const stair = room.type === "stairs" ? room.stairRun : undefined;
      if (stair) scene.add(buildStairObject(room, stair, WALL_HEIGHT * wallHeightFactor));
    }

    // Walls built as real solid CSG brushes with actual door/window holes cut through them —
    // see buildWallMeshes above (three-bvh-csg, not a hand-rolled boolean-geometry pass).
    for (const mesh of buildWallMeshes(plan.walls, plan.doors, plan.windows ?? [], wallHeightFactor)) {
      scene.add(mesh);
    }

    // Windows: a real glass pane set inside the real cut opening built above, at window height —
    // the thing that makes a window a window is that it's a pane of glass partway up a wall, sitting
    // in an actual gap in the wall behind it (not floating in front of a solid box, as before this
    // CSG pass). This was the one real gap left after the 2026-10-27 flagship-audit windows fix
    // (`ed91f1e`) shipped windows to the SVG/Studio renderers but never to this 3D view or exports.
    for (const win of plan.windows ?? []) {
      const paneThickness = WALL_THICKNESS * 0.4;
      const paneGeo = new THREE.BoxGeometry(
        win.orientation === "h" ? win.width : paneThickness,
        WINDOW_PANE_HEIGHT,
        win.orientation === "h" ? paneThickness : win.width,
      );
      const paneMat = new THREE.MeshStandardMaterial({
        color: 0x9fcfe8,
        transparent: true,
        opacity: 0.5,
        roughness: 0.1,
        metalness: 0.1,
      });
      const pane = new THREE.Mesh(paneGeo, paneMat);
      pane.position.set(win.x, WINDOW_SILL_HEIGHT + WINDOW_PANE_HEIGHT / 2, win.y);
      scene.add(pane);

      // A thin white mullion bar across the pane's mid-height, matching the pale-blue-bar-plus-
      // white-mullion-line window mark used by the SVG/Studio renderers (lib/renderSvg.ts).
      const mullionGeo = new THREE.BoxGeometry(
        win.orientation === "h" ? win.width : paneThickness * 1.3,
        0.08,
        win.orientation === "h" ? paneThickness * 1.3 : win.width,
      );
      const mullion = new THREE.Mesh(mullionGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      mullion.position.set(win.x, WINDOW_SILL_HEIGHT + WINDOW_PANE_HEIGHT / 2, win.y);
      scene.add(mullion);
    }

    // Door leaves: a real panel from the hinge to its open tip, at the same hinge/swing-into
    // choice `computeDoorSwings` already scored against this plan's own furniture (lib/layout/
    // doorSwings.ts) — the same geometry the 2D/Studio swing-arc marks draw, not a separate guess.
    // Shown open (not closed flush with the wall) so the real cut opening behind it stays visible
    // and readable in a massing view, matching how the 2D swing-arc mark already reads as "open."
    const doorWallHeight = WALL_HEIGHT * wallHeightFactor;
    for (const door of plan.doors) {
      const geometry = resolveDoorSwingGeometry(door, plan.rooms);
      if (!geometry) continue;
      const { hinge, openTip } = geometry;
      const leafThickness = WALL_THICKNESS * 0.35;
      const leafHeight = Math.min(DOOR_HEIGHT, doorWallHeight - 0.2);
      const leafGeo = new THREE.BoxGeometry(door.width, leafHeight, leafThickness);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const midX = (hinge.x + openTip.x) / 2;
      const midZ = (hinge.y + openTip.y) / 2;
      const angle = Math.atan2(openTip.y - hinge.y, openTip.x - hinge.x);
      leaf.position.set(midX, leafHeight / 2, midZ);
      leaf.rotation.y = -angle;
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      scene.add(leaf);
    }

    // Furniture: a real composite silhouette per category (bed+headboard, sofa+back+arms,
    // table+legs, etc. — see buildFurnitureObject), not one undifferentiated flat box.
    for (const item of plan.furniture) {
      const spec = FURNITURE_CATALOG[item.type];
      const obj = buildFurnitureObject(item, spec);
      const floorOffset = item.type === "rug" ? 0.03 : 0.2;
      obj.position.set(item.x + item.w / 2, floorOffset, item.y + item.h / 2);
      obj.rotation.y = (-item.rotation * Math.PI) / 180;
      scene.add(obj);

      // Real-mesh proof of concept: a handful of furniture types (see FURNITURE_GLB_ASSETS)
      // have a real, CC0-licensed .glb swapped in once it finishes loading, in place of the
      // parametric placeholder just added above. Non-blocking and additive — the parametric
      // piece stays on screen (and stays the permanent result for every other furniture type)
      // until/unless a real mesh actually loads successfully.
      const glbUrl = FURNITURE_GLB_ASSETS[item.type];
      if (glbUrl) {
        const placeholder = obj;
        const position = placeholder.position.clone();
        const rotationY = placeholder.rotation.y;
        loadFurnitureModel(glbUrl)
          .then((model) => {
            if (cancelled) return;
            const scale = furnitureModelFitScale(item.type, item);
            model.scale.setScalar(scale);
            // The vendored mesh's own origin sits at its footprint's near corner (min x/z, y=0),
            // same convention buildFurnitureObject uses before its own position.set() above —
            // re-center it the same way so the swap lands exactly where the placeholder was.
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.set(position.x - center.x, position.y, position.z - center.z);
            model.rotation.y = rotationY;
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            scene.add(model);
            scene.remove(placeholder);
            disposeObject3D(placeholder);
          })
          .catch(() => {
            // Real network/parse failures (offline, self-host without the public/ asset, etc.)
            // keep the already-rendered parametric placeholder — never a blank gap in the room.
          });
      }
    }

    let frameId = 0;
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    function handleResize() {
      const w = container?.clientWidth || 800;
      dimsRef.current = { width: w, height };
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      container.innerHTML = "";
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [plan, cameraRadiusFactor, cameraElevationFactor, wallHeightFactor]);

  return (
    <div>
      <div
        ref={containerRef}
        className="card"
        style={{
          width: "100%",
          height: 520,
          overflow: "hidden",
          display: status === "unsupported" ? "flex" : "block",
          alignItems: "center",
          justifyContent: "center",
          background: status === "unsupported" ? "var(--color-surface-sunken)" : undefined,
        }}
      >
        {status === "unsupported" && (
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", textAlign: "center", maxWidth: 360, padding: 16 }}>
            3D view needs WebGL, which this browser/environment doesn&apos;t support. The 2D plan and Studio editor
            above still have the full, real room data — try the 3D view again in a standard desktop browser
            (Chrome, Firefox, Safari) with hardware acceleration on.
          </p>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginTop: 8 }}>
        Drag to orbit, scroll to zoom. Massing view built directly from this plan&apos;s real room/wall coordinates — not photorealistic rendering.
      </p>
    </div>
  );
});

/**
 * See the "Stairs" comment in the scene setup above. Coordinates match every other mesh: x =
 * plan x, z = plan y, y = up. `run.axis` (default "y") picks which real plan axis the flight
 * travels along — "x" only after lib/layout/lotFit.ts rotates a multi-story plan 90/270 degrees
 * to fit a lot (see Room.stairRun's doc comment); `toXZ`/`alongAcrossBox` below remap every
 * dimension so the geometry stays correct either way instead of assuming "y" like before.
 */
function buildStairObject(room: Room, run: NonNullable<Room["stairRun"]>, storyHeight: number): THREE.Object3D {
  const group = new THREE.Group();
  const axis = run.axis ?? "y";
  const alongStart = axis === "x" ? room.x : room.y;
  const alongSize = axis === "x" ? room.w : room.h;
  const acrossStart = axis === "x" ? room.y : room.x;
  const acrossSize = axis === "x" ? room.h : room.w;
  const toXZ = (along: number, across: number): { x: number; z: number } =>
    axis === "x" ? { x: along, z: across } : { x: across, z: along };
  // A box's (x,z) footprint size swaps the same way: whichever plan axis "along"/"across" map to.
  const alongAcrossBox = (alongLen: number, acrossLen: number): [number, number] =>
    axis === "x" ? [alongLen, acrossLen] : [acrossLen, alongLen];

  const a0 = alongStart + Math.max(0, run.start);
  const a1 = Math.min(alongStart + alongSize, alongStart + run.start + run.length);
  const flight = a1 - a0;
  if (flight <= 0.1) return group;
  const treads = STAIR_RISERS - 1;
  const treadDepth = flight / treads;
  const riser = storyHeight / STAIR_RISERS;
  const acrossCenter = acrossStart + acrossSize / 2;
  const width = acrossSize - 0.3;

  if (run.floor === "lower") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8925f, roughness: 0.7 });
    for (let i = 0; i < treads; i++) {
      // i = 0 is the bottom step; it sits at whichever end of the flight `bottomAt` names.
      const fromBottom = run.bottomAt === "start" ? a0 + i * treadDepth : a1 - (i + 1) * treadDepth;
      const height = (i + 1) * riser;
      const [xSize, zSize] = alongAcrossBox(treadDepth, width);
      const step = new THREE.Mesh(new THREE.BoxGeometry(xSize, height, zSize), mat);
      const center = toXZ(fromBottom + treadDepth / 2, acrossCenter);
      step.position.set(center.x, 0.2 + height / 2, center.z);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }
    return group;
  }

  const [voidX, voidZ] = alongAcrossBox(flight, width);
  const voidMesh = new THREE.Mesh(
    new THREE.BoxGeometry(voidX, 0.05, voidZ),
    new THREE.MeshStandardMaterial({ color: 0x3a342b, roughness: 1 }),
  );
  const voidCenter = toXZ((a0 + a1) / 2, acrossCenter);
  voidMesh.position.set(voidCenter.x, 0.23, voidCenter.z);
  group.add(voidMesh);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6b5a43, roughness: 0.6 });
  const railEdge = acrossStart + acrossSize - 0.15;
  const [railX, railZ] = alongAcrossBox(flight, 0.12);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(railX, 0.12, railZ), railMat);
  const railCenter = toXZ((a0 + a1) / 2, railEdge);
  rail.position.set(railCenter.x, 3, railCenter.z);
  group.add(rail);
  const posts = Math.max(2, Math.round(flight / 2));
  for (let i = 0; i <= posts; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), railMat);
    const postCenter = toXZ(a0 + (flight * i) / posts, railEdge);
    post.position.set(postCenter.x, 0.2 + 1.4, postCenter.z);
    group.add(post);
  }
  return group;
}
