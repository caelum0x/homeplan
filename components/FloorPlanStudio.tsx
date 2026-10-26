"use client";

import { useCallback, useRef, useState } from "react";
import type { FloorPlan, Room, RoomType } from "@/lib/layout/types";
import { addRoom, moveRoom, removeRoom, renameRoom, resizeRoom } from "@/lib/layout/edit";
import { ROOM_FILL, SVG_PADDING as PADDING, SVG_SCALE as SCALE } from "@/lib/renderSvg";

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

interface FloorPlanStudioProps {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
}

type DragMode = { kind: "move"; roomId: string; startPointerFt: { x: number; y: number }; startRoom: { x: number; y: number } } | { kind: "resize"; roomId: string; startPointerFt: { x: number; y: number }; startRoom: { w: number; h: number } } | null;

/**
 * Direct-manipulation editor on top of the already-generated plan: click a
 * room to select it, drag its body to move it, drag the bottom-right handle
 * to resize it, or edit exact numbers in the side panel. Add/remove rooms
 * too. Every change recomputes walls/doors from the real new geometry via
 * lib/layout/edit.ts — nothing here is a canned redraw.
 */
export function FloorPlanStudio({ plan, onChange }: FloorPlanStudioProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<FloorPlan[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragMode>(null);

  const width = plan.footprint.w * SCALE + PADDING * 2;
  const height = plan.footprint.h * SCALE + PADDING * 2;
  const toPx = (ft: number) => ft * SCALE;
  const toFt = (px: number) => px / SCALE;

  const selected = plan.rooms.find((r) => r.id === selectedId) ?? null;

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
    setSelectedId(room.id);
    const startPointerFt = pointerToFt(e.clientX, e.clientY);
    dragRef.current = { kind: "move", roomId: room.id, startPointerFt, startRoom: { x: room.x, y: room.y } };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onHandlePointerDown(room: Room, e: React.PointerEvent) {
    e.stopPropagation();
    setSelectedId(room.id);
    const startPointerFt = pointerToFt(e.clientX, e.clientY);
    dragRef.current = { kind: "resize", roomId: room.id, startPointerFt, startRoom: { w: room.w, h: room.h } };
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
    } else {
      onChange(resizeRoom(plan, drag.roomId, drag.startRoom.w + dx, drag.startRoom.h + dy));
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

  function handleDeleteSelected() {
    if (!selected) return;
    pushChange(removeRoom(plan, selected.id));
    setSelectedId(null);
  }

  function handleNumericChange(field: "x" | "y" | "w" | "h", value: number) {
    if (!selected) return;
    if (field === "x") onChange(moveRoom(plan, selected.id, value, selected.y));
    else if (field === "y") onChange(moveRoom(plan, selected.id, selected.x, value));
    else if (field === "w") onChange(resizeRoom(plan, selected.id, value, selected.h));
    else onChange(resizeRoom(plan, selected.id, selected.w, value));
  }

  function handleNumericCommit() {
    setHistory((h) => [...h, plan].slice(-50));
  }

  function handleRename(label: string, type: RoomType) {
    if (!selected) return;
    pushChange(renameRoom(plan, selected.id, label, type));
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 480px", minWidth: 320 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <button type="button" onClick={handleAddRoom} style={studioButtonStyle}>
            + Add room
          </button>
          <button type="button" onClick={undo} disabled={history.length === 0} style={studioButtonStyle}>
            Undo
          </button>
          <span style={{ fontSize: 12, color: "#888" }}>Drag a room to move it, drag the corner handle to resize.</span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label="Editable floor plan"
          style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e2e2", touchAction: "none" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={() => setSelectedId(null)}
        >
          <g transform={`translate(${PADDING}, ${PADDING})`}>
            {plan.rooms.map((room) => (
              <g key={room.id}>
                <rect
                  x={toPx(room.x)}
                  y={toPx(room.y)}
                  width={toPx(room.w)}
                  height={toPx(room.h)}
                  fill={ROOM_FILL[room.type] ?? "#f0f0f0"}
                  stroke={room.id === selectedId ? "#2563eb" : "#c9c9c9"}
                  strokeWidth={room.id === selectedId ? 2 : 1}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onRoomPointerDown(room, e)}
                />
                <text
                  x={toPx(room.x) + toPx(room.w) / 2}
                  y={toPx(room.y) + toPx(room.h) / 2 - 6}
                  textAnchor="middle"
                  fontSize={Math.min(13, Math.max(9, toPx(room.w) / 10))}
                  fontWeight={600}
                  fill="#2b2b2b"
                  style={{ pointerEvents: "none" }}
                >
                  {room.label}
                </text>
                <text
                  x={toPx(room.x) + toPx(room.w) / 2}
                  y={toPx(room.y) + toPx(room.h) / 2 + 10}
                  textAnchor="middle"
                  fontSize={Math.max(7, Math.min(11, toPx(room.w) / 10) - 2)}
                  fill="#5a5a5a"
                  style={{ pointerEvents: "none" }}
                >
                  {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos; ({room.areaSqft} sqft)
                </text>
                {room.id === selectedId && (
                  <rect
                    x={toPx(room.x) + toPx(room.w) - 8}
                    y={toPx(room.y) + toPx(room.h) - 8}
                    width={12}
                    height={12}
                    fill="#2563eb"
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
                stroke="#2b2b2b"
                strokeWidth={wall.exterior ? 4 : 2}
                strokeLinecap="square"
                style={{ pointerEvents: "none" }}
              />
            ))}

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
          </g>
        </svg>

        {plan.warnings.length > 0 && (
          <ul
            style={{
              background: "#fff8e1",
              border: "1px solid #ffe8a3",
              borderRadius: 8,
              padding: "10px 16px",
              marginTop: 8,
              fontSize: 13,
              color: "#6b5900",
            }}
          >
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: "0 0 220px", fontSize: 13 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Selected room</h3>
        {!selected && <p style={{ color: "#888" }}>Click a room to select it.</p>}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={labelStyle}>
              Label
              <input
                type="text"
                value={selected.label}
                onChange={(e) => handleRename(e.target.value, selected.type)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Type
              <select value={selected.type} onChange={(e) => handleRename(selected.label, e.target.value as RoomType)} style={inputStyle}>
                {ROOM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={labelStyle}>
                X (ft)
                <input
                  type="number"
                  value={selected.x}
                  onChange={(e) => handleNumericChange("x", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Y (ft)
                <input
                  type="number"
                  value={selected.y}
                  onChange={(e) => handleNumericChange("y", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={labelStyle}>
                Width (ft)
                <input
                  type="number"
                  value={selected.w}
                  onChange={(e) => handleNumericChange("w", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Depth (ft)
                <input
                  type="number"
                  value={selected.h}
                  onChange={(e) => handleNumericChange("h", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                  style={inputStyle}
                />
              </label>
            </div>
            <p style={{ color: "#555" }}>{selected.areaSqft} sqft</p>
            <button type="button" onClick={handleDeleteSelected} style={{ ...studioButtonStyle, background: "#fee2e2", color: "#991b1b" }}>
              Delete room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const studioButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "#fafafa",
  cursor: "pointer",
  color: "#333",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "#555",
  flex: 1,
};

const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #ccc",
};
