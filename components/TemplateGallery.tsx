"use client";

import { useEffect, useState } from "react";
import { FloorPlanSvg } from "./FloorPlanSvg";
import { PLAN_TEMPLATES, generateFromTemplate, listSavedTemplates, deleteSavedTemplate, type SavedTemplate } from "@/lib/templates";
import type { FloorPlan } from "@/lib/layout/types";

interface TemplateGalleryProps {
  onSelect: (plan: FloorPlan, label: string) => void;
}

/**
 * Template library — Maket's "start from a template" entry point. Curated
 * templates are generated from real briefs through the actual engine (not a
 * static baked plan) the moment the gallery mounts; user-saved templates
 * (from "Save as template" in the editor toolbar) are listed alongside them,
 * stored in localStorage (no backend/accounts exist yet — scoped honestly).
 */
export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const [curated, setCurated] = useState<{ id: string; name: string; description: string; plan: FloorPlan }[]>([]);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);

  useEffect(() => {
    setCurated(PLAN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, plan: generateFromTemplate(t) })));
    setSaved(listSavedTemplates());
  }, []);

  function handleDeleteSaved(id: string) {
    setSaved(deleteSavedTemplate(id));
  }

  return (
    <div>
      {saved.length > 0 && (
        <>
          <h2 className="section-heading" style={{ marginTop: 0 }}>
            Your saved templates
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
            {saved
              .slice()
              .reverse()
              .map((t) => (
                <div key={t.id} className="card" style={{ padding: 14 }}>
                  <button type="button" onClick={() => onSelect(t.plan, t.name)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                    <FloorPlanSvg plan={t.plan} />
                  </button>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 13.5 }}>{t.name}</strong>
                    <button type="button" onClick={() => handleDeleteSaved(t.id)} className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }}>
                      Delete
                    </button>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--color-ink-faint)", marginTop: 2 }}>Saved {new Date(t.savedAt).toLocaleDateString()}</p>
                </div>
              ))}
          </div>
        </>
      )}

      <h2 className="section-heading" style={{ marginTop: 0 }}>
        Starter templates
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)", marginBottom: 18, marginTop: -8 }}>
        Real generated layouts, ready to customize — pick one to open it in the editor.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {curated.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.plan, t.name)}
            className="card"
            style={{ padding: 14, textAlign: "left", cursor: "pointer", border: "1.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-brand)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          >
            <FloorPlanSvg plan={t.plan} />
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14 }}>{t.name}</strong>
                <span style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>{t.plan.totalAreaSqft} sqft</span>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 4 }}>{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
