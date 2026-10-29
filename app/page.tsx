"use client";

import { useEffect, useState } from "react";
import { FloorPlanSvg } from "@/components/FloorPlanSvg";
import { FloorPlanStudio } from "@/components/FloorPlanStudio";
import { FloorPlan3D } from "@/components/FloorPlan3D";
import { AiRenderPanel } from "@/components/AiRenderPanel";
import { ZoningPanel } from "@/components/ZoningPanel";
import { LotFitPanel } from "@/components/LotFitPanel";
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
import { parseDescription } from "@/lib/parseDescription";
import heroExamplePlanData from "@/lib/data/heroExamplePlan.json";

// Real engine output (3 bed, 2 bath, home office — see plans/homeplan.md for how this
// was generated and captured), committed as static data so the hero's product card
// shows the exact same plan as public/hero-3d.png, byte-for-byte, and so this page
// never needs to call the layout engine (whose furniture IDs use Date.now(), which
// Next's static prerendering of this page correctly disallows at render time) just to
// render a label.
const heroExample = heroExamplePlanData as FloorPlan;

interface GenerateResponse {
  input: BriefInput;
  options: FloorPlanOption[];
}

type ViewMode = "plan" | "studio" | "3d" | "render" | "zoning" | "lot";
type Stage = "idle" | "loading" | "variants" | "editing";
type EntryMode = "describe" | "templates" | "upload";

class ProRequiredError extends Error {}

async function downloadExport(payload: { plan: FloorPlan } | { floors: FloorPlan[] }, format: "pdf" | "dxf", filename: string) {
  const res = await fetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 402) {
    const data = await res.json().catch(() => ({}));
    throw new ProRequiredError(data.message ?? "PDF and DXF export require HomePlan Pro on this hosted site.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const EXAMPLES = [
  "3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living",
  "2-story, 4 bed 3.5 bath, 2800 sqft, 2-car garage, home office",
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
  const [proStatus, setProStatus] = useState<{ isPro: boolean; hosted: boolean } | null>(null);
  // Explicit story choice from the toggle; null = follow whatever the description says (default 1).
  const [storiesChoice, setStoriesChoice] = useState<1 | 2 | null>(null);
  // Explicit L-shaped-footprint choice from the toggle; null = follow whatever the description says.
  const [lShapedChoice, setLShapedChoice] = useState<boolean | null>(null);
  // Multi-story plans: every floor (ground first). `plan` is always the floor being viewed/edited,
  // kept in sync with floors[activeFloor] by updatePlan so edits on one floor survive switching.
  const [floors, setFloors] = useState<FloorPlan[] | null>(null);
  const [activeFloor, setActiveFloor] = useState(0);
  // Shared between the export gate (PDF/DXF) and the generate gate (multi-story/L-shaped) — both
  // 402 the same way, so the same "Get Pro / Claim access" prompt applies to either.
  const [proUpgradeNeeded, setProUpgradeNeeded] = useState(false);

  const heroBedCount = heroExample.rooms.filter((r) => r.type === "bedroom" || r.type === "primary_bedroom").length;
  const heroBathCount = heroExample.rooms.filter((r) => r.type === "bath" || r.type === "primary_bath" || r.type === "half_bath").length;

  // A shared link (?plan=...) opens straight into the editor with that exact plan.
  useEffect(() => {
    const shared = readPlanFromLocation();
    if (shared) {
      loadSinglePlan(shared);
      setSelectedVariantLabel("Shared plan");
      setStage("editing");
    }
  }, []);

  // Tells the UI whether PDF/DXF export is actually gated here (hosted only) and
  // whether this browser already has a verified Pro session, so the export
  // buttons/feature copy reflect reality instead of always claiming "all free".
  useEffect(() => {
    fetch("/api/pro/me")
      .then((res) => res.json())
      .then((data) => setProStatus({ isPro: Boolean(data.isPro), hosted: Boolean(data.hosted) }))
      .catch(() => setProStatus({ isPro: false, hosted: false }));
  }, []);

  // True on the hosted deployment for any visitor without a verified Pro session — drives the
  // "Pro" hints on export buttons and on the multi-story/L-shaped toggles. Always false on self-host.
  const proGated = Boolean(proStatus?.hosted && !proStatus?.isPro);
  const effectiveStories = storiesChoice ?? parseDescription(description).stories ?? 1;
  // L-shaped massing is single-story-only v1 (lib/layout/multiStory.ts never reads it) — the
  // toggle only has an effect (and only shows as available) when 1 story is selected.
  const effectiveLShaped = effectiveStories === 2 ? false : (lShapedChoice ?? parseDescription(description).lShaped ?? false);

  /** Loads a single-story plan (template, share link, upload, hero example) — clears any multi-story state. */
  function loadSinglePlan(next: FloorPlan | null) {
    setFloors(null);
    setActiveFloor(0);
    setPlan(next);
  }

  /** Every edit (Studio, chat-edit) goes through here so the active floor's copy in `floors` never goes stale. */
  function updatePlan(next: FloorPlan) {
    setPlan(next);
    setFloors((prev) => (prev ? prev.map((f, i) => (i === activeFloor ? next : f)) : prev));
  }

  function switchFloor(index: number) {
    if (!floors || !floors[index]) return;
    setActiveFloor(index);
    setPlan(floors[index]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("loading");
    setError(null);
    setProUpgradeNeeded(false);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          ...(storiesChoice ? { stories: storiesChoice } : {}),
          ...(effectiveStories === 1 && lShapedChoice !== null ? { lShaped: lShapedChoice } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setProUpgradeNeeded(true);
        setError(data.message ?? data.error ?? "Something went wrong.");
        setResult(null);
        loadSinglePlan(null);
        setStage("idle");
        return;
      }
      setResult(data);
      loadSinglePlan(null);
      setStage("variants");
    } catch {
      setError("Could not reach the generator. Try again.");
      setStage("idle");
    }
  }

  function selectVariant(option: FloorPlanOption) {
    setFloors(option.floors ?? null);
    setActiveFloor(0);
    setPlan(option.floors?.[0] ?? option.plan);
    setSelectedVariantLabel(option.variant.label);
    setViewMode("plan");
    setStage("editing");
  }

  async function handleExport(format: "pdf" | "dxf" | "png") {
    if (!plan) return;
    setExporting(format);
    setError(null);
    setProUpgradeNeeded(false);
    // Multi-story: PDF gets every floor as its own page (one document, shared scale); PNG/DXF
    // export the floor currently shown, named after it, so each floor can be downloaded separately.
    const floorSuffix = floors ? `-floor-${activeFloor + 1}` : "";
    try {
      if (format === "png") await downloadPlanAsPng(plan, `homeplan-floor-plan${floorSuffix}.png`);
      else if (format === "pdf" && floors) await downloadExport({ floors }, "pdf", `homeplan-${floors.length}-story-floor-plans.pdf`);
      else await downloadExport({ plan }, format, `homeplan-floor-plan${floorSuffix}.${format}`);
    } catch (err) {
      if (err instanceof ProRequiredError) setProUpgradeNeeded(true);
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
    loadSinglePlan(templatePlan);
    setSelectedVariantLabel(label);
    setTraceImageUrl(null);
    setViewMode("plan");
    setStage("editing");
  }

  // Hero product card's real "Open in Studio" action — opens the exact same real plan
  // shown in public/hero-3d.png (same brief, same engine), the same way picking a
  // template does. Not decorative chrome: it's a genuine working control.
  function handleOpenHeroExample() {
    handleTemplateSelect(heroExample, "Example plan");
  }

  async function handleUploadSubmit(uploadDescription: string, imageDataUrl: string | null) {
    setStage("loading");
    setError(null);
    try {
      // Real automated path first: ask the vision model to read room counts straight
      // out of the uploaded image. Any failure (model rate-limited, no credential,
      // malformed response — all real, surfaced via a 503) falls through to the
      // existing manual trace-over generator below rather than showing nothing.
      if (imageDataUrl) {
        try {
          const vecRes = await fetch("/api/vectorize-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl, brief: uploadDescription }),
          });
          if (vecRes.ok) {
            const vecData = await vecRes.json();
            const options: FloorPlanOption[] = vecData.options;
            const classic = options.find((o) => o.variant.id === "classic") ?? options[0];
            setResult(vecData);
            loadSinglePlan(classic.plan);
            setSelectedVariantLabel(`${classic.variant.label} (vectorized from your upload — ${vecData.summary})`);
            setTraceImageUrl(imageDataUrl);
            setViewMode("studio");
            setStage("editing");
            return;
          }
        } catch {
          // Network error reaching the vectorizer — fall through to the manual flow below.
        }
      }

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
      loadSinglePlan(classic.plan);
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
          <div className="nav-actions">
            <nav className="nav-links">
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="https://github.com/caelum0x/homeplan" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </nav>
            <a href="#pricing" className="btn btn-primary btn-pill btn-sm">
              Get HomePlan Pro
              <span className="icon-circle">
                <ArrowIcon />
              </span>
            </a>
          </div>
        </div>
      </div>

      <main className="container" style={{ paddingBottom: 60 }}>
        <section className="hero hero-centered">
          <span className="hero-eyebrow">Open source</span>
          <h1>From a sentence to a buildable floor plan</h1>
          <p>Real computed rooms, walls, and doors. Free exports, no credit limits, self-hostable.</p>

          <div className="hero-product-card">
            <div className="hero-product-topbar">
              <span>Example · 3D massing view</span>
              <button type="button" onClick={handleOpenHeroExample} className="hero-product-open">
                Open in Studio
                <ArrowIcon />
              </button>
            </div>
            <div className="hero-product-image-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-3d.png"
                alt="A real HomePlan-generated floor plan shown as a 3D massing view with furniture"
                className="hero-product-image"
              />
              <span className="dim-line dim-line-bottom" aria-hidden="true">
                <span className="dim-label">{heroExample.footprint.w.toFixed(1)} ft</span>
              </span>
              <span className="dim-line dim-line-right" aria-hidden="true">
                <span className="dim-label">{heroExample.footprint.h.toFixed(1)} ft</span>
              </span>
            </div>
          </div>

          <p className="hero-meta-line">
            {heroBedCount} bed &middot; {heroBathCount} bath &middot; {Math.round(heroExample.totalAreaSqft).toLocaleString()} sqft &mdash; generated
            instantly, free
          </p>

          <a href="#generator" className="btn btn-primary btn-pill">
            Generate your own
            <span className="icon-circle">
              <ArrowIcon />
            </span>
          </a>
        </section>

        <div id="generator" className="card generator-card">
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
                <div className="segmented" role="group" aria-label="Number of stories">
                  {([1, 2] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStoriesChoice(n)}
                      className={`segmented-btn ${effectiveStories === n ? "active" : ""}`}
                      aria-pressed={effectiveStories === n}
                    >
                      {n === 1 ? "1 story" : `2 stories${proGated ? " (Pro)" : ""}`}
                    </button>
                  ))}
                </div>
                {effectiveStories === 1 && (
                  <button
                    type="button"
                    onClick={() => setLShapedChoice(!effectiveLShaped)}
                    className={`segmented-btn ${effectiveLShaped ? "active" : ""}`}
                    style={{ border: "1px solid var(--color-border)" }}
                    aria-pressed={effectiveLShaped}
                    title="Private bedroom wing steps in from the main block instead of a flat rectangle"
                  >
                    {proGated ? "L-shaped (Pro)" : "L-shaped"}
                  </button>
                )}
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
            <span>
              {error}
              {proUpgradeNeeded && (
                <>
                  {" "}
                  <a href="#pricing">Get HomePlan Pro</a> or already subscribed? <a href="/pro/access">Claim access</a>.
                </>
              )}
            </span>
          </div>
        )}

        {stage === "loading" && (
          <div className="skeleton" style={{ height: 320, marginTop: 28 }} aria-label="Generating floor plan" />
        )}

        {stage === "idle" && !result && !error && entryMode === "describe" && (
          <div className="empty-state">
            <HouseOutlineIcon />
            <h3>No plan yet</h3>
            <p>Describe bedrooms, baths, and square footage above.</p>
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
                {floors ? "This floor" : "Total"}: <strong>{plan.totalAreaSqft} sqft</strong>
              </span>
              {floors && (
                <span className="stat-pill">
                  All {floors.length} floors: <strong>{Math.round(floors.reduce((sum, f) => sum + f.totalAreaSqft, 0) * 10) / 10} sqft</strong>
                </span>
              )}
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

            {floors && (
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <div className="segmented" role="tablist" aria-label="Floor">
                  {floors.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={activeFloor === i}
                      onClick={() => switchFloor(i)}
                      className={`segmented-btn ${activeFloor === i ? "active" : ""}`}
                    >
                      {i === 0 ? "Floor 1 · Ground" : `Floor ${i + 1} · Upper`}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: 12.5, color: "var(--color-ink-faint)" }}>
                  Same footprint on every floor — the stair sits in the identical spot on both.
                </span>
              </div>
            )}

            <div className="toolbar">
              <div className="segmented">
                {(["plan", "studio", "3d", "render", "zoning", "lot"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`segmented-btn ${viewMode === mode ? "active" : ""}`}
                  >
                    {mode === "plan"
                      ? "View"
                      : mode === "studio"
                        ? "Edit (Studio)"
                        : mode === "3d"
                          ? "3D view"
                          : mode === "render"
                            ? "Style Moodboard"
                            : mode === "zoning"
                              ? "Zoning Assistant"
                              : "Fit to Lot"}
                  </button>
                ))}
              </div>
              <span className="toolbar-spacer" />
              <div className="toolbar-group">
                <button type="button" onClick={handleShare} className="btn btn-secondary btn-sm">
                  <ShareIcon />
                  {shareCopied ? "Link copied" : "Share"}
                </button>
                <button type="button" onClick={() => handleExport("png")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  <DownloadIcon />
                  {exporting === "png" ? "Exporting…" : "PNG"}
                </button>
                <button type="button" onClick={() => handleExport("pdf")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  <DownloadIcon />
                  {exporting === "pdf" ? "Exporting…" : `${floors ? `PDF (${floors.length} floors)` : "PDF"}${proGated ? " · Pro" : ""}`}
                </button>
                <button type="button" onClick={() => handleExport("dxf")} disabled={exporting !== null} className="btn btn-secondary btn-sm">
                  <DownloadIcon />
                  {exporting === "dxf" ? "Exporting…" : proGated ? "DXF (Pro)" : "DXF"}
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
              {viewMode === "studio" && <FloorPlanStudio key={`studio-${activeFloor}`} plan={plan} onChange={updatePlan} traceImageUrl={traceImageUrl} />}
              {viewMode === "3d" && <FloorPlan3D plan={plan} />}
              {viewMode === "render" && <AiRenderPanel plan={plan} />}
              {viewMode === "zoning" && <ZoningPanel plan={plan} stories={floors ? (floors.length as 1 | 2) : 1} />}
              {viewMode === "lot" && <LotFitPanel plan={plan} onApply={updatePlan} />}
            </div>

            <div style={{ marginTop: 18 }}>
              <ChatEditPanel key={`chat-${activeFloor}`} plan={plan} onChange={updatePlan} />
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

      <div className="container">
        <TaglineReveal text="Every plan is real geometry, not a picture. Rooms, walls, and doors you can measure, edit, and export instantly." />

        <div id="features" className="feature-grid">
          <FeatureCard icon={<SparkleIcon />} title="Generate">
            {proGated
              ? "1-story, rectangular layouts are free and unlimited here. Multi-story and L-shaped footprints are part of HomePlan Pro — fully free if you self-host."
              : "Describe bedrooms, baths, and square footage, including multi-story and L-shaped. Get three real layouts instantly."}
          </FeatureCard>
          <FeatureCard icon={<EditPencilIcon />} title="Edit">
            Drag rooms in Studio, or type a change in plain language.
          </FeatureCard>
          <FeatureCard icon={<DownloadIcon />} title="Export">
            {proGated
              ? "PNG, 3D massing, and style moodboards are free and unlimited here. PDF and DXF export are part of HomePlan Pro on this hosted site — fully free if you self-host."
              : "PDF, DXF, PNG, 3D massing, and style moodboards — all free, unlimited."}
          </FeatureCard>
        </div>
      </div>

      <div id="pricing" className="container">
        <PricingCta />
      </div>

      <footer className="site-footer container">
        <div className="site-footer-top">
          <a href="/" className="brand">
            <BrandMark className="brand-mark" />
            HomePlan
          </a>
          <div className="site-footer-columns">
            <div className="site-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="https://github.com/caelum0x/homeplan" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
            <div className="site-footer-col">
              <h4>Resources</h4>
              <a href="https://github.com/caelum0x/homeplan#readme" target="_blank" rel="noreferrer">
                Documentation
              </a>
              <a href="https://github.com/caelum0x/homeplan/blob/main/LICENSE" target="_blank" rel="noreferrer">
                License (MIT)
              </a>
              <a href="https://github.com/caelum0x/homeplan/issues/new" target="_blank" rel="noreferrer">
                Report an issue
              </a>
            </div>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>Open source · MIT licensed · self-hostable</span>
          <a href="https://github.com/caelum0x/homeplan">github.com/caelum0x/homeplan</a>
        </div>
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

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditPencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19 9l-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m14 6 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function FeatureCard({ icon, title, children }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <div className="feature-card-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/**
 * The one large-type "stop and read this" moment (separate from the hero),
 * per the landing-page-design skill's tagline-reveal rule: each word starts
 * muted and activates to full ink color, in reading order, once the section
 * crosses into view — never a single all-at-once fade, never replayed.
 */
function TaglineReveal({ text }: { text: string }) {
  const [activeCount, setActiveCount] = useState(0);
  const words = text.split(" ");

  function handleRef(node: HTMLParagraphElement | null) {
    if (!node || activeCount > 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          words.forEach((_, i) => {
            setTimeout(() => setActiveCount((c) => Math.max(c, i + 1)), i * 45);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
  }

  return (
    <section className="tagline-reveal">
      <p ref={handleRef}>
        {words.map((word, i) => (
          <span key={i} className={`tagline-word ${i < activeCount ? "active" : ""}`}>
            {word}{" "}
          </span>
        ))}
      </p>
    </section>
  );
}
