"use client";

import { useState } from "react";
import { FloorPlanSvg } from "@/components/FloorPlanSvg";
import { FloorPlanStudio } from "@/components/FloorPlanStudio";
import { FloorPlan3D } from "@/components/FloorPlan3D";
import type { BriefInput, FloorPlan } from "@/lib/layout/types";

interface GenerateResponse {
  input: BriefInput;
  plan: FloorPlan;
}

type ViewMode = "plan" | "studio" | "3d";

async function downloadExport(plan: FloorPlan, format: "pdf" | "dxf") {
  const res = await fetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `homeplan-floor-plan.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const EXAMPLES = [
  "3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living",
  "4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office",
  "cozy 2 bedroom 1 bath cottage, 900 sqft",
];

export default function Home() {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [exporting, setExporting] = useState<"pdf" | "dxf" | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setResult(null);
        setPlan(null);
        return;
      }
      setResult(data);
      setPlan(data.plan);
      setViewMode("plan");
    } catch {
      setError("Could not reach the generator. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format: "pdf" | "dxf") {
    if (!plan) return;
    setExporting(format);
    setError(null);
    try {
      await downloadExport(plan, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not export ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 80px", fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>HomePlan</h1>
        <p style={{ color: "#555", maxWidth: 640 }}>
          Open-source AI floor plan generator. Describe a home in plain language — bedroom/bathroom count,
          square footage, open-plan or not — and get a real, computed room layout with dimensions. No canned
          images: every plan below is generated from your exact input.
        </p>
      </header>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living"
          rows={3}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 15,
            borderRadius: 8,
            border: "1px solid #ccc",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
          <button
            type="submit"
            disabled={loading || description.trim().length < 5}
            style={{
              padding: "10px 18px",
              fontSize: 15,
              borderRadius: 8,
              border: "none",
              background: "#1f2937",
              color: "#fff",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Generating…" : "Generate floor plan"}
          </button>
          <span style={{ fontSize: 13, color: "#777" }}>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setDescription(ex)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: "#fafafa",
                cursor: "pointer",
                color: "#444",
              }}
            >
              {ex.length > 36 ? ex.slice(0, 36) + "…" : ex}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p role="alert" style={{ color: "#b00020", marginBottom: 16 }}>
          {error}
        </p>
      )}

      {result && plan && (
        <section>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 14, color: "#444" }}>
            <span>
              Parsed: <strong>{result.input.bedrooms} bed</strong>, <strong>{result.input.bathrooms} bath</strong>,{" "}
              <strong>{result.input.sqft} sqft target</strong>
              {result.input.openPlan ? ", open-plan" : ""}
              {result.input.hasGarage ? ", garage" : ""}
              {result.input.hasOffice ? ", office" : ""}
            </span>
            <span>
              Footprint: <strong>{plan.footprint.w}&apos; × {plan.footprint.h}&apos;</strong> — total{" "}
              <strong>{plan.totalAreaSqft} sqft</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {(["plan", "studio", "3d"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: viewMode === mode ? "#1f2937" : "#fafafa",
                  color: viewMode === mode ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              >
                {mode === "plan" ? "View" : mode === "studio" ? "Edit (Studio)" : "3D view"}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => handleExport("pdf")} disabled={exporting !== null} style={exportButtonStyle}>
              {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
            <button type="button" onClick={() => handleExport("dxf")} disabled={exporting !== null} style={exportButtonStyle}>
              {exporting === "dxf" ? "Exporting…" : "Export DXF"}
            </button>
          </div>

          {plan.warnings.length > 0 && (
            <ul
              style={{
                background: "#fff8e1",
                border: "1px solid #ffe8a3",
                borderRadius: 8,
                padding: "10px 16px",
                marginBottom: 16,
                fontSize: 13,
                color: "#6b5900",
              }}
            >
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {viewMode === "plan" && <FloorPlanSvg plan={plan} />}
          {viewMode === "studio" && <FloorPlanStudio plan={plan} onChange={setPlan} />}
          {viewMode === "3d" && <FloorPlan3D plan={plan} />}

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Rooms</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: "6px 8px" }}>Room</th>
                <th style={{ padding: "6px 8px" }}>Dimensions</th>
                <th style={{ padding: "6px 8px" }}>Area</th>
              </tr>
            </thead>
            <tbody>
              {plan.rooms.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 8px" }}>{r.label}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {r.w.toFixed(1)}&apos; × {r.h.toFixed(1)}&apos;
                  </td>
                  <td style={{ padding: "6px 8px" }}>{r.areaSqft} sqft</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer style={{ marginTop: 60, fontSize: 12, color: "#999" }}>
        Open source (MIT) ·{" "}
        <a href="https://github.com/caelum0x/homeplan" style={{ color: "#999" }}>
          github.com/caelum0x/homeplan
        </a>
      </footer>
    </main>
  );
}

const exportButtonStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "#fafafa",
  color: "#333",
  cursor: "pointer",
};
