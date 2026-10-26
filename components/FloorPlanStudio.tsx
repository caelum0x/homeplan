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
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <button type="button" onClick={handleAddRoom} className="btn btn-secondary btn-sm">
            + Add room
          </button>
          <button type="button" onClick={undo} disabled={history.length === 0} className="btn btn-secondary btn-sm">
            Undo
          </button>
          <span style={{ fontSize: 12.5, color: "var(--color-ink-faint)" }}>Drag a room to move it, drag the corner handle to resize.</span>
        </div>

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
                  stroke={room.id === selectedId ? "#c9622d" : "#c9c9c9"}
                  strokeWidth={room.id === selectedId ? 2 : 1}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onRoomPointerDown(room, e)}
                />
                <clipPath id={`clip_${room.id}`}>
                  <rect x={toPx(room.x)} y={toPx(room.y)} width={toPx(room.w)} height={toPx(room.h)} />
                </clipPath>
                <g clipPath={`url(#clip_${room.id})`} style={{ pointerEvents: "none" }}>
                  <text
                    x={toPx(room.x) + toPx(room.w) / 2}
                    y={toPx(room.y) + toPx(room.h) / 2 - 6}
                    textAnchor="middle"
                    fontSize={Math.min(13, Math.max(9, toPx(room.w) / 10))}
                    fontWeight={600}
                    fill="#2b2b2b"
                  >
                    {room.label}
                  </text>
                  <text
                    x={toPx(room.x) + toPx(room.w) / 2}
                    y={toPx(room.y) + toPx(room.h) / 2 + 10}
                    textAnchor="middle"
                    fontSize={Math.max(7, Math.min(11, toPx(room.w) / 10) - 2)}
                    fill="#5a5a5a"
                  >
                    {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos; ({room.areaSqft} sqft)
                  </text>
                </g>
                {room.id === selectedId && (
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
          <div className="alert alert-warning" style={{ marginTop: 10 }}>
            <ul>
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel" style={{ flex: "0 0 240px", padding: 14, fontSize: 13, alignSelf: "flex-start" }}>
        <h3 style={{ fontSize: 14, fontWeight: 650, marginBottom: 10 }}>Selected room</h3>
        {!selected && <p style={{ color: "var(--color-ink-faint)" }}>Click a room to select it.</p>}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field-group">
              Label
              <input
                type="text"
                className="text-input"
                value={selected.label}
                onChange={(e) => handleRename(e.target.value, selected.type)}
              />
            </label>
            <label className="field-group">
              Type
              <select
                className="select-input"
                value={selected.type}
                onChange={(e) => handleRename(selected.label, e.target.value as RoomType)}
              >
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
                <input
                  type="number"
                  className="text-input"
                  value={selected.x}
                  onChange={(e) => handleNumericChange("x", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                />
              </label>
              <label className="field-group">
                Y (ft)
                <input
                  type="number"
                  className="text-input"
                  value={selected.y}
                  onChange={(e) => handleNumericChange("y", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label className="field-group">
                Width (ft)
                <input
                  type="number"
                  className="text-input"
                  value={selected.w}
                  onChange={(e) => handleNumericChange("w", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                />
              </label>
              <label className="field-group">
                Depth (ft)
                <input
                  type="number"
                  className="text-input"
                  value={selected.h}
                  onChange={(e) => handleNumericChange("h", Number(e.target.value))}
                  onBlur={handleNumericCommit}
                />
              </label>
            </div>
            <p style={{ color: "var(--color-ink-soft)" }}>{selected.areaSqft} sqft</p>
            <button type="button" onClick={handleDeleteSelected} className="btn btn-danger btn-sm">
              Delete room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
