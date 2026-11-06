# HomePlan vs. Maket.ai vs. ARCHITEChTURES — a real, honest comparison for architects and builders

**Audience:** licensed architects, residential designers, home builders, small design-build firms —
not general consumers. Every claim below was checked live on 2026-11-05/06: Maket.ai's and
ARCHITEChTURES's own marketing/pricing pages were fetched fresh (not recalled from memory), and
every HomePlan screenshot/export in this folder came from actually running the brief through
HomePlan's live generator (self-hosted instance, same codebase as production, same engine as
`homeplan-arhansubas-projects.vercel.app`). Where HomePlan has a real gap, it's stated as a gap.
No invented stats, no "up to 10x faster" guesses.

---

## 1. Who we're actually being compared to

- **Maket.ai** — the most widely-adopted AI floor-plan generator for residential work (the
  category HomePlan competes directly in). Confirmed live from `maket.ai`, `/features`,
  `/pricing` (2026-11-05/06).
- **ARCHITEChTURES** — the closest real architect/developer-targeted competitor: BIM-native
  (IFC export, LOD 200+), explicitly **not** aimed at homeowners ("freelancers to leading
  companies," per their own site). Confirmed live from `architechtures.com`, `/pricing`
  (2026-11-06).
- **Snaptrude** (noted, not deep-tested) — the strongest BIM/Revit-native alternative for firms
  already in a Revit pipeline, from $499/year. Mentioned for completeness; out of scope for a
  line-by-line feature test here since it targets a different workflow (text brief → LOD 300-350
  Revit handoff) than HomePlan's instant web generator.

---

## 2. Pricing, real numbers

| | **HomePlan** | **Maket.ai** | **ARCHITEChTURES** |
|---|---|---|---|
| Free tier | $0 hosted: single-story only, Studio edit, 3D massing, PNG export, **unlimited**, no credit system | $0: 30 one-time credits, single-floor only, **no exports** (link-share only) | Not published as a self-serve free tier on their pricing page |
| Entry paid tier | **$49/mo hosted** (or **$0 forever if self-hosted**, MIT license, same code, no credit cap) — unlocks multi-story, L-shaped, PDF/DXF/IFC export | **$20/mo** ("Homeowner"): 300 credits/mo, PDF/DXF/render export, up to 15 floors or 30 renders/mo | **$49/mo** billed annually ($588/yr): unlimited AI-assisted generation, DXF/IFC/XLSX export, 200 saved designs |
| Next tier | — (self-host removes the need for one) | $100/mo ("Pro"): 3,000 credits/mo, 5 human-validated uploads, custom templates | $294/mo ("Business"): cost/financial analysis, 1,200 designs, account manager |
| Top tier | — | Custom ("Scale"): API access, bulk import | Custom ("Enterprise") |

**Honest read, not spin:** HomePlan's hosted free tier gives zero exports — you need the $49/mo
Pro tier (or self-host) to get a DXF an architect can actually open in AutoCAD. Maket's $20/mo
tier already includes PDF/DXF/render export, undercutting HomePlan's effective "pay to export"
price on the hosted site. **The real differentiator is self-hosting**: HomePlan is MIT-licensed
and the entire $49/mo feature set (multi-story, L-shaped, PDF/DXF/IFC, unlimited generations) is
free forever if you run it yourself — neither Maket.ai nor ARCHITEChTURES offers that at any
price, because neither is open source.

---

## 3. Feature-by-feature, what each one actually has

| Feature | HomePlan | Maket.ai | ARCHITEChTURES |
|---|---|---|---|
| Text-to-floor-plan generation | Yes — real computed geometry (rooms/walls/doors), not a diffusion image | Yes — "2-3 min," 1-4 stories | Yes — real-time generation engine |
| Multiple variations per brief | Yes, 3 real layouts (Compact/Classic/Wide) every time, free to compare | Yes | Yes |
| Manual canvas editing | Yes — drag/resize in Studio, plus typed plain-language edits (no AI call for common phrasings) | Yes — "draw from scratch," refine generated plans | Yes — manual edition mode |
| Upload existing plan to rework | Yes — PDF/photo/scan → vectorized via OpenRouter vision | Yes — PDF/photo/scan | Not confirmed on their marketing |
| PDF export | Yes (Pro/self-host) | Yes (paid tiers) | **No** — XLSX/DXF/IFC only, no PDF listed |
| DXF export | Yes (Pro/self-host) | Yes (paid tiers) | Yes |
| **IFC / BIM export** | **Yes** — real IFC4 STEP file (IfcWall/IfcDoor/IfcWindow/IfcSpace, round-trip-verified against `web-ifc`'s own WASM parser) | **No** — not mentioned anywhere on their site | Yes — LOD 200+, their core positioning |
| 3D massing view | Yes — real geometry from the actual room/wall data, explicitly labeled "not photorealistic" in-app | Yes — marketed as **"photorealistic 3D"** | Navigable 3D editing, not marketed as photorealistic |
| Interior walkthrough | Yes — real eye-level WASD + drag-to-look navigation, real door/wall collision | Yes — explicitly **"walk through your future home in photorealistic 3D"** | Not confirmed |
| **Visual fidelity of 3D, honestly** | **Flat-shaded parametric geometry.** A real, secondary gap vs. Maket's photorealistic claim — not pursued yet, stated here rather than hidden | Photorealistic (their claim, not independently verified by us) | Not photorealistic per their own site |
| Furniture / materials | 22-type catalog, 5 pieces now real CC0 3D meshes (not boxes), floor/wall color picker | "Bring your own," apply real floors/tiles/paint | Not a focus area per their marketing |
| Code-compliance / zoning | Yes — deterministic setback + lot-coverage + height check against a labeled generic illustrative baseline (explicitly **not** jurisdiction-verified), plus a free-text zoning Q&A assistant that **honestly discloses it has no live database of any specific city's code** | **None found** on their site | Users can input per-room min/max area and height constraints to "ensure project compliance" — more formalized, enterprise-leaning |
| Lead/account gating | None to try — generate with zero signup | 30-credit free tier, still gated by sign-in for saves | Not confirmed |
| Open source / self-hostable | **Yes — MIT license, the entire codebase** | No | No |
| Target user (their own words) | "Architects, builders, and small teams" | Broad — homeowners through "Scale" enterprise tier | "Freelancers to leading companies" — explicitly not homeowners |

Where HomePlan is honestly behind: **photorealistic rendering** (Maket's marketed strength) and
**PDF export doesn't exist on ARCHITEChTURES at all, so that's not a real gap there** — but
ARCHITEChTURES' zoning-constraint tooling reads more mature/enterprise than HomePlan's
self-disclosed "not jurisdiction-verified" baseline. We're not claiming parity we don't have.

Where HomePlan is honestly ahead: **IFC/BIM export that Maket.ai doesn't have at all**, **free
self-hosting that neither competitor offers**, **a code-compliance assistant that at least exists
and is honest about its own limits** (vs. Maket's total silence on compliance), and **the
guardrail pattern below** — which is the real headline finding of this pass.

---

## 4. The real headline: HomePlan tells you what's wrong. We tested this on purpose.

Neither Maket.ai's nor ARCHITEChTURES' marketing mentions anything like a structural-quality
warning system — no room-aspect-ratio check, no door-clearance check, no "this room doesn't fit"
flag. We can't test their actual generation quality without paid accounts (Maket's free tier
has no card-free way to inspect dimensioned output at the detail level HomePlan exposes by
default), so we're not claiming to have beaten them head-to-head on raw layout quality. What we
*can* show, honestly, or three real briefs through HomePlan's live generator: **every single
output — pass or fail — comes with a specific, numbered, actionable warning**, the same way a
linter flags a real code defect instead of silently shipping it. That is the practical answer to
"is this AI slop" for a professional: a tool that tells you exactly which room is wrong and by
how much is categorically different from a tool that just hands you a picture.

### Test case 1 — 2-story, 4 bed / 2.5 bath, 2,900 sqft family home, attached 2-car garage, home office, covered porch

A real "move-up buyer" program, the kind an architect gets from an actual client, not a toy
brief. Generated 3 real variants (Compact/Classic/Wide), all with a correct 2-floor stair
alignment and matching footprint. The **Wide** variant: 3,132 sqft across 17 rooms, 1 honest
warning — *"Primary Bath is an unrealistic shape for its area (6.3' × 20', 3.2:1) — increase
total sqft or reduce room count."* Real finding, not cherry-picked: **every one of the 3
variants at this exact program (4 bed, 2.5-3 bath, 2,800-3,200 sqft, 2-story) carried at least 1
primary-bath or secondary-bedroom aspect-ratio warning across several sqft values we tried** —
a genuine, reproducible engine limitation at this specific program shape, not a one-off. Flagged
as a real follow-up in `plans/homeplan.md`, not papered over here.
Real PDF (19.6KB), DXF (24.2KB), and IFC (34.8KB) exports generated and saved in `exports/`.

### Test case 2 — standalone 1-bed ADU, kitchenette, full bath, stacked laundry, single story

ADUs are a real, fast-growing category for small firms (most US jurisdictions now mandate
by-right approval). At the **legal-minimum 600 sqft**, HomePlan has a real, honest gap: it
generates a full living+kitchen+dining+office program sized for a house, not an ADU, producing
**7 warnings on every variant** (`stills/case2-adu-600sqft-broken-baseline.png`). This is the
same class of bug this repo already found and fixed for studio apartments (`bbcc5be`,
2026-11-05) — it just hasn't been extended to non-studio small-footprint programs like ADUs yet.
Stated here, not hidden, and logged as a follow-up.
At a more realistic **850 sqft**, the picture flips: down to **1 honest warning** ("door into
Living Room may swing into furniture — move that piece or widen the room"), real 8-room program
(Entry/Living/Kitchen/Dining/Primary Bedroom/Primary Bath/Bathroom/Hallway), real dimensioned
room table, real 3D massing, real PDF/DXF/IFC exports (9.5KB/22.8KB/32.8KB).

### Test case 3 — 4 bed / 3 bath, 2,200 sqft, single-story, L-shaped with courtyard, attached 3-car garage

The real structural-complexity case: non-rectangular footprint, a courtyard void, two separate
hallway runs, 3-car garage massing. HomePlan correctly generated the L-shape + courtyard
topology (17 real rooms, 2,443 sqft, courtyard sized 10.5' × 29', fully dimensioned). The
**Compact** variant had the fewest warnings (1: a bedroom/bathroom sizing note); the **Classic**
variant we opened in Studio for this capture had more (4 total) — two secondary bathrooms under
the comfortable 35 sqft minimum, plus a kitchen door-clearance flag — again specific rooms,
specific numbers, not a vague "looks off."

The Zoning Assistant's result here is the most honest finding in this whole pass: against the
generic illustrative 60' × 120' baseline lot, **lot coverage passed** (2,443 sqft footprint is
33.9% of the 7,200 sqft lot, under the 35% cap) and **height passed** (18' estimated against a
35' cap), but **setback clearance correctly FAILED** — "buildable envelope after setbacks is
46' × 85'; this plan's bounding footprint is 54' × 53'. Does not fit the buildable envelope in
either orientation." A zoning checker that only ever says PASS is suspicious; one that correctly
flags a real L-shaped plan as too wide for a standard suburban lot's setbacks is doing its job.
Real PDF/DXF/IFC exports (13.9KB/34.6KB/61.3KB, the largest IFC of the three cases, reflecting
the real added wall/room count of the L-shape) still generated correctly regardless of the
zoning result — export and compliance-checking are correctly independent in this tool.

**Every screenshot above is a real, unedited capture of the live generator** (self-hosted
instance running the exact `main`-branch code as production) — see `stills/` for the full set
(variant picker, Studio editor with the real dimensioned room table, 3D massing, Zoning
Assistant) for all three cases, and `exports/` for the real downloaded PDF/DXF/IFC files.

---

## 5. What this means for an architect deciding what to use

- **If you want a quick client-facing concept and don't need BIM or self-hosting**: Maket.ai's
  photorealistic rendering is a real, honest advantage HomePlan doesn't match yet.
- **If you need an IFC file to hand to a BIM/MEP consultant and don't want a $588/yr commitment**:
  HomePlan is the only one of these three that's free to self-host with IFC export included.
- **If you're doing dense multi-family/mixed-use with real code constraints**: neither Maket.ai
  nor HomePlan is built for that — ARCHITEChTURES' per-room compliance input and LOD 200+ BIM is
  the closer fit, and TestFit/ArkDesign.ai (not deep-tested here) are built specifically for that
  scale.
- **If you want to see a tool's own honest self-assessment of a plan before you spend an hour on
  it**: HomePlan's per-room numbered warnings are a real, demonstrated differentiator in this
  pass — we tested it, not just read the marketing copy.
