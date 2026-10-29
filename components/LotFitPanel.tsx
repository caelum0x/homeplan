"use client";

import { useState } from "react";
import type { FloorPlan } from "@/lib/layout/types";
import {
  LOT_PRESETS,
  parseLotPointsText,
  lotPointsToText,
  normalizePlanToOrigin,
  polygonBounds,
  type Point,
  type Polygon,
  type LotFitResult,
} from "@/lib/layout/lotFit";
import { ROOM_FILL } from "@/lib/renderSvg";

interface LotFitPanelProps {
  plan: FloorPlan;
  /** Adopts the fitted (and re-normalized) plan as the app's active plan — same pattern as template/upload selection in app/page.tsx. */
  onApply: (plan: FloorPlan) => void;
}

/**
 * Real arbitrary lot/site-boundary fitting UI — see lib/layout/lotFit.ts for the actual
 * geometry. Minimal, real input (a polygon typed as "x, y" lines, in feet, plus presets) rather
 * than a drawing canvas, per this feature's own stated scope; the fitting itself is the real
 * work, not the input widget.
 */
export function LotFitPanel({ plan, onApply }: LotFitPanelProps) {
  const [pointsText, setPointsText] = useState(lotPointsToText(LOT_PRESETS[0].points));
  const [setbackText, setSetbackText] = useState("5");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LotFitResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function runFit() {
    setApplied(false);
    const lot = parseLotPointsText(pointsText);
    if (!lot) {
      setParseError("Enter at least 3 points, one per line, as \"x, y\" in feet.");
      setResult(null);
      return;
    }
    setParseError(null);
    const setbackFt = setbackText.trim() === "" ? 0 : Number(setbackText.trim());
    if (!Number.isFinite(setbackFt) || setbackFt < 0) {
      setParseError("Setback must be a non-negative number of feet.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/fit-lot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, lot, setbackFt }),
      });
      const data: LotFitResult = await res.json();
      setResult(data);
    } catch {
      setResult({
        feasible: false,
        plan: null,
        orientationDeg: null,
        lot,
        buildable: null,
        footprintAreaSqft: 0,
        buildableAreaSqft: null,
        lotAreaSqft: 0,
        warnings: [],
        error: "Could not reach the lot-fitting service. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result?.plan) return;
    onApply(normalizePlanToOrigin(result.plan));
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>Fit to a real lot boundary</h3>
      <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 14 }}>
        Enter your real lot as a polygon (any shape — not just a rectangle), in feet, one point per line as &ldquo;x, y&rdquo;, tracing the
        property line around once. This computes the plan&apos;s real exterior footprint (including any L-shape/garage/courtyard notch) and
        checks whether it fits inside the lot after a uniform setback, rotating it in 90° steps if needed to make it fit. No resizing/scaling is
        applied — if it genuinely doesn&apos;t fit even rotated, you&apos;ll get the real reason and real numbers, not a forced result.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {LOT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="chip"
            title={preset.description}
            onClick={() => {
              setPointsText(lotPointsToText(preset.points));
              setResult(null);
              setParseError(null);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) 1fr", gap: 16, marginBottom: 14 }}>
        <div>
          <label className="field-label" htmlFor="lot-points">
            Lot boundary points (ft)
          </label>
          <textarea
            id="lot-points"
            className="textarea"
            rows={8}
            style={{ fontSize: 12.5, fontFamily: "monospace" }}
            value={pointsText}
            onChange={(e) => setPointsText(e.target.value)}
          />
          <label className="field-label" style={{ marginTop: 10, display: "block" }} htmlFor="setback">
            Uniform setback (ft)
          </label>
          <input
            id="setback"
            type="number"
            min={0}
            className="text-input"
            style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
            value={setbackText}
            onChange={(e) => setSetbackText(e.target.value)}
          />
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={runFit} disabled={loading}>
            {loading ? "Fitting…" : "Fit to lot"}
          </button>
          {parseError && (
            <div className="alert alert-danger" style={{ marginTop: 10, fontSize: 12.5 }}>
              <span>{parseError}</span>
            </div>
          )}
        </div>

        <div>
          {!result && !loading && (
            <div className="empty-state" style={{ minHeight: 220 }}>
              <p>Enter a lot boundary and click &ldquo;Fit to lot&rdquo; to see the real result.</p>
            </div>
          )}
          {loading && <div className="skeleton" style={{ height: 320, borderRadius: 10 }} aria-label="Fitting to lot" />}
          {result && !loading && (
            <>
              <LotFitVisualization result={result} />
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                {result.feasible ? (
                  <div className="alert alert-success" style={{ alignItems: "flex-start" }}>
                    <span>
                      <strong>Fits.</strong> Orientation {result.orientationDeg}°, real footprint ~{result.footprintAreaSqft} sqft inside a ~
                      {result.buildableAreaSqft} sqft buildable area ({result.lotAreaSqft} sqft lot).
                      {result.warnings.map((w, i) => (
                        <span key={i} style={{ display: "block", marginTop: 4, color: "var(--color-ink-faint)" }}>
                          {w}
                        </span>
                      ))}
                    </span>
                  </div>
                ) : (
                  <div className="alert alert-warning" style={{ alignItems: "flex-start" }}>
                    <span>{result.error}</span>
                  </div>
                )}
              </div>
              {result.feasible && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={handleApply}>
                  {applied ? "Applied ✓" : "Use this fit as the active plan"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Self-contained SVG: draws the lot boundary, the setback-eroded buildable area, and the fitted plan's real rooms/walls all in the same real lot-coordinate space, at one shared scale. Separate from FloorPlanSvg on purpose — that component assumes a plan starts near (0,0) with no outer boundary to draw; this view's whole point is the opposite. */
function LotFitVisualization({ result }: { result: LotFitResult }) {
  const SCALE = 4; // px per foot — lots run much larger than a single floor plan, so a smaller scale than the main plan view (10px/ft) keeps this readable.
  const PADDING = 20;

  const allPoints: Point[] = [...result.lot, ...(result.buildable ?? [])];
  if (result.plan) {
    for (const r of result.plan.rooms) {
      allPoints.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
    }
  }
  const bounds = polygonBounds(allPoints.length >= 3 ? allPoints : result.lot);
  const toPx = (p: Point) => ({ x: (p.x - bounds.minX) * SCALE + PADDING, y: (p.y - bounds.minY) * SCALE + PADDING });
  const width = (bounds.maxX - bounds.minX) * SCALE + PADDING * 2;
  const height = (bounds.maxY - bounds.minY) * SCALE + PADDING * 2;

  const toPath = (poly: Polygon) => poly.map((p, i) => `${i === 0 ? "M" : "L"} ${toPx(p).x.toFixed(1)} ${toPx(p).y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Lot boundary with the fitted floor plan overlaid" className="card" style={{ background: "#fff" }}>
      <path d={toPath(result.lot)} fill="none" stroke="#2b2b2b" strokeWidth={1.75} strokeDasharray="6 3" />
      {result.buildable && <path d={toPath(result.buildable)} fill="none" stroke="#8a8578" strokeWidth={1} strokeDasharray="3 3" />}

      {result.plan &&
        result.plan.rooms.map((room) => (
          <rect
            key={room.id}
            x={toPx({ x: room.x, y: room.y }).x}
            y={toPx({ x: room.x, y: room.y }).y}
            width={room.w * SCALE}
            height={room.h * SCALE}
            fill={room.floorColor ?? ROOM_FILL[room.type] ?? "#f0f0f0"}
            stroke="#c9c9c9"
            strokeWidth={0.75}
          />
        ))}
      {result.plan &&
        result.plan.walls.map((wall) => (
          <line
            key={wall.id}
            x1={toPx({ x: wall.x1, y: wall.y1 }).x}
            y1={toPx({ x: wall.x1, y: wall.y1 }).y}
            x2={toPx({ x: wall.x2, y: wall.y2 }).x}
            y2={toPx({ x: wall.x2, y: wall.y2 }).y}
            stroke="#2b2b2b"
            strokeWidth={wall.exterior ? 2.5 : 1.25}
            strokeLinecap="square"
          />
        ))}
    </svg>
  );
}
