import type { FloorPlan, Room } from "@/lib/layout/types";
import { ROOM_FILL, SVG_PADDING as PADDING, SVG_SCALE as SCALE } from "@/lib/renderSvg";

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
      style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e2e2" }}
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
            stroke="#2b2b2b"
            strokeWidth={wall.exterior ? 4 : 2}
            strokeLinecap="square"
          />
        ))}

        {plan.doors.map((door) => (
          <DoorMark key={door.id} door={door} toPx={toPx} />
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

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={ROOM_FILL[room.type] ?? "#f0f0f0"} stroke="#c9c9c9" strokeWidth={1} />
      <text x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill="#2b2b2b">
        {room.label}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" fontSize={fontSize - 2} fill="#5a5a5a">
        {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos; ({room.areaSqft} sqft)
      </text>
    </g>
  );
}

function DoorMark({ door, toPx }: { door: { x: number; y: number; width: number; orientation: "h" | "v" }; toPx: (ft: number) => number }) {
  const cx = toPx(door.x);
  const cy = toPx(door.y);
  const half = toPx(door.width) / 2;

  if (door.orientation === "h") {
    return <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke="#ffffff" strokeWidth={4} />;
  }
  return <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} stroke="#ffffff" strokeWidth={4} />;
}
