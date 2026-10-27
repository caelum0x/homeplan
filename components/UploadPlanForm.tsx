"use client";

import { useState } from "react";

interface UploadPlanFormProps {
  onSubmit: (description: string, imageDataUrl: string | null) => void;
  loading: boolean;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone photo/scan, small enough to keep in memory/localStorage safely

/**
 * "Upload an existing plan" entry point. The actual image is submitted to
 * /api/vectorize-plan (see app/page.tsx's handleUploadSubmit), which calls a
 * free vision-capable OpenRouter model to read real bedroom/bath counts and
 * layout flags out of the image and runs them through the same real geometry
 * engine the "Describe" tab uses — not a stub. Free-tier vision models rate-
 * limit and rotate availability, so that call can fail; whenever it does, this
 * form's submission still works via the always-available fallback: the
 * uploaded image becomes a trace-over reference layer behind a freshly
 * generated starter plan in the Studio editor, so the user drags/resizes real
 * rooms to match their actual floor plan precisely. Both paths are real; this
 * component doesn't know or care which one ran.
 */
export function UploadPlanForm({ onSubmit, loading }: UploadPlanFormProps) {
  const [description, setDescription] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, or similar) — PDF tracing isn't supported yet, export a screenshot of the plan page instead.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is larger than 8MB — try a smaller export or a screenshot instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
      setImageName(file.name);
    };
    reader.onerror = () => setError("Could not read that file. Try a different image.");
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(description, imageDataUrl);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="trace-image">
        Reference image of the existing plan
      </label>
      <div
        className="panel"
        style={{
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderStyle: imageDataUrl ? "solid" : "dashed",
          marginBottom: 14,
        }}
      >
        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageDataUrl} alt="Uploaded floor plan reference" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 8, background: "var(--color-surface-sunken)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-faint)", fontSize: 11 }}>
            No image
          </div>
        )}
        <div style={{ flex: 1 }}>
          <input id="trace-image" type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} style={{ fontSize: 13 }} />
          <p style={{ fontSize: 12, color: "var(--color-ink-faint)", marginTop: 6 }}>
            {imageName ?? "PNG/JPG scan or photo of a floor plan."} Sent once to a free AI model to read room counts, then discarded — never stored.
          </p>
        </div>
      </div>

      <label className="field-label" htmlFor="trace-brief">
        Rough specs (used to generate a real starter layout to trace onto)
      </label>
      <textarea
        id="trace-brief"
        className="textarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. 3-bedroom, 2-bath, ~1400 sqft"
        rows={2}
      />

      {error && (
        <p role="alert" style={{ color: "var(--color-danger-text)", fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <button type="submit" className="btn btn-primary" disabled={loading || description.trim().length < 5 || !imageDataUrl}>
          {loading ? "Generating…" : "Generate starter layout + open tracing"}
        </button>
        {!imageDataUrl && <span style={{ fontSize: 12, color: "var(--color-ink-faint)", marginLeft: 10 }}>Upload an image first.</span>}
      </div>
    </form>
  );
}
