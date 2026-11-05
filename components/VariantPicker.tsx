"use client";

import { FloorPlanSvg } from "./FloorPlanSvg";
import type { FloorPlanOption } from "@/lib/layout/generate";

interface VariantPickerProps {
  options: FloorPlanOption[];
  onSelect: (option: FloorPlanOption) => void;
}

/**
 * Side-by-side comparison of real, independently-computed layout variants —
 * Maket's "multiple layout variations within minutes" step. Each card is a
 * genuinely different plan (different footprint aspect ratio cascades into
 * different room shapes/adjacency), not one plan re-skinned three times.
 */
export function VariantPicker({ options, onSelect }: VariantPickerProps) {
  return (
    <div>
      <h2 className="section-heading" style={{ marginTop: 0 }}>
        Choose a layout
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)", marginBottom: 18, marginTop: -8 }}>
        Three real variants of the same program, generated instantly — pick one to open in the editor.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {options.map((option) => (
          <button
            key={option.variant.id}
            type="button"
            onClick={() => onSelect(option)}
            className="card"
            style={{
              padding: 14,
              textAlign: "left",
              cursor: "pointer",
              border: "1.5px solid var(--color-border)",
              transition: "border-color 0.15s ease, transform 0.08s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-brand)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          >
            {option.floors ? (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${option.floors.length}, 1fr)`, gap: 6 }}>
                {option.floors.map((floor, i) => (
                  <div key={i}>
                    <FloorPlanSvg plan={floor} />
                    <div style={{ fontSize: 11, color: "var(--color-ink-faint)", textAlign: "center", marginTop: 2 }}>
                      {i === 0 ? "Ground" : "Upper"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <FloorPlanSvg plan={option.plan} />
            )}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14 }}>{option.variant.label}</strong>
                <span style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>
                  {option.plan.footprint.w}&apos; × {option.plan.footprint.h}&apos;
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 4 }}>{option.variant.description}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 12, color: "var(--color-ink-faint)" }}>
                {option.floors ? (
                  <>
                    <span>{option.floors.length} floors</span>
                    <span>{option.floors.reduce((n, f) => n + f.rooms.length, 0)} rooms</span>
                    <span>{Math.round(option.floors.reduce((n, f) => n + f.totalAreaSqft, 0))} sqft</span>
                  </>
                ) : (
                  <>
                    <span>{option.plan.rooms.length} rooms</span>
                    <span>{option.plan.totalAreaSqft} sqft</span>
                  </>
                )}
              </div>
              {(() => {
                // Surface the real reason, not a bare count — a user picking between
                // three thumbnails has no other way to know one layout is structurally
                // compromised (sliver bedroom, blocked door) before opening it in the
                // Studio. Hiding this behind "2 warning(s)" is the exact kind of silent
                // defect that makes a generator feel untrustworthy.
                const allWarnings = (option.floors ?? [option.plan]).flatMap((f) => f.warnings);
                if (allWarnings.length === 0) return null;
                return (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      background: "var(--color-warning-bg)",
                      border: "1px solid var(--color-warning-border)",
                      borderRadius: 8,
                      color: "var(--color-warning-text)",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 2 }}>
                      Needs adjustment ({allWarnings.length} issue{allWarnings.length > 1 ? "s" : ""})
                    </strong>
                    {allWarnings[0]}
                    {allWarnings.length > 1 ? ` (+${allWarnings.length - 1} more — open to see all)` : ""}
                  </div>
                );
              })()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
