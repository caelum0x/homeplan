import type { Door, FloorPlan, Room } from "@/lib/layout/types";
import { ROOM_FILL, SVG_PADDING as PADDING, SVG_SCALE as SCALE } from "@/lib/renderSvg";
import { resolveDoorSwingGeometry } from "@/lib/layout/doorSwings";
import { FurniturePiece } from "./FurniturePiece";
import { StairMarks } from "./StairMarks";

interface FloorPlanSvgProps {
  plan: FloorPlan;
}

export function FloorPlanSvg({ plan }: FloorPlanSvgProps) {
  const width = plan.footprint.w * SCALE + PADDING * 2;
  const height = plan.footprint.h * SCALE + PADDING * 2;

  const toPx = (ft: number) => ft * SCALE;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Generated floor plan, ${plan.footprint.w} by ${plan.footprint.h} feet, ${plan.totalAreaSqft} square feet total`}
      className="card"
      style={{ background: "#fff" }}
    >
      <g transform={`translate(${PADDING}, ${PADDING})`}>
        {plan.rooms.map((room) => (
          <RoomRect key={room.id} room={room} toPx={toPx} />
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
          />
        ))}

        {(plan.windows ?? []).map((win) => (
          <WindowMark key={win.id} win={win} toPx={toPx} />
        ))}

        {plan.doors.map((door) => (
          <DoorMark key={door.id} door={door} rooms={plan.rooms} toPx={toPx} />
        ))}

        {plan.furniture.map((item) => (
          <FurniturePiece key={item.id} item={item} toPx={toPx} />
        ))}
      </g>
    </svg>
  );
}

function RoomRect({ room, toPx }: { room: Room; toPx: (ft: number) => number }) {
  const x = toPx(room.x);
  const y = toPx(room.y);
  const w = toPx(room.w);
  const h = toPx(room.h);
  const fontSize = Math.min(13, Math.max(9, w / 10));

  const clipId = `clip_${room.id}`;

  if (room.type === "stairs" && room.stairRun) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={room.floorColor ?? ROOM_FILL[room.type] ?? "#f0f0f0"} stroke="#c9c9c9" strokeWidth={1} />
        <StairMarks room={room} toPx={toPx} />
      </g>
    );
  }

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={room.floorColor ?? ROOM_FILL[room.type] ?? "#f0f0f0"} stroke="#c9c9c9" strokeWidth={1} />
      <clipPath id={clipId}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      {/* Anchored near the top of the room, not centered, so furniture icons in the room body never collide with the label. */}
      <g clipPath={`url(#${clipId})`}>
        <text x={x + w / 2} y={y + fontSize + 4} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill="#2b2b2b">
          {room.label}
        </text>
        <text x={x + w / 2} y={y + fontSize * 2 + 6} textAnchor="middle" fontSize={fontSize - 2} fill="#5a5a5a">
          {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos; ({room.areaSqft} sqft)
        </text>
      </g>
    </g>
  );
}

/** Real architectural swing symbol (dashed quarter-circle arc + solid leaf line) from the hinge/
 * swing-into choice `computeDoorSwings` already made — same geometry `lib/renderSvg.ts`'s
 * `doorToSvg` draws server-side, via the shared `resolveDoorSwingGeometry` helper, not a separate
 * guess. Falls back to the plain gap for a door saved before `hingeSide`/`swingInto` existed. */
/** Exported for reuse by FloorPlanStudio.tsx, which draws the same door marks on its editable
 * canvas — kept as a single shared implementation rather than a third copy of this geometry. */
export function DoorMark({ door, rooms, toPx }: { door: Door; rooms: Room[]; toPx: (ft: number) => number }) {
  const cx = toPx(door.x);
  const cy = toPx(door.y);
  const half = toPx(door.width) / 2;
  const gap =
    door.orientation === "h" ? (
      <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#ffffff" strokeWidth={4} />
    ) : (
      <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#ffffff" strokeWidth={4} />
    );

  const geometry = resolveDoorSwingGeometry(door, rooms);
  if (!geometry) return gap;

  const { hinge, openTip, closedTip } = geometry;
  const along = { x: (closedTip.x - hinge.x) / door.width, y: (closedTip.y - hinge.y) / door.width };
  const normal = { x: (openTip.x - hinge.x) / door.width, y: (openTip.y - hinge.y) / door.width };
  const steps = 12;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (Math.PI / 2) * (i / steps);
    const px = toPx(hinge.x + door.width * (along.x * Math.cos(angle) + normal.x * Math.sin(angle)));
    const py = toPx(hinge.y + door.width * (along.y * Math.cos(angle) + normal.y * Math.sin(angle)));
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  return (
    <>
      {gap}
      <polyline points={points.join(" ")} fill="none" stroke="#b7b2a3" strokeWidth={1} strokeDasharray="2 2" />
      <line x1={toPx(hinge.x)} y1={toPx(hinge.y)} x2={toPx(openTip.x)} y2={toPx(openTip.y)} stroke="#8a8578" strokeWidth={1.5} />
    </>
  );
}

/** A window reads as a pale blue bar with a thin white mullion line, set into the exterior wall — visually distinct from a door's plain white gap. */
function WindowMark({ win, toPx }: { win: { x: number; y: number; width: number; orientation: "h" | "v" }; toPx: (ft: number) => number }) {
  const cx = toPx(win.x);
  const cy = toPx(win.y);
  const half = toPx(win.width) / 2;

  if (win.orientation === "h") {
    return (
      <>
        <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#7fb3d9" strokeWidth={5} />
        <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#ffffff" strokeWidth={1.5} />
      </>
    );
  }
  return (
    <>
      <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#7fb3d9" strokeWidth={5} />
      <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#ffffff" strokeWidth={1.5} />
    </>
  );
}
