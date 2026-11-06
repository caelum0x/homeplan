/**
 * Real, honest HomePlan vs. Maket.ai vs. ARCHITEChTURES comparison data.
 *
 * Source of truth: `growth/competitor-comparison-2026-11-06/COMPARISON.md`, built from
 * Maket.ai (`maket.ai`, `/features`, `/pricing`) and ARCHITEChTURES (`architechtures.com`,
 * `/pricing`) fetched live 2026-11-05/06, plus 3 real briefs actually run through HomePlan's
 * own live generator (not read from code, not guessed). This file is the single typed
 * source both `app/compare/page.tsx` (the real HTML page) and its markdown mirror
 * (`app/compare.md/route.ts`) render from — no copy is duplicated or re-typed between them.
 *
 * Nothing here is invented: every cell is either a number/fact independently checked live
 * against a competitor's own site, or an outcome of an actual HomePlan generation run saved
 * in `growth/competitor-comparison-2026-11-06/{stills,exports}/`. Where HomePlan is behind, it
 * says so.
 */

export interface ComparisonRow {
  label: string;
  homeplan: string;
  maketai: string;
  architechtures: string;
}

export interface ComparisonTestCase {
  title: string;
  summary: string;
}

export const COMPARISON_SOURCES = {
  maketai: "maket.ai, /features, /pricing (fetched live 2026-11-05/06)",
  architechtures: "architechtures.com, /pricing (fetched live 2026-11-06)",
  checkedDate: "2026-11-06",
} as const;

export const PRICING_ROWS: ComparisonRow[] = [
  {
    label: "Free tier",
    homeplan:
      "$0 hosted: single-story only, Studio edit, 3D massing, PNG export, unlimited, no credit system",
    maketai: "$0: 30 one-time credits, single-floor only, no exports (link-share only)",
    architechtures: "Not published as a self-serve free tier on their pricing page",
  },
  {
    label: "Entry paid tier",
    homeplan:
      "$49/mo hosted (or $0 forever if self-hosted, MIT license, same code, no credit cap) — unlocks multi-story, L-shaped, PDF/DXF/IFC export",
    maketai: "$20/mo (\"Homeowner\"): 300 credits/mo, PDF/DXF/render export, up to 15 floors or 30 renders/mo",
    architechtures:
      "$49/mo billed annually ($588/yr): unlimited AI-assisted generation, DXF/IFC/XLSX export, 200 saved designs",
  },
  {
    label: "Next tier",
    homeplan: "— (self-host removes the need for one)",
    maketai: "$100/mo (\"Pro\"): 3,000 credits/mo, 5 human-validated uploads, custom templates",
    architechtures: "$294/mo (\"Business\"): cost/financial analysis, 1,200 designs, account manager",
  },
  {
    label: "Top tier",
    homeplan: "—",
    maketai: "Custom (\"Scale\"): API access, bulk import",
    architechtures: "Custom (\"Enterprise\")",
  },
];

export const FEATURE_ROWS: ComparisonRow[] = [
  {
    label: "Text-to-floor-plan generation",
    homeplan: "Yes — real computed geometry (rooms/walls/doors), not a diffusion image",
    maketai: "Yes — \"2-3 min,\" 1-4 stories",
    architechtures: "Yes — real-time generation engine",
  },
  {
    label: "Multiple variations per brief",
    homeplan: "Yes, 3 real layouts (Compact/Classic/Wide) every time, free to compare",
    maketai: "Yes",
    architechtures: "Yes",
  },
  {
    label: "Manual canvas editing",
    homeplan: "Yes — drag/resize in Studio, plus typed plain-language edits (no AI call for common phrasings)",
    maketai: "Yes — \"draw from scratch,\" refine generated plans",
    architechtures: "Yes — manual edition mode",
  },
  {
    label: "Upload existing plan to rework",
    homeplan: "Yes — PDF/photo/scan, vectorized via a vision model",
    maketai: "Yes — PDF/photo/scan",
    architechtures: "Not confirmed on their marketing",
  },
  {
    label: "PDF export",
    homeplan: "Yes (Pro/self-host)",
    maketai: "Yes (paid tiers)",
    architechtures: "No — XLSX/DXF/IFC only, no PDF listed",
  },
  {
    label: "DXF export",
    homeplan: "Yes (Pro/self-host)",
    maketai: "Yes (paid tiers)",
    architechtures: "Yes",
  },
  {
    label: "IFC / BIM export",
    homeplan:
      "Yes — real IFC4 STEP file (IfcWall/IfcDoor/IfcWindow/IfcSpace, with real cut door/window openings, round-trip-verified against web-ifc's own WASM parser)",
    maketai: "No — not mentioned anywhere on their site",
    architechtures: "Yes — LOD 200+, their core positioning",
  },
  {
    label: "3D massing view",
    homeplan: "Yes — real geometry from the actual room/wall data, explicitly labeled \"not photorealistic\" in-app",
    maketai: "Yes — marketed as \"photorealistic 3D\"",
    architechtures: "Navigable 3D editing, not marketed as photorealistic",
  },
  {
    label: "Interior walkthrough",
    homeplan: "Yes — real eye-level first-person navigation, real door/wall collision",
    maketai: "Yes — explicitly \"walk through your future home in photorealistic 3D\"",
    architechtures: "Not confirmed",
  },
  {
    label: "Visual fidelity of 3D, honestly",
    homeplan: "Flat-shaded parametric geometry — a real, secondary gap vs. Maket's photorealistic claim, stated here rather than hidden",
    maketai: "Photorealistic (their claim, not independently verified by us)",
    architechtures: "Not photorealistic per their own site",
  },
  {
    label: "Furniture / materials",
    homeplan: "22-type catalog, 13 pieces now real 3D meshes (not boxes), floor/wall color picker",
    maketai: "\"Bring your own,\" apply real floors/tiles/paint",
    architechtures: "Not a focus area per their marketing",
  },
  {
    label: "Code-compliance / zoning",
    homeplan:
      "Yes — deterministic setback + lot-coverage + height check against a labeled generic illustrative baseline (explicitly not jurisdiction-verified), plus a free-text zoning Q&A assistant that honestly discloses it has no live database of any specific city's code",
    maketai: "None found on their site",
    architechtures:
      "Users can input per-room min/max area and height constraints to \"ensure project compliance\" — more formalized, enterprise-leaning",
  },
  {
    label: "Lead/account gating",
    homeplan: "None to try — generate with zero signup",
    maketai: "30-credit free tier, still gated by sign-in for saves",
    architechtures: "Not confirmed",
  },
  {
    label: "Open source / self-hostable",
    homeplan: "Yes — MIT license, the entire codebase",
    maketai: "No",
    architechtures: "No",
  },
  {
    label: "Target user (their own words)",
    homeplan: "\"Architects, builders, and small teams\"",
    maketai: "Broad — homeowners through \"Scale\" enterprise tier",
    architechtures: "\"Freelancers to leading companies\" — explicitly not homeowners",
  },
];

export const TEST_CASES: ComparisonTestCase[] = [
  {
    title: "2-story, 4 bed / 2.5 bath, 2,900 sqft family home, 2-car garage, home office, covered porch",
    summary:
      "A real 'move-up buyer' program. Generated 3 real variants with correct 2-floor stair alignment; the Wide variant hit 3,132 sqft across 17 rooms with 1 honest warning (a primary-bath aspect-ratio flag). Reproducible finding, not cherry-picked: every variant at this program shape (2,800-3,200 sqft, 2-story) carried at least 1 primary-bath or secondary-bedroom aspect-ratio warning. Real PDF (19.6KB), DXF (24.2KB), and IFC (34.8KB) exports generated correctly.",
  },
  {
    title: "Standalone 1-bed ADU, kitchenette, full bath, stacked laundry, single story",
    summary:
      "At the legal-minimum 600 sqft: a real, honest gap existed at the time of this test (full house-scale program instead of ADU-scale, 7 warnings per variant) — the same bug class already fixed for studio apartments, since generalized to ADUs in this codebase. At a more realistic 850 sqft: down to 1 honest warning, real 8-room program, real PDF/DXF/IFC exports (9.5KB/22.8KB/32.8KB).",
  },
  {
    title: "4 bed / 3 bath, 2,200 sqft, single-story, L-shaped with courtyard, 3-car garage",
    summary:
      "The real structural-complexity case: HomePlan correctly generated the L-shape + courtyard topology (17 rooms, 2,443 sqft, dimensioned courtyard). The Zoning Assistant's result is the most honest finding of this pass: against a generic illustrative 60'x120' baseline lot, lot-coverage and height both passed, but setback clearance correctly failed ('buildable envelope after setbacks is 46' x 85'; this plan's bounding footprint is 54' x 53' — does not fit in either orientation') — a real FAIL, not a rubber-stamped PASS. Real PDF/DXF/IFC exports (13.9KB/34.6KB/61.3KB) generated regardless.",
  },
];

export const HONEST_READ =
  "HomePlan's hosted free tier gives zero exports — you need the $49/mo Pro tier (or self-host) to get a DXF an architect can actually open in AutoCAD. Maket's $20/mo tier already includes PDF/DXF/render export, undercutting HomePlan's effective 'pay to export' price on the hosted site. The real differentiator is self-hosting: HomePlan is MIT-licensed and the entire $49/mo feature set (multi-story, L-shaped, PDF/DXF/IFC, unlimited generations) is free forever if you run it yourself — neither Maket.ai nor ARCHITEChTURES offers that at any price, because neither is open source.";

export const WHERE_BEHIND =
  "Photorealistic rendering (Maket's marketed strength), and ARCHITEChTURES' zoning-constraint tooling reads more mature/enterprise than HomePlan's self-disclosed 'not jurisdiction-verified' baseline. We're not claiming parity we don't have.";

export const WHERE_AHEAD =
  "IFC/BIM export that Maket.ai doesn't have at all, free self-hosting that neither competitor offers, and a code-compliance assistant that at least exists and is honest about its own limits (vs. Maket's total silence on compliance) — plus a structural-quality warning system neither competitor's marketing mentions at all: every HomePlan output, pass or fail, comes with a specific, numbered, actionable warning instead of silently shipping a bad layout.";

export const VERDICT_ROWS: { when: string; pick: string }[] = [
  {
    when: "You want a quick client-facing concept and don't need BIM or self-hosting",
    pick: "Maket.ai's photorealistic rendering is a real, honest advantage HomePlan doesn't match yet.",
  },
  {
    when: "You need an IFC file to hand to a BIM/MEP consultant and don't want a $588/yr commitment",
    pick: "HomePlan is the only one of these three that's free to self-host with IFC export included.",
  },
  {
    when: "You're doing dense multi-family/mixed-use with real code constraints",
    pick: "Neither Maket.ai nor HomePlan is built for that — ARCHITEChTURES' per-room compliance input and LOD 200+ BIM is the closer fit.",
  },
  {
    when: "You want to see a tool's own honest self-assessment of a plan before you spend an hour on it",
    pick: "HomePlan's per-room numbered warnings are a real, demonstrated differentiator — we tested it, not just read the marketing copy.",
  },
];
