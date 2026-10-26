"use client";

import { useState } from "react";
import type { FloorPlan } from "@/lib/layout/types";
import { RENDER_STYLES, buildRenderPrompt, buildPollinationsRequest, fetchPollinationsImage, type RenderStyleId } from "@/lib/aiRender";

interface AiRenderPanelProps {
  plan: FloorPlan;
}

/**
 * Real AI photorealistic rendering, built on the genuinely free (no API
 * key) Pollinations.ai image service — see lib/aiRender.ts for the full
 * reasoning. Free tier: 1 render per 45 seconds, small watermark — both
 * disclosed here rather than hidden, instead of faking an unlimited paid
 * experience the product doesn't actually have.
 */
export function AiRenderPanel({ plan }: AiRenderPanelProps) {
  const [style, setStyle] = useState<RenderStyleId>("modern");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const cooldownRemaining = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  async function handleGenerate() {
    setStatus("loading");
    setErrorMessage(null);
    const prompt = buildRenderPrompt(plan, style);
    const request = buildPollinationsRequest(prompt, Math.floor(Math.random() * 1_000_000));
    const result = await fetchPollinationsImage(request);

    if ("error" in result) {
      setStatus("error");
      setErrorMessage(result.error.message);
      if (result.error.code === "FREE_LIMIT") {
        const retrySeconds = result.error.retryAfterSeconds ?? 45;
        setCooldownUntil(Date.now() + retrySeconds * 1000);
      }
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(result.blob));
    setStatus("ready");
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `homeplan-ai-render-${style}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>AI photorealistic render</h3>
      <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 14 }}>
        Free, no account — powered by Pollinations.ai&apos;s public image model, prompted from this plan&apos;s real room list. Free tier: one
        render every 45 seconds, small watermark. Not a render of the exact 3D geometry above — a styled interpretation of the brief.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {RENDER_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={`segmented-btn ${style === s.id ? "active" : ""}`}
            style={{ border: "1px solid var(--color-border)" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={handleGenerate} disabled={status === "loading" || cooldownRemaining > 0} className="btn btn-primary">
        {status === "loading" ? "Rendering…" : cooldownRemaining > 0 ? `Try again in ${cooldownRemaining}s` : imageUrl ? "Generate another" : "Generate render"}
      </button>

      {status === "error" && errorMessage && (
        <div className="alert alert-warning" style={{ marginTop: 14 }}>
          <span>{errorMessage}</span>
        </div>
      )}

      {status === "loading" && <div className="skeleton" style={{ height: 320, marginTop: 16, borderRadius: 12 }} aria-label="Rendering" />}

      {imageUrl && status !== "loading" && (
        <div style={{ marginTop: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`AI-rendered ${style} interior based on this floor plan`} style={{ width: "100%", borderRadius: 12, border: "1px solid var(--color-border)" }} />
          <button type="button" onClick={handleDownload} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
            Download render
          </button>
        </div>
      )}
    </div>
  );
}
