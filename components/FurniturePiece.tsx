import type { FurnitureItem } from "@/lib/layout/types";
import { FURNITURE_CATALOG } from "@/lib/layout/furniture";
import { furnitureIconDetails } from "@/lib/furnitureIcon";

interface FurniturePieceProps {
  item: FurnitureItem;
  toPx: (ft: number) => number;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/** One furniture piece, shared between the read-only plan view and the draggable Studio editor. */
export function FurniturePiece({ item, toPx, selected, onPointerDown }: FurniturePieceProps) {
  const w = toPx(item.w);
  const h = toPx(item.h);
  const spec = FURNITURE_CATALOG[item.type];
  const details = furnitureIconDetails(item.type);

  return (
    <g
      transform={`translate(${toPx(item.x)}, ${toPx(item.y)}) rotate(${item.rotation}, ${w / 2}, ${h / 2})`}
      onPointerDown={onPointerDown}
      style={{ cursor: onPointerDown ? "move" : undefined }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={spec.color}
        fillOpacity={item.type === "rug" ? 0.5 : 0.85}
        stroke={selected ? "#c9622d" : "#5a5a5a"}
        strokeWidth={selected ? 1.75 : 0.75}
        rx={2}
      />
      {details.map((shape, i) => {
        if (shape.kind === "rect") {
          return (
            <rect
              key={i}
              x={shape.x * w}
              y={shape.y * h}
              width={shape.w * w}
              height={shape.h * h}
              fill={shape.fill === "base" ? spec.color : "none"}
              stroke={shape.stroke ? "#5a5a5a" : "none"}
              strokeWidth={1}
              strokeDasharray={shape.dashed ? "4 3" : undefined}
              rx={(shape.rx ?? 0) * Math.min(w, h)}
            />
          );
        }
        if (shape.kind === "circle") {
          return (
            <circle
              key={i}
              cx={shape.cx * w}
              cy={shape.cy * h}
              r={shape.r * Math.min(w, h)}
              fill={shape.fill === "base" ? spec.color : "none"}
              stroke="#5a5a5a"
              strokeWidth={1}
            />
          );
        }
        return <line key={i} x1={shape.x1 * w} y1={shape.y1 * h} x2={shape.x2 * w} y2={shape.y2 * h} stroke="#5a5a5a" strokeWidth={1} />;
      })}
    </g>
  );
}
