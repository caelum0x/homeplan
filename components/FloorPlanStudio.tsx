"use client";

import { useCallback, useRef, useState } from "react";
import type { FloorPlan, FurnitureType, Room, RoomType } from "@/lib/layout/types";
import {
  addFurniture,
  addRoom,
  moveFurniture,
  moveRoom,
  removeFurniture,
  removeRoom,
  renameRoom,
  resizeRoom,
  rotateFurniture,
  setRoomFloorColor,
  setWallColor,
} from "@/lib/layout/edit";
import { FURNITURE_CATALOG } from "@/lib/layout/furniture";
import { ROOM_FILL, SVG_PADDING as PADDING, SVG_SCALE as SCALE } from "@/lib/renderSvg";
import { FurniturePiece } from "./FurniturePiece";

const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: "bedroom", label: "Bedroom" },
  { value: "primary_bedroom", label: "Primary bedroom" },
  { value: "bath", label: "Bathroom" },
  { value: "primary_bath", label: "Primary bathroom" },
  { value: "half_bath", label: "Half bath" },
  { value: "living", label: "Living room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "dining", label: "Dining room" },
  { value: "office", label: "Office" },
  { value: "closet", label: "Closet" },
  { value: "hallway", label: "Hallway" },
  { value: "garage", label: "Garage" },
];

const FLOOR_SWATCHES = ["#e8d9c4", "#d9c9ae", "#c9dde0", "#e4eef2", "#efe7d8", "#dcdcd6", "#f2e9db"];
const WALL_SWATCHES = ["#2b2b2b", "#5a5248", "#7c746a", "#a89f8f", "#3c4a5c"];

const FURNITURE_GROUPS: { label: string; items: FurnitureType[] }[] = [
  { label: "Seating", items: ["sofa", "armchair", "dining_chair", "office_chair"] },
  { label: "Sleeping", items: ["bed_queen", "bed_single", "nightstand"] },
  { label: "Surfaces", items: ["coffee_table", "dining_table", "desk", "kitchen_island"] },
  { label: "Storage", items: ["wardrobe", "dresser", "bookshelf", "tv_stand"] },
  { label: "Kitchen", items: ["fridge", "stove", "sink_kitchen"] },
  { label: "Bath", items: ["toilet", "bathtub", "shower", "sink_bath"] },
  { label: "Decor", items: ["rug"] },
];

interface FloorPlanStudioProps {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
  /** Optional "upload an existing plan" trace reference (data URL) shown as a dimmed background layer — a UI aid only, never persisted into the FloorPlan/export/share data. */
  traceImageUrl?: string | null;
}

type Selection = { kind: "room"; id: string } | { kind: "furniture"; id: string } | null;

type DragMode =
  | { kind: "move"; roomId: string; startPointerFt: { x: number; y: number }; startRoom: { x: number; y: number } }
  | { kind: "resize"; roomId: string; startPointerFt: { x: number; y: number }; startRoom: { w: number; h: number } }
  | { kind: "furniture"; furnitureId: string; startPointerFt: { x: number; y: number }; start: { x: number; y: number } }
  | null;

/**
 * Direct-manipulation editor on top of the already-generated plan: click a
 * room to select it, drag its body to move it, drag the bottom-right handle
 * to resize it, or edit exact numbers in the side panel. Add/remove rooms,
 * place/drag/rotate/remove furniture from the catalog, and override floor/
 * wall colors (materials picker). Every change recomputes walls/doors from
 * the real new geometry via lib/layout/edit.ts — nothing here is a canned
 * redraw.
 */
export function FloorPlanStudio({ plan, onChange, traceImageUrl }: FloorPlanStudioProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const [history, setHistory] = useState<FloorPlan[]>([]);
  const [furniturePanelOpen, setFurniturePanelOpen] = useState(false);
  const [traceOpacity, setTraceOpacity] = useState(0.45);
  const [traceVisible, setTraceVisible] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragMode>(null);

  const width = plan.footprint.w * SCALE + PADDING * 2;
  const height = plan.footprint.h * SCALE + PADDING * 2;
  const toPx = (ft: number) => ft * SCALE;
  const toFt = (px: number) => px / SCALE;

  const selectedRoom = selection?.kind === "room" ? (plan.rooms.find((r) => r.id === selection.id) ?? null) : null;
  const selectedFurniture = selection?.kind === "furniture" ? (plan.furniture.find((f) => f.id === selection.id) ?? null) : null;

  function pushChange(next: FloorPlan) {
    setHistory((h) => [...h, plan].slice(-50));
    onChange(next);
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      onChange(prev);
      return h.slice(0, -1);
    });
  }

  const pointerToFt = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / width;
      const scaleY = rect.height / height;
      const x = toFt((clientX - rect.left) / scaleX - PADDING);
      const y = toFt((clientY - rect.top) / scaleY - PADDING);
      return { x, y };
    },
    [width, height],
  );

  function onRoomPointerDown(room: Room, e: React.PointerEvent) {
    e.stopPropagation();
    setSelection({ kind: "room", id: room.id });
    const startPointerFt = pointerToFt(e.clientX, e.clientY);
    dragRef.current = { kind: "move", roomId: room.id, startPointerFt, startRoom: { x: room.x, y: room.y } };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onHandlePointerDown(room: Room, e: React.PointerEvent) {
    e.stopPropagation();
    setSelection({ kind: "room", id: room.id });
    const startPointerFt = pointerToFt(e.clientX, e.clientY);
    dragRef.current = { kind: "resize", roomId: room.id, startPointerFt, startRoom: { w: room.w, h: room.h } };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onFurniturePointerDown(furnitureId: string, x: number, y: number, e: React.PointerEvent) {
    e.stopPropagation();
    setSelection({ kind: "furniture", id: furnitureId });
    const startPointerFt = pointerToFt(e.clientX, e.clientY);
    dragRef.current = { kind: "furniture", furnitureId, startPointerFt, start: { x, y } };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const nowFt = pointerToFt(e.clientX, e.clientY);
    const dx = nowFt.x - drag.startPointerFt.x;
    const dy = nowFt.y - drag.startPointerFt.y;

    if (drag.kind === "move") {
      onChange(moveRoom(plan, drag.roomId, drag.startRoom.x + dx, drag.startRoom.y + dy));
    } else if (drag.kind === "resize") {
      onChange(resizeRoom(plan, drag.roomId, drag.startRoom.w + dx, drag.startRoom.h + dy));
    } else {
      onChange(moveFurniture(plan, drag.furnitureId, drag.start.x + dx, drag.start.y + dy));
    }
  }

  function onPointerUp() {
    if (dragRef.current) {
      // Commit the in-progress drag to undo history as a single step.
      setHistory((h) => [...h, plan].slice(-50));
    }
    dragRef.current = null;
  }

  function handleAddRoom() {
    pushChange(addRoom(plan, "bedroom", `Room ${plan.rooms.length + 1}`));
  }

  function handleAddFurniture(type: FurnitureType) {
    const next = addFurniture(plan, type);
    pushChange(next);
    setSelection({ kind: "furniture", id: next.furniture[next.furniture.length - 1].id });
  }

  function handleDeleteSelected() {
    if (selectedRoom) {
      pushChange(removeRoom(plan, selectedRoom.id));
      setSelection(null);
    } else if (selectedFurniture) {
      pushChange(removeFurniture(plan, selectedFurniture.id));
      setSelection(null);
    }
  }

  function handleRotateSelected() {
    if (!selectedFurniture) return;
    pushChange(rotateFurniture(plan, selectedFurniture.id, 90));
  }

  function handleNumericChange(field: "x" | "y" | "w" | "h", value: number) {
    if (!selectedRoom) return;
    if (field === "x") onChange(moveRoom(plan, selectedRoom.id, value, selectedRoom.y));
    else if (field === "y") onChange(moveRoom(plan, selectedRoom.id, selectedRoom.x, value));
    else if (field === "w") onChange(resizeRoom(plan, selectedRoom.id, value, selectedRoom.h));
    else onChange(resizeRoom(plan, selectedRoom.id, selectedRoom.w, value));
  }

  function handleNumericCommit() {
    setHistory((h) => [...h, plan].slice(-50));
  }

  function handleRename(label: string, type: RoomType) {
    if (!selectedRoom) return;
    pushChange(renameRoom(plan, selectedRoom.id, label, type));
  }

  function handleFloorColor(color: string | undefined) {
    if (!selectedRoom) return;
    pushChange(setRoomFloorColor(plan, selectedRoom.id, color));
  }

  function handleWallColor(color: string | undefined) {
    pushChange(setWallColor(plan, color));
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 480px", minWidth: 320 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={handleAddRoom} className="btn btn-secondary btn-sm">
            + Add room
          </button>
          <button type="button" onClick={() => setFurniturePanelOpen((v) => !v)} className={`btn btn-sm ${furniturePanelOpen ? "btn-primary" : "btn-secondary"}`}>
            + Furniture
          </button>
          <button type="button" onClick={undo} disabled={history.length === 0} className="btn btn-secondary btn-sm">
            Undo
          </button>
          <span style={{ fontSize: 12.5, color: "var(--color-ink-faint)" }}>Drag to move, corner handle to resize a room.</span>
        </div>

        {traceImageUrl && (
          <div className="panel" style={{ padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
            <button type="button" onClick={() => setTraceVisible((v) => !v)} className="btn btn-secondary btn-sm">
              {traceVisible ? "Hide reference" : "Show reference"}
            </button>
            <span style={{ color: "var(--color-ink-faint)" }}>Reference opacity</span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={traceOpacity}
              onChange={(e) => setTraceOpacity(Number(e.target.value))}
              disabled={!traceVisible}
              style={{ width: 120 }}
            />
          </div>
        )}

        {furniturePanelOpen && (
          <div className="panel" style={{ padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {FURNITURE_GROUPS.map((group) => (
              <div key={group.label}>
                <div style={{ fontSize: 11, fontWeight: 650, color: "var(--color-ink-faint)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {group.items.map((type) => (
                    <button key={type} type="button" className="chip" onClick={() => handleAddFurniture(type)}>
                      + {FURNITURE_CATALOG[type].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label="Editable floor plan"
          className="card"
          style={{ background: "#fff", touchAction: "none" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={() => setSelection(null)}
        >
          <g transform={`translate(${PADDING}, ${PADDING})`}>
            {traceImageUrl && traceVisible && (
              <image
                href={traceImageUrl}
                x={0}
                y={0}
                width={toPx(plan.footprint.w)}
                height={toPx(plan.footprint.h)}
                preserveAspectRatio="none"
                opacity={traceOpacity}
                style={{ pointerEvents: "none" }}
              />
            )}
            {plan.rooms.map((room) => (
              <g key={room.id}>
                <rect
                  x={toPx(room.x)}
                  y={toPx(room.y)}
                  width={toPx(room.w)}
                  height={toPx(room.h)}
                  fill={room.floorColor ?? ROOM_FILL[room.type] ?? "#f0f0f0"}
                  stroke={selection?.kind === "room" && selection.id === room.id ? "#c9622d" : "#c9c9c9"}
                  strokeWidth={selection?.kind === "room" && selection.id === room.id ? 2 : 1}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onRoomPointerDown(room, e)}
                />
                <clipPath id={`clip_${room.id}`}>
                  <rect x={toPx(room.x)} y={toPx(room.y)} width={toPx(room.w)} height={toPx(room.h)} />
                </clipPath>
                {/* Anchored near the top of the room, not centered, so furniture pieces in the room body never collide with the label. */}
                <g clipPath={`url(#clip_${room.id})`} style={{ pointerEvents: "none" }}>
                  <text
                    x={toPx(room.x) + toPx(room.w) / 2}
                    y={toPx(room.y) + Math.min(13, Math.max(9, toPx(room.w) / 10)) + 4}
                    textAnchor="middle"
                    fontSize={Math.min(13, Math.max(9, toPx(room.w) / 10))}
                    fontWeight={600}
                    fill="#2b2b2b"
                  >
                    {room.label}
                  </text>
                  <text
                    x={toPx(room.x) + toPx(room.w) / 2}
                    y={toPx(room.y) + Math.min(13, Math.max(9, toPx(room.w) / 10)) * 2 + 6}
                    textAnchor="middle"
                    fontSize={Math.max(7, Math.min(11, toPx(room.w) / 10) - 2)}
                    fill="#5a5a5a"
                  >
                    {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos; ({room.areaSqft} sqft)
                  </text>
                </g>
                {selection?.kind === "room" && selection.id === room.id && (
                  <rect
                    x={toPx(room.x) + toPx(room.w) - 8}
                    y={toPx(room.y) + toPx(room.h) - 8}
                    width={12}
                    height={12}
                    fill="#c9622d"
                    style={{ cursor: "nwse-resize" }}
                    onPointerDown={(e) => onHandlePointerDown(room, e)}
                  />
                )}
              </g>
            ))}

            {plan.walls.map((wall) => (
              <line
                key={wall.id}
                x1={toPx(wall.x1)}
                y1={toPx(wall.y1)}
                x2={toPx(wall.x2)}
                y2={toPx(wall.y2)}
                stroke={plan.wallColor ?? "#2b2b2b"}
                strokeWidth={wall.exterior ? 4 : 2}
                strokeLinecap="square"
                style={{ pointerEvents: "none" }}
              />
            ))}

            {(plan.windows ?? []).map((win) => {
              const cx = toPx(win.x);
              const cy = toPx(win.y);
              const half = toPx(win.width) / 2;
              return win.orientation === "h" ? (
                <g key={win.id} style={{ pointerEvents: "none" }}>
                  <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#7fb3d9" strokeWidth={5} />
                  <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#ffffff" strokeWidth={1.5} />
                </g>
              ) : (
                <g key={win.id} style={{ pointerEvents: "none" }}>
                  <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#7fb3d9" strokeWidth={5} />
                  <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#ffffff" strokeWidth={1.5} />
                </g>
              );
            })}

            {plan.doors.map((door) => {
              const cx = toPx(door.x);
              const cy = toPx(door.y);
              const half = toPx(door.width) / 2;
              return door.orientation === "h" ? (
                <line key={door.id} x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#ffffff" strokeWidth={4} style={{ pointerEvents: "none" }} />
              ) : (
                <line key={door.id} x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#ffffff" strokeWidth={4} style={{ pointerEvents: "none" }} />
              );
            })}

            {plan.furniture.map((item) => (
              <FurniturePiece
                key={item.id}
                item={item}
                toPx={toPx}
                selected={selection?.kind === "furniture" && selection.id === item.id}
                onPointerDown={(e) => onFurniturePointerDown(item.id, item.x, item.y, e)}
              />
            ))}
          </g>
        </svg>

        {plan.warnings.length > 0 && (
          <div className="alert alert-warning" style={{ marginTop: 10 }}>
            <ul>
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel" style={{ flex: "0 0 240px", padding: 14, fontSize: 13, alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 650, marginBottom: 10 }}>Selected</h3>
          {!selectedRoom && !selectedFurniture && <p style={{ color: "var(--color-ink-faint)" }}>Click a room or furniture piece to select it.</p>}

          {selectedRoom && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="field-group">
                Label
                <input type="text" className="text-input" value={selectedRoom.label} onChange={(e) => handleRename(e.target.value, selectedRoom.type)} />
              </label>
              <label className="field-group">
                Type
                <select className="select-input" value={selectedRoom.type} onChange={(e) => handleRename(selectedRoom.label, e.target.value as RoomType)}>
                  {ROOM_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <label className="field-group">
                  X (ft)
                  <input type="number" className="text-input" value={selectedRoom.x} onChange={(e) => handleNumericChange("x", Number(e.target.value))} onBlur={handleNumericCommit} />
                </label>
                <label className="field-group">
                  Y (ft)
                  <input type="number" className="text-input" value={selectedRoom.y} onChange={(e) => handleNumericChange("y", Number(e.target.value))} onBlur={handleNumericCommit} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label className="field-group">
                  Width (ft)
                  <input type="number" className="text-input" value={selectedRoom.w} onChange={(e) => handleNumericChange("w", Number(e.target.value))} onBlur={handleNumericCommit} />
                </label>
                <label className="field-group">
                  Depth (ft)
                  <input type="number" className="text-input" value={selectedRoom.h} onChange={(e) => handleNumericChange("h", Number(e.target.value))} onBlur={handleNumericCommit} />
                </label>
              </div>
              <p style={{ color: "var(--color-ink-soft)" }}>{selectedRoom.areaSqft} sqft</p>

              <div className="field-group">
                Floor material
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                  {FLOOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleFloorColor(c)}
                      title={c}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        background: c,
                        border: selectedRoom.floorColor === c ? "2px solid var(--color-brand)" : "1px solid var(--color-border-strong)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                  <button type="button" onClick={() => handleFloorColor(undefined)} className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }}>
                    Reset
                  </button>
                </div>
              </div>

              <button type="button" onClick={handleDeleteSelected} className="btn btn-danger btn-sm">
                Delete room
              </button>
            </div>
          )}

          {selectedFurniture && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p>
                <strong>{selectedFurniture.label}</strong>
              </p>
              <p style={{ color: "var(--color-ink-soft)" }}>
                {selectedFurniture.w.toFixed(1)}&apos; × {selectedFurniture.h.toFixed(1)}&apos;, rotated {selectedFurniture.rotation}°
              </p>
              <button type="button" onClick={handleRotateSelected} className="btn btn-secondary btn-sm">
                Rotate 90°
              </button>
              <button type="button" onClick={handleDeleteSelected} className="btn btn-danger btn-sm">
                Remove
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>Wall material</h3>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {WALL_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleWallColor(c)}
                title={c}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: c,
                  border: plan.wallColor === c ? "2px solid var(--color-accent)" : "1px solid var(--color-border-strong)",
                  cursor: "pointer",
                }}
              />
            ))}
            <button type="button" onClick={() => handleWallColor(undefined)} className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
