// Client-side PNG export: rasterizes the plan's own SVG string (the same
// renderer used for PDF/the on-page view — lib/renderSvg.ts) onto an
// off-screen canvas and downloads it. No server round-trip, no new
// dependency (Canvas2D + Image are browser built-ins) — a real second export
// format (Maket also offers plain image-file export alongside PDF).

import type { FloorPlan } from "./layout/types";
import { floorPlanToSvgString, SVG_PADDING, SVG_SCALE } from "./renderSvg";

const PNG_UPSCALE = 2; // render at 2x for a crisp download, not a blurry screenshot-quality PNG

export async function downloadPlanAsPng(plan: FloorPlan, filename = "homeplan-floor-plan.png"): Promise<void> {
  const svgString = floorPlanToSvgString(plan);
  const widthPx = plan.footprint.w * SVG_SCALE + SVG_PADDING * 2;
  const heightPx = plan.footprint.h * SVG_SCALE + SVG_PADDING * 2;

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = widthPx * PNG_UPSCALE;
    canvas.height = heightPx * PNG_UPSCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is not available in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(PNG_UPSCALE, PNG_UPSCALE);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const pngBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode PNG."))), "image/png");
    });

    const downloadUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterize the floor plan SVG."));
    img.src = src;
  });
}
