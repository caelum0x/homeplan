# Planforge

An open-source, self-hostable alternative to [Maket.ai](https://www.maket.ai/) — describe a
home in plain language and get a real, computed floor plan with room-by-room dimensions.

```
3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living
```

→ a footprint, a room program (entry / great room / bedrooms / bathrooms / hallway), real
rectangle coordinates for every room, walls, and doors — rendered as SVG. See `examples/*.svg`
for real generated output (not mockups).

## Why

Maket.ai does the same basic job (text → floor plan) but is closed-source, credit-metered
(reviewers report burning a month's credits on one plan), and has well-documented spatial
reasoning problems (a front door opening into the primary bedroom, in one reviewer's words).
Planforge is MIT-licensed, has no credit meter, and makes every layout decision explicit and
inspectable in code — see `lib/layout/` for the actual rules (e.g. ensuite bathrooms are always
paired with their bedroom and never routed through the hallway; a half bath only ever lands
in the public zone, never next to a bedroom).

## How it works

No GAN, no diffusion model, no LLM call on the generation path — a deterministic
rectangular-subdivision ("slicing floor plan") algorithm:

1. **`lib/parseDescription.ts`** — regex-based extraction of bedroom/bathroom count, target
   square footage, open-plan/garage/office flags from the free-text description.
2. **`lib/layout/program.ts`** — turns that into a room program: which rooms exist, their
   ideal/minimum area, and bedroom↔bathroom pairing (ensuite vs. shared).
3. **`lib/layout/generate.ts`** — the actual layout engine: computes a footprint from the
   target square footage, splits it into a public zone (entry/living/kitchen/dining/office,
   sliced side-by-side across the front) and a private zone (bedrooms/bathrooms, in one or two
   rows around a central hallway), then derives walls and doors from the real geometry of the
   placed rooms — never a hand-drawn template.
4. **`lib/layout/geometry.ts`** — the one reusable primitive everything is built on: constrained
   proportional 1D allocation (split a length across items by ideal share, respecting minimums),
   plus shared-edge detection between two rectangles (used for both wall and door placement).
5. **`lib/renderSvg.ts`** / **`components/FloorPlanSvg.tsx`** — render the computed rooms/walls/
   doors as SVG (string version for scripts/exports, React version for the web UI).

Every number in the output is computed from the input — nothing is a canned image or a lookup
table keyed by bedroom count.

### Fast-follow (not in this MVP)

- LLM-assisted parsing for descriptions that don't match the regex patterns (today: deterministic
  regex only, by design — free, instant, nothing to hallucinate).
- Photorealistic 3D rendering (Maket's headline feature). Skipped for v1 — SVG floor plans are an
  honestly-scoped first version; a Three.js extrusion pass from the same room rectangles is a
  natural next step and doesn't require touching the layout engine.
- L-shaped / non-rectangular lots, multi-story coordination, chat-based editing of an existing
  plan, PDF export.
- Real building-code minimums per jurisdiction (current minimums are reasonable defaults, not
  code citations).

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
```

Verify the generation engine directly (prints real room coordinates for 3 example briefs):

```bash
npm run verify
```

Render example SVGs to `examples/`:

```bash
npm run render-examples
```

## API

`POST /api/generate` with `{ "description": "..." }` returns `{ input, plan }` — `input` is the
parsed brief, `plan` is the full computed layout (`footprint`, `rooms[]`, `walls[]`, `doors[]`,
`warnings[]`). `warnings` is populated honestly when a brief is too tight for its square footage
(e.g. 3 bedrooms in 450 sqft) instead of silently shrinking rooms below realistic minimums.

## License

MIT.
