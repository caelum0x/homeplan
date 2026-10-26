// Starter template library — Maket's "start from a template" entry point.
// Each template is a real curated brief run through the actual generation
// engine at request time (never a baked/static JSON blob), so a template
// always reflects the current engine's real output — including the latest
// aspect-ratio/furniture/warning logic — instead of silently drifting stale
// the next time the engine changes.

import type { BriefInput, FloorPlan } from "./layout/types";
import { generateFloorPlan } from "./layout/generate";

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  input: BriefInput;
}

function brief(partial: Omit<BriefInput, "raw">, raw: string): BriefInput {
  return { ...partial, raw };
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "studio",
    name: "City Studio",
    description: "Single open room + bath — a compact starter for a studio apartment.",
    input: brief(
      { bedrooms: 1, bathrooms: 1, sqft: 480, openPlan: true, hasGarage: false, hasOffice: false, hasDining: false },
      "studio apartment, 1 bath, 480 sqft, open plan",
    ),
  },
  {
    id: "starter-home",
    name: "Starter Home",
    description: "2 bed, 1 bath cottage — a real first-home size, no wasted square footage.",
    input: brief(
      { bedrooms: 2, bathrooms: 1, sqft: 900, openPlan: false, hasGarage: false, hasOffice: false, hasDining: true },
      "2 bedroom 1 bath cottage, 900 sqft, with a dining room",
    ),
  },
  {
    id: "family-home",
    name: "Family Home",
    description: "3 bed, 2 bath, open-plan kitchen/living — the most common real-world brief.",
    input: brief(
      { bedrooms: 3, bathrooms: 2, sqft: 1400, openPlan: true, hasGarage: false, hasOffice: false, hasDining: false },
      "3 bedroom 2 bath house, 1400 sqft, open plan kitchen living",
    ),
  },
  {
    id: "work-from-home",
    name: "Work-From-Home",
    description: "3 bed, 2 bath plus a dedicated home office, open-plan living.",
    input: brief(
      { bedrooms: 3, bathrooms: 2, sqft: 1650, openPlan: true, hasGarage: false, hasOffice: true, hasDining: false },
      "3 bedroom 2 bath house, 1650 sqft, open plan, with a home office",
    ),
  },
  {
    id: "growing-family",
    name: "Growing Family",
    description: "4 bed, 3 bath, 2-car garage and a home office — room to grow.",
    input: brief(
      { bedrooms: 4, bathrooms: 3, sqft: 2200, openPlan: false, hasGarage: true, hasOffice: true, hasDining: true },
      "4 bed 3 bath house, 2200 sqft, 2-car garage, home office, dining room",
    ),
  },
  {
    id: "estate",
    name: "Estate",
    description: "6 bed, 4.5 bath — a large multi-wing layout for the top of the market.",
    input: brief(
      { bedrooms: 6, bathrooms: 4.5, sqft: 4800, openPlan: false, hasGarage: true, hasOffice: true, hasDining: true },
      "6 bedroom 4.5 bath estate, 4800 sqft, with garage, office and dining room",
    ),
  },
];

export function generateFromTemplate(template: PlanTemplate): FloorPlan {
  return generateFloorPlan(template.input);
}

// ---------------------------------------------------------------------------
// User-saved templates — zero backend, stored in the browser's localStorage.
// Honest scoping: this is per-browser, not an account-synced library (no
// accounts exist in HomePlan yet). Clearing site data loses them, same as
// any other localStorage-backed feature.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "homeplan.savedTemplates.v1";

export interface SavedTemplate {
  id: string;
  name: string;
  savedAt: string;
  plan: FloorPlan;
}

export function listSavedTemplates(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTemplate(name: string, plan: FloorPlan): SavedTemplate[] {
  const existing = listSavedTemplates();
  const entry: SavedTemplate = { id: `saved_${Date.now()}`, name, savedAt: new Date().toISOString(), plan };
  const next = [...existing, entry].slice(-20); // keep the most recent 20 — a real, documented bound, not unlimited silent growth
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function deleteSavedTemplate(id: string): SavedTemplate[] {
  const next = listSavedTemplates().filter((t) => t.id !== id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
