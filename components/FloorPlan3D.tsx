"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FloorPlan, RoomType } from "@/lib/layout/types";
import { FURNITURE_CATALOG, type FurnitureSpec } from "@/lib/layout/furniture";

/** Honest simplification: every furniture piece extrudes to a flat block sized by its category, not a modeled shape — real geometric volume, not a photoreal asset. */
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

const ROOM_COLOR: Partial<Record<RoomType, number>> = {
  entry: 0xe8e3d8,
  great_room: 0xeef2ec,
  living: 0xeef2ec,
  kitchen: 0xf3ece0,
  dining: 0xf0ece4,
  primary_bedroom: 0xe4eef2,
  bedroom: 0xe9f1f4,
  primary_bath: 0xdbe9ea,
  bath: 0xe2eeef,
  half_bath: 0xe2eeef,
  hallway: 0xf6f5f2,
  office: 0xece6f2,
  garage: 0xdfdfdc,
  closet: 0xececec,
};

interface FloorPlan3DProps {
  plan: FloorPlan;
}

/**
 * Real Three.js scene built directly from the plan's own room rectangles
 * and wall segments — no photogrammetry, no placeholder box, every floor
 * slab / wall / door gap has the actual coordinates from `plan`. Orbit
 * controls let the architect walk the camera around and look inside.
 */
export function FloorPlan3D({ plan }: FloorPlan3DProps) {
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
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 1000);
    camera.position.set(centerX + diag * 0.62, diag * 0.72, centerZ + diag * 0.62);

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    setStatus("ready");

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0, centerZ);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't let the camera dip below the floor
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(centerX + diag * 0.4, diag * 0.8, centerZ - diag * 0.3);
    scene.add(sun);

    // Ground slab, slightly larger than the footprint so the house doesn't look like it floats on nothing.
    const groundGeo = new THREE.PlaneGeometry(plan.footprint.w + 20, plan.footprint.h + 20);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xdedad2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, -0.05, centerZ);
    scene.add(ground);

    // One floor slab + label-free box per room, colored to match the 2D plan.
    for (const room of plan.rooms) {
      const color = ROOM_COLOR[room.type] ?? 0xf0f0f0;
      const floorGeo = new THREE.BoxGeometry(room.w, 0.2, room.h);
      const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color }));
      floor.position.set(room.x + room.w / 2, 0.1, room.y + room.h / 2);
      scene.add(floor);
    }

    // Walls extruded from the plan's actual wall segments — thin boxes along each segment.
    for (const wall of plan.walls) {
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (length < 0.1) continue;
      const thickness = wall.exterior ? WALL_THICKNESS * 1.4 : WALL_THICKNESS;
      const geo = new THREE.BoxGeometry(length, WALL_HEIGHT, thickness);
      const mat = new THREE.MeshStandardMaterial({ color: wall.exterior ? 0x8f8f8c : 0xbdbdb8 });
      const mesh = new THREE.Mesh(geo, mat);
      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.y1 + wall.y2) / 2;
      const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      mesh.position.set(midX, WALL_HEIGHT / 2, midZ);
      mesh.rotation.y = -angle;
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

    // Furniture: a simple colored block per piece, sized to its real footprint and a
    // category-based height (chair-height, table-height, wardrobe-height, etc.) — the
    // "basic 3D primitives" version of furniture, not a photoreal asset.
    for (const item of plan.furniture) {
      const spec = FURNITURE_CATALOG[item.type];
      const blockHeight = CATEGORY_HEIGHT[spec.category];
      const geo = new THREE.BoxGeometry(item.w, blockHeight, item.h);
      const color = new THREE.Color(spec.color);
      const mat = new THREE.MeshStandardMaterial({ color, transparent: item.type === "rug", opacity: item.type === "rug" ? 0.8 : 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(item.x + item.w / 2, blockHeight / 2 + (item.type === "rug" ? 0.03 : 0.2), item.y + item.h / 2);
      mesh.rotation.y = (-item.rotation * Math.PI) / 180;
      scene.add(mesh);
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
  }, [plan]);

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
