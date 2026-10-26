"use client";

import { useEffect, useState } from "react";
import { FloorPlanSvg } from "@/components/FloorPlanSvg";
import { FloorPlanStudio } from "@/components/FloorPlanStudio";
import { FloorPlan3D } from "@/components/FloorPlan3D";
import { AiRenderPanel } from "@/components/AiRenderPanel";
import { PricingCta } from "@/components/PricingCta";
import { VariantPicker } from "@/components/VariantPicker";
import { ChatEditPanel } from "@/components/ChatEditPanel";
import { TemplateGallery } from "@/components/TemplateGallery";
import { UploadPlanForm } from "@/components/UploadPlanForm";
import { BrandMark } from "@/components/BrandMark";
import type { BriefInput, FloorPlan } from "@/lib/layout/types";
import type { FloorPlanOption } from "@/lib/layout/generate";
import { downloadPlanAsPng } from "@/lib/exportPng";
import { buildShareUrl, readPlanFromLocation } from "@/lib/sharePlan";
import { saveTemplate } from "@/lib/templates";

interface GenerateResponse {
  input: BriefInput;
  options: FloorPlanOption[];
}

type ViewMode = "plan" | "studio" | "3d" | "render";
type Stage = "idle" | "loading" | "variants" | "editing";
type EntryMode = "describe" | "templates" | "upload";

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
  const [selectedVariantLabel, setSelectedVariantLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [exporting, setExporting] = useState<"pdf" | "dxf" | "png" | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("describe");
  const [traceImageUrl, setTraceImageUrl] = useState<string | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);

  // A shared link (?plan=...) opens straight into the editor with that exact plan.
  useEffect(() => {
    const shared = readPlanFromLocation();
    if (shared) {
      setPlan(shared);
      setSelectedVariantLabel("Shared plan");
      setStage("editing");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("loading");
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
        setStage("idle");
        return;
      }
      setResult(data);
      setPlan(null);
      setStage("variants");
    } catch {
      setError("Could not reach the generator. Try again.");
      setStage("idle");
    }
  }

  function selectVariant(option: FloorPlanOption) {
    setPlan(option.plan);
    setSelectedVariantLabel(option.variant.label);
    setViewMode("plan");
    setStage("editing");
  }

  async function handleExport(format: "pdf" | "dxf" | "png") {
    if (!plan) return;
    setExporting(format);
    setError(null);
    try {
      if (format === "png") await downloadPlanAsPng(plan);
      else await downloadExport(plan, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not export ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  }

  async function handleShare() {
    if (!plan) return;
    const url = buildShareUrl(plan);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleTemplateSelect(templatePlan: FloorPlan, label: string) {
    setResult(null);
    setPlan(templatePlan);
    setSelectedVariantLabel(label);
    setTraceImageUrl(null);
    setViewMode("plan");
    setStage("editing");
  }

  async function handleUploadSubmit(uploadDescription: string, imageDataUrl: string | null) {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: uploadDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setStage("idle");
        return;
      }
      const options: FloorPlanOption[] = data.options;
      const classic = options.find((o) => o.variant.id === "classic") ?? options[0];
      setResult(data);
      setPlan(classic.plan);
      setSelectedVariantLabel(`${classic.variant.label} (starter, trace onto your upload)`);
      setTraceImageUrl(imageDataUrl);
      setViewMode("studio");
      setStage("editing");
    } catch {
      setError("Could not reach the generator. Try again.");
      setStage("idle");
    }
  }

  function handleSaveTemplate() {
    if (!plan || !saveTemplateName.trim()) return;
    saveTemplate(saveTemplateName.trim(), plan);
    setSaveTemplateName("");
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2000);
  }

  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <a href="/" className="brand">
            <BrandMark className="brand-mark" />
            HomePlan
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <nav className="nav-links">
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="https://github.com/caelum0x/homeplan" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </nav>
            <a href="#pricing" className="btn btn-primary btn-sm" style={{ borderRadius: "var(--radius-full)" }}>
              Get HomePlan Pro
              <ArrowIcon />
            </a>
          </div>
        </div>
      </div>

      <main className="container" style={{ paddingBottom: 60 }}>
        <section className="hero hero-centered">
          <span className="hero-eyebrow">Open-source Maket.ai alternative</span>
          <h1 style={{ fontFamily: "var(--font-fraunces), serif" }}>The open-source AI floor plan generator</h1>
          <p>
            Describe a home in plain language and get a real, computed room layout back — walls, doors, dimensions,
            furniture, even a photorealistic render.
            <br />
            Free, instant, self-hostable, MIT licensed.
          </p>
        </section>

        <div id="features" className="card generator-card">
          <div className="segmented" style={{ marginBottom: 18 }}>
            {(
              [
                { id: "describe" as const, label: "Describe" },
                { id: "templates" as const, label: "Templates" },
                { id: "upload" as const, label: "Upload existing plan" },
              ]
            ).map((tab) => (
              <button key={tab.id} type="button" onClick={() => setEntryMode(tab.id)} className={`segmented-btn ${entryMode === tab.id ? "active" : ""}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {entryMode === "describe" && (
            <form onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="brief">
                Describe the home
              </label>
              <textarea
                id="brief"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living"
                rows={3}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <button type="submit" className="btn btn-primary" disabled={stage === "loading" || description.trim().length < 5}>
                  {stage === "loading" ? "Generating…" : "Generate floor plan"}
                  {stage !== "loading" && <ArrowIcon />}
                </button>
                <span style={{ fontSize: 12.5, color: "var(--color-ink-faint)" }}>Try:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setDescription(ex)} className="chip">
                    {ex.length > 36 ? ex.slice(0, 36) + "…" : ex}
                  </button>
                ))}
              </div>
            </form>
          )}

          {entryMode === "templates" && <TemplateGallery onSelect={handleTemplateSelect} />}

          {entryMode === "upload" && <UploadPlanForm onSubmit={handleUploadSubmit} loading={stage === "loading"} />}
        </div>

        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginTop: 20 }}>
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {stage === "loading" && (
          <div className="skeleton" style={{ height: 320, marginTop: 28 }} aria-label="Generating floor plan" />
        )}

        {stage === "idle" && !result && !error && entryMode === "describe" && (
          <div className="empty-state">
            <HouseOutlineIcon />
            <h3>No plan yet</h3>
            <p>Describe bedroom/bathroom count, square footage and any must-haves above, then generate.</p>
          </div>
        )}

        {stage === "variants" && result && (
          <section style={{ marginTop: 32 }}>
            <VariantPicker options={result.options} onSelect={selectVariant} />
          </section>
        )}

        {stage === "editing" && plan && (
          <section style={{ marginTop: 32 }}>
            <div className="stat-row">
              {result && (
                <span className="stat-pill">
                  Parsed: <strong>{result.input.bedrooms} bed</strong>, <strong>{result.input.bathrooms} bath</strong>,{" "}
                  <strong>{result.input.sqft} sqft target</strong>
                  {result.input.openPlan ? ", open-plan" : ""}
                </span>
              )}
              <span className="stat-pill">
                Footprint: <strong>{plan.footprint.w}&apos; × {plan.footprint.h}&apos;</strong>
              </span>
              <span className="stat-pill">
                Total: <strong>{plan.totalAreaSqft} sqft</strong>
              </span>
              {selectedVariantLabel && (
                <span className="stat-pill">
                  Variant: <strong>{selectedVariantLabel}</strong>
                </span>
              )}
              {result && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage("variants")}>
                  ← Change layout
                </button>
              )}
            </div>

            <div className="toolbar">
              <div className="segmented">
                {(["plan", "studio", "3d", "render"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`segmented-btn ${viewMode === mode ? "active" : ""}`}
                  >
                    {mode === "plan" ? "View" : mode === "studio" ? "Edit (Studio)" : mode === "3d" ? "3D view" : "AI Render"}
                  </button>
                ))}
              </div>
              <span className="toolbar-spacer" />
              <div className="toolbar-group">
                <button type="button" onClick={handleShare} className="btn btn-secondary btn-sm">
                  {shareCopied ? "Link copied" : "Share"}
                </button>
                <button type="button" onClick={() => handleExport("png")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  {exporting === "png" ? "Exporting…" : "PNG"}
                </button>
                <button type="button" onClick={() => handleExport("pdf")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  {exporting === "pdf" ? "Exporting…" : "PDF"}
                </button>
                <button type="button" onClick={() => handleExport("dxf")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  {exporting === "dxf" ? "Exporting…" : "DXF"}
                </button>
              </div>
            </div>

            <div className="toolbar" style={{ marginTop: -6 }}>
              <input
                type="text"
                className="text-input"
                placeholder="Template name…"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                style={{ maxWidth: 220, padding: "6px 10px", fontSize: 13 }}
              />
              <button type="button" onClick={handleSaveTemplate} disabled={!saveTemplateName.trim()} className="btn btn-secondary btn-sm">
                {templateSaved ? "Saved ✓" : "Save as template"}
              </button>
            </div>

            {plan.warnings.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: 18 }}>
                <AlertIcon />
                <ul>
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {viewMode === "plan" && <FloorPlanSvg plan={plan} />}
              {viewMode === "studio" && <FloorPlanStudio plan={plan} onChange={setPlan} traceImageUrl={traceImageUrl} />}
              {viewMode === "3d" && <FloorPlan3D plan={plan} />}
              {viewMode === "render" && <AiRenderPanel plan={plan} />}
            </div>

            <div style={{ marginTop: 18 }}>
              <ChatEditPanel plan={plan} onChange={setPlan} />
            </div>

            <h2 className="section-heading">Rooms</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Dimensions</th>
                  <th>Area</th>
                </tr>
              </thead>
              <tbody>
                {plan.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="cell-muted">
                      {r.w.toFixed(1)}&apos; × {r.h.toFixed(1)}&apos;
                    </td>
                    <td className="cell-muted">{r.areaSqft} sqft</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>

      <div id="pricing" className="container">
        <PricingCta />
      </div>

      <footer className="site-footer container">
        <span>Open source · MIT licensed · self-hostable</span>
        <a href="https://github.com/caelum0x/homeplan">github.com/caelum0x/homeplan</a>
      </footer>
    </>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" />
    </svg>
  );
}

function HouseOutlineIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5 12 4l8 7.5M6 10v9h12v-9M10 19v-5h4v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
