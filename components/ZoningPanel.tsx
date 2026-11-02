"use client";

import { useMemo, useRef, useState } from "react";
import type { FloorPlan } from "@/lib/layout/types";
import { checkZoningCompliance, R1_SUBURBAN_BASELINE, type ZoningComplianceResult } from "@/lib/layout/zoningRules";

interface ZoningPanelProps {
  plan: FloorPlan;
  stories: 1 | 2;
}

interface Exchange {
  id: number;
  question: string;
  answer: string | null;
  error: string | null;
  groundedOn: string | null;
  usedDocument: boolean;
}

const SUGGESTIONS = ["What setbacks usually apply to a house this size?", "Is this plan likely within typical lot coverage limits?", "What's a typical max height limit for a home this tall?"];

/**
 * Zoning/regulatory assistant — a real document-Q&A feature, not geometry. Grounded in
 * this plan's real computed footprint/area/stories/rooms (lib/zoningAssistant.ts's
 * planToFacts), plus an optional lot size and an optional pasted zoning-ordinance
 * excerpt for true document grounding. No live per-jurisdiction code database exists —
 * the honesty boundary is enforced in the assistant's own system prompt and repeated
 * here in the UI copy, not just assumed.
 */
export function ZoningPanel({ plan, stories }: ZoningPanelProps) {
  const [lotWidthFt, setLotWidthFt] = useState("60");
  const [lotDepthFt, setLotDepthFt] = useState("120");
  const [frontSetbackFt, setFrontSetbackFt] = useState(String(R1_SUBURBAN_BASELINE.frontSetbackFt));
  const [sideSetbackFt, setSideSetbackFt] = useState(String(R1_SUBURBAN_BASELINE.sideSetbackFt));
  const [rearSetbackFt, setRearSetbackFt] = useState(String(R1_SUBURBAN_BASELINE.rearSetbackFt));
  const [maxCoveragePct, setMaxCoveragePct] = useState(String(R1_SUBURBAN_BASELINE.maxLotCoveragePct));

  const compliance = useMemo<ZoningComplianceResult | null>(() => {
    const lotW = Number(lotWidthFt);
    const lotD = Number(lotDepthFt);
    const front = Number(frontSetbackFt);
    const side = Number(sideSetbackFt);
    const rear = Number(rearSetbackFt);
    const maxPct = Number(maxCoveragePct);
    if (![lotW, lotD, front, side, rear, maxPct].every((n) => Number.isFinite(n) && n >= 0) || lotW <= 0 || lotD <= 0 || maxPct <= 0) {
      return null;
    }
    return checkZoningCompliance({
      footprintAreaSqft: plan.totalAreaSqft,
      footprintWFt: plan.footprint.w,
      footprintHFt: plan.footprint.h,
      lotWidthFt: lotW,
      lotDepthFt: lotD,
      frontSetbackFt: front,
      sideSetbackFt: side,
      rearSetbackFt: rear,
      maxLotCoveragePct: maxPct,
    });
  }, [plan, lotWidthFt, lotDepthFt, frontSetbackFt, sideSetbackFt, rearSetbackFt, maxCoveragePct]);

  const [lotSizeInput, setLotSizeInput] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [showDocument, setShowDocument] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const idRef = useRef(0);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setQuestion("");
    const lotSizeSqft = lotSizeInput.trim() ? Number(lotSizeInput.trim()) : undefined;

    try {
      const res = await fetch("/api/zoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          plan,
          stories,
          lotSizeSqft: Number.isFinite(lotSizeSqft) ? lotSizeSqft : undefined,
          documentText: documentText.trim() || undefined,
        }),
      });
      const data = await res.json();
      const entry: Exchange = {
        id: idRef.current++,
        question: trimmed,
        answer: res.ok ? data.answer : null,
        error: res.ok ? null : data.error ?? "Something went wrong.",
        groundedOn: res.ok ? data.groundedOn : null,
        usedDocument: res.ok ? Boolean(data.usedDocument) : false,
      };
      setExchanges((e) => [...e, entry]);
    } catch {
      setExchanges((e) => [...e, { id: idRef.current++, question: trimmed, answer: null, error: "Could not reach the zoning assistant. Try again.", groundedOn: null, usedDocument: false }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>Setback &amp; lot-coverage check</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 14 }}>
          Deterministic math, no AI: checks this plan&apos;s real footprint against a rectangular lot minus front/side/rear setbacks, and against a max
          lot-coverage percentage. The defaults below are a <strong>{R1_SUBURBAN_BASELINE.label}</strong> — not any specific city or county&apos;s real
          code. Edit every field to match your own local ordinance before relying on this for anything real. This slice only covers a{" "}
          <strong>rectangular lot</strong> against this plan&apos;s rectangular bounding footprint — for an irregular lot, use the &ldquo;Fit to lot&rdquo;
          tab instead (it supports any polygon, with one uniform setback rather than distinct front/side/rear distances). It does not check height limits,
          accessory structures, or corner-lot double-frontage rules.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(90px, 1fr))", gap: 10, marginBottom: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Lot width (ft)
            <input type="number" min={0} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={lotWidthFt} onChange={(e) => setLotWidthFt(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Lot depth (ft)
            <input type="number" min={0} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={lotDepthFt} onChange={(e) => setLotDepthFt(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Max lot coverage (%)
            <input type="number" min={0} max={100} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={maxCoveragePct} onChange={(e) => setMaxCoveragePct(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Front setback (ft)
            <input type="number" min={0} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={frontSetbackFt} onChange={(e) => setFrontSetbackFt(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Side setback (ft, each side)
            <input type="number" min={0} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={sideSetbackFt} onChange={(e) => setSideSetbackFt(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-ink-soft)" }}>
            Rear setback (ft)
            <input type="number" min={0} className="text-input" style={{ padding: "6px 10px", fontSize: 13 }} value={rearSetbackFt} onChange={(e) => setRearSetbackFt(e.target.value)} />
          </label>
        </div>

        {compliance === null ? (
          <div className="alert alert-warning" style={{ fontSize: 12.5 }}>
            <span>Enter a positive lot width, lot depth, and max coverage percentage (setbacks may be 0).</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className={`alert ${compliance.coverage.pass ? "alert-success" : "alert-danger"}`} style={{ fontSize: 12.5 }}>
              <span>
                <strong>Lot coverage: {compliance.coverage.pass ? "PASS" : "FAIL"}</strong> — real building footprint {compliance.coverage.footprintAreaSqft} sqft
                is {compliance.coverage.actualCoveragePct}% of the {compliance.coverage.lotAreaSqft} sqft lot (cap {compliance.coverage.maxCoveragePct}%).{" "}
                {compliance.coverage.pass
                  ? `${compliance.coverage.marginSqft} sqft of coverage headroom remains under the cap.`
                  : `${Math.abs(compliance.coverage.marginSqft)} sqft over the cap.`}
              </span>
            </div>
            <div className={`alert ${compliance.setback.pass ? "alert-success" : "alert-danger"}`} style={{ fontSize: 12.5 }}>
              <span>
                <strong>Setback clearance: {compliance.setback.pass ? "PASS" : "FAIL"}</strong> — buildable envelope after setbacks is{" "}
                {compliance.setback.buildableWidthFt}&apos; x {compliance.setback.buildableDepthFt}&apos;; this plan&apos;s bounding footprint is{" "}
                {compliance.setback.footprintWFt}&apos; x {compliance.setback.footprintHFt}&apos;.{" "}
                {compliance.setback.pass
                  ? `Fits ${compliance.setback.fittingOrientation === "rotated-90" ? "rotated 90° on the lot" : "as-generated"}, with ${compliance.setback.marginFt}' of clearance on the tightest side.`
                  : "Does not fit the buildable envelope in either orientation (as-generated or rotated 90°)."}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>Zoning &amp; code assistant</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 14 }}>
          Ask a plain-language question about setbacks, max height, lot coverage, or other building-code constraints for this plan. This has{" "}
        <strong>no live database of any specific city or county&apos;s actual zoning code</strong> — without a pasted document, it answers with general,
        widely-common U.S. residential patterns and says so. Paste an excerpt of your real local ordinance below for a grounded answer instead of a
        general one. Always confirm with your local planning department or a licensed architect before relying on this for a permit.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-ink-soft)" }}>
          Lot size (sqft, optional)
          <input
            type="number"
            min={0}
            className="text-input"
            style={{ width: 110, padding: "6px 10px", fontSize: 13 }}
            placeholder="e.g. 6000"
            value={lotSizeInput}
            onChange={(e) => setLotSizeInput(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDocument((v) => !v)}>
          {showDocument ? "Hide zoning document" : documentText ? "Edit pasted zoning document" : "Paste your local zoning code (optional)"}
        </button>
      </div>

      {showDocument && (
        <textarea
          className="textarea"
          rows={5}
          style={{ marginBottom: 12, fontSize: 12.5 }}
          placeholder="Paste an excerpt of your municipality's zoning ordinance or building code (setback, height, or lot-coverage sections work best). When present, the assistant treats this text as the authoritative source instead of general patterns."
          value={documentText}
          onChange={(e) => setDocumentText(e.target.value)}
        />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      {exchanges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
          {exchanges.map((ex) => (
            <div key={ex.id}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-soft)", marginBottom: 4 }}>&ldquo;{ex.question}&rdquo;</div>
              {ex.answer && (
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {ex.answer}
                  <div style={{ fontSize: 11, color: "var(--color-ink-faint)", marginTop: 6 }}>
                    {ex.usedDocument ? "Grounded in your pasted zoning document + " : "General guidance only (no document pasted) + "}
                    this plan&apos;s real computed numbers.
                  </div>
                </div>
              )}
              {ex.error && (
                <div className="alert alert-danger" style={{ fontSize: 12.5 }}>
                  <span>{ex.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && <div className="skeleton" style={{ height: 60, marginBottom: 14, borderRadius: 10 }} aria-label="Asking the zoning assistant" />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="text"
          className="text-input"
          placeholder="e.g. what side setback should I expect for a 2-car garage?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading || question.trim().length < 4}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>
      </div>
    </div>
  );
}
