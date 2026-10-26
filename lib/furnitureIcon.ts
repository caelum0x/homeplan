// Shared top-down furniture icon geometry — plain shape descriptors in a
// unit square (0..1 x 0..1), scaled/positioned/rotated by each renderer
// (SVG string in lib/renderSvg.ts, React SVG in components/*). Every shape
// is a simple rect/circle/line primitive, not an imported icon asset.

import type { FurnitureType } from "./layout/types";

export type IconShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: "base" | "none"; stroke?: boolean; dashed?: boolean; rx?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: "base" | "none" }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

/** Returns a unit-square icon (coordinates 0..1) for a furniture type — the base rect is always implicit; these are the extra detail marks drawn on top. */
export function furnitureIconDetails(type: FurnitureType): IconShape[] {
  switch (type) {
    case "bed_queen":
    case "bed_single":
      return [
        { kind: "rect", x: 0.08, y: 0.06, w: 0.36, h: 0.18, stroke: true, fill: "none" },
        { kind: "rect", x: 0.56, y: 0.06, w: 0.36, h: 0.18, stroke: true, fill: "none" },
        { kind: "line", x1: 0, y1: 0.32, x2: 1, y2: 0.32 },
      ];
    case "sofa":
      return [
        { kind: "rect", x: 0, y: 0, w: 1, h: 0.22, fill: "none", stroke: true },
        { kind: "rect", x: 0, y: 0, w: 0.1, h: 1, fill: "none", stroke: true },
        { kind: "rect", x: 0.9, y: 0, w: 0.1, h: 1, fill: "none", stroke: true },
      ];
    case "armchair":
    case "office_chair":
    case "dining_chair":
      return [{ kind: "rect", x: 0.12, y: 0.12, w: 0.76, h: 0.76, fill: "none", stroke: true, rx: 0.1 }];
    case "coffee_table":
    case "dining_table":
    case "desk":
      return [{ kind: "rect", x: 0.08, y: 0.08, w: 0.84, h: 0.84, fill: "none", stroke: true }];
    case "kitchen_island":
      return [
        { kind: "line", x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9 },
        { kind: "rect", x: 0.1, y: 0.1, w: 0.8, h: 0.8, fill: "none", stroke: true },
      ];
    case "wardrobe":
    case "dresser":
    case "bookshelf":
    case "tv_stand":
      return [
        { kind: "line", x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
        { kind: "line", x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      ];
    case "nightstand":
      return [{ kind: "circle", cx: 0.5, cy: 0.5, r: 0.12, fill: "none" }];
    case "fridge":
      return [{ kind: "line", x1: 0, y1: 0.3, x2: 1, y2: 0.3 }];
    case "stove":
      return [
        { kind: "circle", cx: 0.28, cy: 0.3, r: 0.12, fill: "none" },
        { kind: "circle", cx: 0.72, cy: 0.3, r: 0.12, fill: "none" },
        { kind: "circle", cx: 0.28, cy: 0.7, r: 0.12, fill: "none" },
        { kind: "circle", cx: 0.72, cy: 0.7, r: 0.12, fill: "none" },
      ];
    case "sink_kitchen":
    case "sink_bath":
      return [{ kind: "rect", x: 0.18, y: 0.2, w: 0.64, h: 0.6, fill: "none", stroke: true, rx: 0.08 }];
    case "toilet":
      return [
        { kind: "rect", x: 0.12, y: 0.03, w: 0.76, h: 0.3, fill: "none", stroke: true },
        { kind: "circle", cx: 0.5, cy: 0.66, r: 0.3, fill: "none" },
      ];
    case "bathtub":
      return [{ kind: "rect", x: 0.1, y: 0.06, w: 0.8, h: 0.88, fill: "none", stroke: true, rx: 0.3 }];
    case "shower":
      return [
        { kind: "line", x1: 0, y1: 0, x2: 1, y2: 1 },
        { kind: "line", x1: 0.33, y1: 0, x2: 1, y2: 0.67 },
        { kind: "line", x1: 0, y1: 0.33, x2: 0.67, y2: 1 },
      ];
    case "rug":
      return [{ kind: "rect", x: 0.06, y: 0.06, w: 0.88, h: 0.88, fill: "none", stroke: true, dashed: true, rx: 0.05 }];
    default:
      return [];
  }
}
