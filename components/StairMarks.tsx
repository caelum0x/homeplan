import type { Room } from "@/lib/layout/types";
import { stairGraphics, type PlanSegment } from "@/lib/stairs";

interface StairMarksProps {
  room: Room;
  toPx: (ft: number) => number;
}

/**
 * Tread lines, UP/DN travel arrow and a rotated name for a "stairs" room — the same
 * geometry lib/renderSvg.ts draws for PNG export (both read lib/stairs.ts), shared by the
 * 2D view and the Studio canvas so the two never drift. Renders nothing for other rooms,
 * which keep their normal horizontal label.
 */
export function StairMarks({ room, toPx }: StairMarksProps) {
  const stair = stairGraphics(room);
  if (!stair) return null;
  const seg = (s: PlanSegment, key: string, color: string, width: number) => (
    <line key={key} x1={toPx(s.x1)} y1={toPx(s.y1)} x2={toPx(s.x2)} y2={toPx(s.y2)} stroke={color} strokeWidth={width} />
  );
  const nameX = toPx(stair.nameAt.x);
  const nameY = toPx(stair.nameAt.y);
  return (
    <g style={{ pointerEvents: "none" }}>
      {stair.treads.map((t, i) => seg(t, `t${i}`, "#8a7a60", 1))}
      {seg(stair.arrow, "arrow", "#4a4030", 1.2)}
      {stair.arrowHead.map((h, i) => seg(h, `h${i}`, "#4a4030", 1.2))}
      <text x={toPx(stair.labelAt.x)} y={toPx(stair.labelAt.y) + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#4a4030">
        {stair.label}
      </text>
      {stair.nameAt.span >= 4 && (
        <text
          x={nameX}
          y={nameY}
          // Only a vertical ("y"-axis) strip needs the label rotated to run along it — an
          // "x"-axis strip (only after lib/layout/lotFit.ts rotates a multi-story plan 90/270
          // degrees) already reads along its own long side unrotated.
          transform={stair.axis === "y" ? `rotate(-90 ${nameX} ${nameY})` : undefined}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight={600}
          fill="#2b2b2b"
        >
          {room.label} · {room.w.toFixed(1)}&apos; × {room.h.toFixed(1)}&apos;
        </text>
      )}
    </g>
  );
}
