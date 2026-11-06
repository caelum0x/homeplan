/**
 * Markdown mirrors of HomePlan's real public pages, for AI crawlers/agents
 * (ChatGPT/Claude/Perplexity-style answer engines) that read markdown far more
 * reliably than they render client-side React. Same pattern already shipped for
 * scribase.com (see `plans/scribase.md`'s 2026-11-06 "AI-readable" entry) — one
 * markdown mirror per real page, served at `<path>.md`, never duplicating or
 * reformatting copy: text here is copied verbatim from the real page's own
 * copy (`app/page.tsx`, `components/PricingCta.tsx`) or, for the comparison
 * page, generated straight from the shared `lib/data/comparison.ts` typed data
 * that `app/compare/page.tsx` itself renders from. If either source page's real
 * copy changes, this file needs a matching edit — there is no automatic sync,
 * same honestly-documented limitation Scribase's own legal-mirror.ts flags for
 * its own hand-copied pages.
 */
import {
  FEATURE_ROWS,
  HONEST_READ,
  PRICING_ROWS,
  TEST_CASES,
  VERDICT_ROWS,
  WHERE_AHEAD,
  WHERE_BEHIND,
  COMPARISON_SOURCES,
} from "@/lib/data/comparison";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-arhansubas-projects.vercel.app";

export interface AiPage {
  /** Real route path on the live site, e.g. "/" or "/compare". */
  path: string;
  /** Markdown mirror path, e.g. "/index.md" or "/compare.md". */
  mdPath: string;
  title: string;
  description: string;
  render: () => string;
}

function table(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
  return [headerLine, dividerLine, ...bodyLines].join("\n");
}

/**
 * Real copy ported verbatim from `app/page.tsx`'s hero/feature sections and
 * `components/PricingCta.tsx`'s pricing copy — describing the hosted site's
 * default (non-Pro) view, which is what almost every real visitor sees, since
 * that is the live default state (the free/self-host framing mirrors the same
 * "proGated" branch those two files already render for an un-entitled visitor).
 */
function renderHomeMarkdown(): string {
  return `# HomePlan — open-source AI floor plan generator

Real computed rooms, walls, and doors, not an AI-generated picture. Built for architects,
builders, and small teams who need plans they can actually measure and build from. Free
exports, no credit limits, self-hostable.

Every plan is real geometry, not a picture. Rooms, walls, and doors you can measure, edit,
and export instantly.

## How it works

Describe a home in plain language (e.g. "3-bedroom, 2-bath, ~1400 sqft, open-plan
kitchen/living", or "2-story, 4 bed 3.5 bath, 2800 sqft, 2-car garage, home office") and get
3 real computed layouts (Compact / Classic / Wide) in seconds — each with a full dimensioned
room table, not just a picture.

You can also start from a gallery template or upload an existing plan (PDF/photo/scan) to
trace over or vectorize.

## Features

- **Generate** — Describe bedrooms, baths, and square footage, including multi-story and
  L-shaped footprints. Get three real layouts instantly. (On the hosted site, single-story
  rectangular layouts are free and unlimited; multi-story and L-shaped footprints are part of
  HomePlan Pro — fully free if you self-host.)
- **Edit** — Drag rooms in the Studio editor, or type a change in plain language.
- **Export** — PNG, 3D massing, and style moodboards are free and unlimited on the hosted
  site. PDF, DXF, and IFC (real BIM-ready IFC4, with real cut door/window openings) export are
  part of HomePlan Pro on the hosted site — fully free, unlimited, if you self-host.

Also included: a real interactive 3D view with an orbit camera and a first-person interior
walkthrough, a Zoning Assistant (deterministic setback/lot-coverage/height checks against a
labeled generic illustrative baseline, explicitly not jurisdiction-verified, plus a free-text
zoning Q&A that honestly discloses it has no live database of any specific city's code), and a
"Fit to Lot" tool.

## Pricing

**HomePlan Pro — $49/mo.** Single-story rectangular layouts, editing in Studio, 3D view, and
PNG export are all free and unlimited on the hosted site, and everything is free and
self-hostable (MIT license) if you run your own instance. Pro unlocks multi-story plans,
L-shaped footprints, and PDF/DXF/IFC export on the hosted site, plus priority support and
early access to new features.

## Open source

HomePlan is MIT-licensed and fully self-hostable — the entire codebase, including every Pro
feature, is free if you run it yourself: [github.com/caelum0x/homeplan](https://github.com/caelum0x/homeplan).

## Related

See the real, honest comparison against Maket.ai and ARCHITEChTURES: [${APP_URL}/compare](${APP_URL}/compare) ([markdown](${APP_URL}/compare.md)).
`;
}

/** Renders straight from `lib/data/comparison.ts` — the exact same data `app/compare/page.tsx` renders from. */
function renderCompareMarkdown(): string {
  const pricingTable = table(
    ["", "HomePlan", "Maket.ai", "ARCHITEChTURES"],
    PRICING_ROWS.map((row) => [row.label, row.homeplan, row.maketai, row.architechtures])
  );
  const featureTable = table(
    ["Feature", "HomePlan", "Maket.ai", "ARCHITEChTURES"],
    FEATURE_ROWS.map((row) => [row.label, row.homeplan, row.maketai, row.architechtures])
  );
  const testCasesMd = TEST_CASES.map((tc) => `### ${tc.title}\n\n${tc.summary}`).join("\n\n");
  const verdictMd = VERDICT_ROWS.map((v) => `- **${v.when}:** ${v.pick}`).join("\n");

  return `# HomePlan vs. Maket.ai vs. ARCHITEChTURES — a real, honest comparison

Audience: licensed architects, residential designers, home builders, small design-build firms.
Every claim below was checked live (not recalled from memory): Maket.ai's and ARCHITEChTURES's
own pricing/feature pages were fetched fresh (${COMPARISON_SOURCES.maketai}; ${COMPARISON_SOURCES.architechtures}),
and every HomePlan result came from actually running a brief through HomePlan's own live
generator. Where HomePlan has a real gap, it's stated as a gap. No invented stats.

## Pricing

${pricingTable}

**Honest read, not spin:** ${HONEST_READ}

## Feature by feature

${featureTable}

**Where HomePlan is honestly behind:** ${WHERE_BEHIND}

**Where HomePlan is honestly ahead:** ${WHERE_AHEAD}

## 3 real briefs, actually generated through HomePlan

${testCasesMd}

## What this means for an architect deciding what to use

${verdictMd}

## Related

The live HomePlan generator: [${APP_URL}](${APP_URL}) ([markdown](${APP_URL}/index.md)).
`;
}

export const AI_PAGES: AiPage[] = [
  {
    path: "/",
    mdPath: "/index.md",
    title: "HomePlan — open-source AI floor plan generator",
    description:
      "Describe a home in plain language and get a real, computed floor plan with room-by-room dimensions. Free, open source, self-hostable.",
    render: renderHomeMarkdown,
  },
  {
    path: "/compare",
    mdPath: "/compare.md",
    title: "HomePlan vs. Maket.ai vs. ARCHITEChTURES — a real, honest comparison",
    description:
      "Real pricing and feature comparison vs. Maket.ai and ARCHITEChTURES, plus 3 real test briefs actually generated through HomePlan.",
    render: renderCompareMarkdown,
  },
];
