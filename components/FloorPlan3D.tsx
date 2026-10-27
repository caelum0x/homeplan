"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FloorPlan, FurnitureItem, Room } from "@/lib/layout/types";
import { FURNITURE_CATALOG, type FurnitureSpec } from "@/lib/layout/furniture";
import { ROOM_FILL } from "@/lib/renderSvg";

/** Per-category overall height, used by buildFurnitureObject's composite shapes below — real geometric volume per piece, not a photoreal asset. */
const CATEGORY_HEIGHT: Record<FurnitureSpec["category"], number> = {
  seating: 1.5,
  sleeping: 1.6,
  surface: 1.5,
  storage: 4,
  appliance: 3,
  fixture: 1.8,
  decor: 0.04,
};

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

const WALL_HEIGHT = 9; // feet
const WALL_THICKNESS = 0.4; // feet, just for visual volume — not structural

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
function buildFurnitureObject(item: FurnitureItem, spec: FurnitureSpec): THREE.Object3D {
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
      const baseH = 1.1;
      add(new THREE.BoxGeometry(w, baseH, d), mat(base), 0, baseH / 2, 0);
      const headH = 2.2;
      add(new THREE.BoxGeometry(w, headH, 0.3), mat(darker), 0, headH / 2, -d / 2 + 0.15);
      add(new THREE.BoxGeometry(w * 0.8, 0.3, d * 0.22), mat(lighter), 0, baseH + 0.15, -d / 2 + d * 0.16);
      break;
    }
    case "seating": {
      if (label.includes("sofa") || label.includes("armchair")) {
        const seatH = 1.0;
        add(new THREE.BoxGeometry(w, seatH, d * 0.7), mat(base), 0, seatH / 2, d * 0.12);
        const backH = 1.5;
        add(new THREE.BoxGeometry(w, backH, 0.35), mat(darker), 0, backH / 2, -d / 2 + 0.17);
        const armW = Math.max(0.35, Math.min(0.55, w * 0.12));
        const armH = 1.2;
        add(new THREE.BoxGeometry(armW, armH, d * 0.8), mat(darker), -(w / 2 - armW / 2), armH / 2, 0);
        add(new THREE.BoxGeometry(armW, armH, d * 0.8), mat(darker), w / 2 - armW / 2, armH / 2, 0);
      } else {
        const seatH = 1.5;
        add(new THREE.BoxGeometry(w, 0.22, d), mat(base), 0, seatH, 0);
        const legR = 0.08;
        for (const [sx, sz] of [
          [-w / 2 + legR * 1.5, -d / 2 + legR * 1.5],
          [w / 2 - legR * 1.5, -d / 2 + legR * 1.5],
          [-w / 2 + legR * 1.5, d / 2 - legR * 1.5],
          [w / 2 - legR * 1.5, d / 2 - legR * 1.5],
        ]) {
          add(new THREE.CylinderGeometry(legR, legR, seatH, 8), mat(darker, 0.6, 0.2), sx, seatH / 2, sz);
        }
        const backH = 1.6;
        add(new THREE.BoxGeometry(w, backH, 0.14), mat(base), 0, seatH + backH / 2, -d / 2 + 0.08);
      }
      break;
    }
    case "surface": {
      const legH = 1.5;
      const topH = 0.2;
      add(new THREE.BoxGeometry(w, topH, d), mat(base), 0, legH + topH / 2, 0);
      const legR = 0.1;
      for (const [sx, sz] of [
        [-w / 2 + legR * 1.8, -d / 2 + legR * 1.8],
        [w / 2 - legR * 1.8, -d / 2 + legR * 1.8],
        [-w / 2 + legR * 1.8, d / 2 - legR * 1.8],
        [w / 2 - legR * 1.8, d / 2 - legR * 1.8],
      ]) {
        add(new THREE.CylinderGeometry(legR, legR, legH, 8), mat(darker, 0.6, 0.2), sx, legH / 2, sz);
      }
      break;
    }
    case "appliance": {
      const h = CATEGORY_HEIGHT.appliance;
      add(new THREE.BoxGeometry(w, h, d), mat(base, 0.35, 0.6), 0, h / 2, 0);
      break;
    }
    case "fixture": {
      if (label.includes("toilet")) {
        const bowlH = 1.3;
        add(new THREE.CylinderGeometry(w * 0.38, w * 0.3, bowlH, 12), mat(base), 0, bowlH / 2, d * 0.12);
        const tankH = 1.6;
        add(new THREE.BoxGeometry(w * 0.85, tankH, d * 0.3), mat(lighter), 0, tankH / 2, -d / 2 + d * 0.15);
      } else if (label.includes("bathtub")) {
        const h = 1.6;
        add(new THREE.BoxGeometry(w, h, d), mat(base), 0, h / 2, 0);
        add(new THREE.BoxGeometry(w * 0.82, 0.08, d * 0.82), mat(lighter, 0.25, 0), 0, h - 0.22, 0);
      } else if (label.includes("shower")) {
        add(new THREE.BoxGeometry(w, 0.25, d), mat(base), 0, 0.12, 0);
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0xcfe6ea,
          transparent: true,
          opacity: 0.25,
          roughness: 0.1,
        });
        add(new THREE.BoxGeometry(w, 5.5, 0.08), glassMat, 0, 2.75, -d / 2 + 0.04);
      } else {
        const counterH = 1.6;
        add(new THREE.BoxGeometry(w, counterH, d), mat(base), 0, counterH / 2, 0);
        add(new THREE.BoxGeometry(w * 0.6, 0.1, d * 0.5), mat(lighter), 0, counterH - 0.08, 0);
      }
      break;
    }
    case "storage": {
      const h = CATEGORY_HEIGHT.storage;
      add(new THREE.BoxGeometry(w, h, d), mat(base), 0, h / 2, 0);
      add(new THREE.BoxGeometry(w * 0.96, 0.03, 0.02), mat(darker), 0, h * 0.55, d / 2 - 0.01);
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
  /** Initial camera placement, as multiples of the plan's diagonal — defaults match the
   * in-app massing view exactly. Only overridden by the marketing hero's static capture
   * (a steeper, closer "dollhouse" framing), never by the real in-app Studio/3D tab. */
  cameraRadiusFactor?: number;
  cameraElevationFactor?: number;
  /** Multiplier on the real 9ft wall height — defaults to 1 (the real in-app massing
   * view). Only lowered by the marketing hero's static capture for a lighter, more
   * open "dollhouse" read; never changes the real in-app Studio/3D tab. */
  wallHeightFactor?: number;
}

/**
 * Real Three.js scene built directly from the plan's own room rectangles
 * and wall segments — no photogrammetry, no placeholder box, every floor
 * slab / wall / door gap has the actual coordinates from `plan`. Orbit
 * controls let the architect walk the camera around and look inside.
 */
export function FloorPlan3D({
  plan,
  cameraRadiusFactor = 0.58,
  cameraElevationFactor = 0.95,
  wallHeightFactor = 1,
}: FloorPlan3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!hasWebGL()) {
      setStatus("unsupported");
      return;
    }

    const width = container.clientWidth || 800;
    const height = 520;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false });
    } catch {
      setStatus("unsupported");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f4);

    const centerX = plan.footprint.w / 2;
    const centerZ = plan.footprint.h / 2;
    const diag = Math.hypot(plan.footprint.w, plan.footprint.h);

    // Narrower FOV + a higher elevation ratio than a typical walkthrough camera reads closer to a
    // clean 3/4 isometric massing render (flatter perspective distortion) while staying a real
    // perspective camera (no extra orthographic-camera plumbing needed for this honest massing view).
    const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 1000);
    camera.position.set(centerX + diag * cameraRadiusFactor, diag * cameraElevationFactor, centerZ + diag * cameraRadiusFactor);

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

    // Walls extruded from the plan's actual wall segments — thin boxes along each segment.
    for (const wall of plan.walls) {
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (length < 0.1) continue;
      const thickness = wall.exterior ? WALL_THICKNESS * 1.4 : WALL_THICKNESS;
      const wallHeight = WALL_HEIGHT * wallHeightFactor;
      const geo = new THREE.BoxGeometry(length, wallHeight, thickness);
      const mat = new THREE.MeshStandardMaterial({
        color: wall.exterior ? WALL_COLOR_EXTERIOR : WALL_COLOR_INTERIOR,
        roughness: 0.88,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.y1 + wall.y2) / 2;
      const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      mesh.position.set(midX, wallHeight / 2, midZ);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Door openings: a short lighter "gap" marker on the floor so it's visible from above, and
    // a literal vertical gap is NOT cut into the wall mesh above (a real honest simplification —
    // this is a massing/walkthrough view, not a BIM-grade model with trimmed wall openings).
    for (const door of plan.doors) {
      const geo = new THREE.BoxGeometry(
        door.orientation === "h" ? door.width : WALL_THICKNESS * 1.6,
        0.15,
        door.orientation === "h" ? WALL_THICKNESS * 1.6 : door.width,
      );
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      mesh.position.set(door.x, 0.08, door.y);
      scene.add(mesh);
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
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      container.innerHTML = "";
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
}
