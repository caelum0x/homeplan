// Real, deterministic (no AI call) residential zoning compliance checks: lot coverage %
// and front/side/rear setback clearance. This is the missing half of HomePlan's zoning
// story — lib/zoningAssistant.ts answers free-text questions via an LLM and can only ever
// give prose, never a hard pass/fail; this module does real arithmetic/geometry against
// the plan's own real computed numbers and returns a structured, deterministic verdict.
//
// Scope, stated honestly (see plans/homeplan.md for the full history): this checks a
// RECTANGULAR lot only, using the plan's real bounding footprint (`FloorPlan.footprint`)
// against a rectangular "buildable envelope" (lot minus setbacks on all four sides). It
// does NOT handle: non-rectangular/irregular lots (use the existing arbitrary-polygon
// "Fit to lot" feature, lib/layout/lotFit.ts, for that — it already supports a single
// uniform setback on any polygon lot, just not distinct front/side/rear distances),
// accessory structures, or any jurisdiction-specific overlay/variance. Height limit
// (`checkHeightLimit`) and corner-lot double-frontage setback (`checkCornerLotSetback`)
// ARE handled below — this is the honest v2 slice: lot coverage %, front/side/rear
// setback clearance, a height-limit check, and a corner-lot setback check, all against
// a simple rectangular lot, nothing more.
//
// The default numbers below are explicitly NOT any specific city or county's real code —
// they are a commonly-cited illustrative baseline for a typical US suburban single-family
// ("R-1"-style) zone, assembled from widely-published planning-department ranges (front
// setback commonly 20-25 ft, side commonly 5-10 ft, rear commonly 15-20 ft, max lot
// coverage commonly 30-40% of lot area — the same ranges lib/zoningAssistant.ts's own
// system prompt already cites for its undocumented-jurisdiction fallback). Every UI
// surface using this module must say so and let the user override every field before
// relying on the result for anything real — never implied as verified for any real
// jurisdiction.

export interface ZoningBaseline {
  label: string;
  frontSetbackFt: number;
  sideSetbackFt: number;
  rearSetbackFt: number;
  maxLotCoveragePct: number;
  /** Max overall building height, roof ridge to grade, in feet — same illustrative-not-verified honesty boundary as every other field here. */
  maxHeightFt: number;
}

export const R1_SUBURBAN_BASELINE: ZoningBaseline = {
  label: "Common US suburban R-1 single-family baseline (illustrative, not jurisdiction-verified)",
  frontSetbackFt: 20,
  sideSetbackFt: 7,
  rearSetbackFt: 15,
  maxLotCoveragePct: 35,
  // Reuses the same number lib/zoningAssistant.ts's own general-fallback text already
  // cites for this baseline ("max building height in single-family zones commonly
  // 30-35 ft or 2-2.5 stories") — picking the upper end of that range, the same
  // "one representative number from a commonly-cited range" approach already used for
  // every other field above (e.g. maxLotCoveragePct=35 from a cited 30-40% range).
  maxHeightFt: 35,
};

export interface LotCoverageCheck {
  pass: boolean;
  lotAreaSqft: number;
  footprintAreaSqft: number;
  maxCoveragePct: number;
  actualCoveragePct: number;
  /** Positive = sqft of headroom still available under the cap; negative = sqft over the cap. */
  marginSqft: number;
}

/**
 * Real lot-coverage math: real exact building footprint (the plan's own `totalAreaSqft`,
 * which — because the layout engine guarantees rooms never overlap and never leave an
 * uncovered interior gap — IS the real union footprint area, not the bounding-rectangle
 * estimate; same reasoning lib/zoningAssistant.ts's `realFootprintAreaSqft` already uses)
 * divided by the real lot area, compared against a max-coverage percentage.
 */
export function checkLotCoverage(footprintAreaSqft: number, lotWidthFt: number, lotDepthFt: number, maxCoveragePct: number): LotCoverageCheck {
  const lotAreaSqft = lotWidthFt * lotDepthFt;
  const actualCoveragePct = lotAreaSqft > 0 ? (footprintAreaSqft / lotAreaSqft) * 100 : Infinity;
  const allowedAreaSqft = (maxCoveragePct / 100) * lotAreaSqft;
  const marginSqft = allowedAreaSqft - footprintAreaSqft;
  return {
    pass: marginSqft >= 0,
    lotAreaSqft: round1(lotAreaSqft),
    footprintAreaSqft: round1(footprintAreaSqft),
    maxCoveragePct,
    actualCoveragePct: round1(actualCoveragePct),
    marginSqft: round1(marginSqft),
  };
}

export interface SetbackClearanceCheck {
  pass: boolean;
  lotWidthFt: number;
  lotDepthFt: number;
  frontSetbackFt: number;
  sideSetbackFt: number;
  rearSetbackFt: number;
  /** The rectangle left over once setbacks are removed from every side — negative dims mean the setbacks alone already exceed the lot (always a fail). */
  buildableWidthFt: number;
  buildableDepthFt: number;
  footprintWFt: number;
  footprintHFt: number;
  /** Which orientation of the plan's bounding footprint (as generated, or rotated 90°) fits inside the buildable envelope. Null when neither fits. */
  fittingOrientation: "as-generated" | "rotated-90" | null;
  /** Feet of spare clearance on the binding dimension for the orientation that passed (0 if neither passed). */
  marginFt: number;
}

/**
 * Real setback-clearance check against a rectangular lot: removes the front+rear setback
 * from the lot's depth and the side setback from both sides of the lot's width to get the
 * real buildable rectangle, then checks whether the plan's real bounding footprint (either
 * as-generated or rotated 90°, since a plan can legitimately be sited either way on a lot)
 * fits inside it. Uses the plan's outer bounding footprint (`FloorPlan.footprint.w/h`), not
 * the smaller exact interior-room area — correct here because a setback line is a hard
 * exterior boundary; any garage notch or L-shaped recess inside that outer boundary only
 * makes the real building smaller, never larger, so checking the outer bound is the
 * correct (and conservative — never a false pass) test for "does the building clear the
 * setback lines," not an approximation shortcut.
 */
export function checkSetbackClearance(
  footprintWFt: number,
  footprintHFt: number,
  lotWidthFt: number,
  lotDepthFt: number,
  frontSetbackFt: number,
  sideSetbackFt: number,
  rearSetbackFt: number,
): SetbackClearanceCheck {
  const buildableWidthFt = lotWidthFt - 2 * sideSetbackFt;
  const buildableDepthFt = lotDepthFt - frontSetbackFt - rearSetbackFt;

  const fitsAsGenerated = footprintWFt <= buildableWidthFt && footprintHFt <= buildableDepthFt;
  const fitsRotated = footprintHFt <= buildableWidthFt && footprintWFt <= buildableDepthFt;

  let fittingOrientation: "as-generated" | "rotated-90" | null = null;
  let marginFt = 0;
  if (fitsAsGenerated) {
    fittingOrientation = "as-generated";
    marginFt = Math.min(buildableWidthFt - footprintWFt, buildableDepthFt - footprintHFt);
  } else if (fitsRotated) {
    fittingOrientation = "rotated-90";
    marginFt = Math.min(buildableWidthFt - footprintHFt, buildableDepthFt - footprintWFt);
  }

  return {
    pass: fittingOrientation !== null,
    lotWidthFt: round1(lotWidthFt),
    lotDepthFt: round1(lotDepthFt),
    frontSetbackFt,
    sideSetbackFt,
    rearSetbackFt,
    buildableWidthFt: round1(buildableWidthFt),
    buildableDepthFt: round1(buildableDepthFt),
    footprintWFt: round1(footprintWFt),
    footprintHFt: round1(footprintHFt),
    fittingOrientation,
    marginFt: round1(marginFt),
  };
}

export interface CornerLotSetbackCheck {
  pass: boolean;
  lotWidthFt: number;
  lotDepthFt: number;
  frontSetbackFt: number;
  sideSetbackFt: number;
  rearSetbackFt: number;
  /** The rectangle left over once BOTH street-facing sides (front + the corner-adjacent side) lose the front setback, and the remaining interior side/rear keep their normal setback. */
  buildableWidthFt: number;
  buildableDepthFt: number;
  footprintWFt: number;
  footprintHFt: number;
  fittingOrientation: "as-generated" | "rotated-90" | null;
  marginFt: number;
}

/**
 * Real corner-lot setback check: a corner lot has TWO street-facing sides — the true
 * front, and whichever of the two side yards actually faces the cross street — and both
 * must clear the larger FRONT setback, not the smaller side setback that a mid-block lot
 * would use there. Only the one remaining interior side (the side that does NOT face a
 * street) and the rear keep their normal side/rear setback.
 *
 * Concretely: `buildableWidthFt` loses `frontSetbackFt` (the corner-adjacent side) +
 * `sideSetbackFt` (the one true interior side) instead of `2 * sideSetbackFt` the way
 * `checkSetbackClearance` computes it for a mid-block lot; `buildableDepthFt` is
 * unchanged (front+rear already apply there regardless of corner-ness). Whenever
 * `frontSetbackFt >= sideSetbackFt` (the normal case — front setbacks are never smaller
 * than side setbacks in any real code this module has seen), this buildable envelope is
 * always <= the mid-block `checkSetbackClearance` result, so a plan that only clears the
 * ordinary mid-block check can still correctly fail here — this is a real additional
 * constraint, not a cosmetic relabeling of the same math.
 */
export function checkCornerLotSetback(
  footprintWFt: number,
  footprintHFt: number,
  lotWidthFt: number,
  lotDepthFt: number,
  frontSetbackFt: number,
  sideSetbackFt: number,
  rearSetbackFt: number,
): CornerLotSetbackCheck {
  const buildableWidthFt = lotWidthFt - frontSetbackFt - sideSetbackFt;
  const buildableDepthFt = lotDepthFt - frontSetbackFt - rearSetbackFt;

  const fitsAsGenerated = footprintWFt <= buildableWidthFt && footprintHFt <= buildableDepthFt;
  const fitsRotated = footprintHFt <= buildableWidthFt && footprintWFt <= buildableDepthFt;

  let fittingOrientation: "as-generated" | "rotated-90" | null = null;
  let marginFt = 0;
  if (fitsAsGenerated) {
    fittingOrientation = "as-generated";
    marginFt = Math.min(buildableWidthFt - footprintWFt, buildableDepthFt - footprintHFt);
  } else if (fitsRotated) {
    fittingOrientation = "rotated-90";
    marginFt = Math.min(buildableWidthFt - footprintHFt, buildableDepthFt - footprintWFt);
  }

  return {
    pass: fittingOrientation !== null,
    lotWidthFt: round1(lotWidthFt),
    lotDepthFt: round1(lotDepthFt),
    frontSetbackFt,
    sideSetbackFt,
    rearSetbackFt,
    buildableWidthFt: round1(buildableWidthFt),
    buildableDepthFt: round1(buildableDepthFt),
    footprintWFt: round1(footprintWFt),
    footprintHFt: round1(footprintHFt),
    fittingOrientation,
    marginFt: round1(marginFt),
  };
}

export interface HeightLimitCheck {
  pass: boolean;
  estimatedHeightFt: number;
  maxHeightFt: number;
  /** Positive = ft of headroom still available under the cap; negative = ft over the cap. */
  marginFt: number;
}

/**
 * Real height-limit check: there is no real wall-height field anywhere in the plan data
 * model (same honesty boundary lib/zoningAssistant.ts's `roughHeightEstimate()` already
 * states in its own prose), so this deliberately does NOT compute a fabricated precise
 * height from room data. It takes an already-honestly-labeled estimate as input —
 * callers should pass `roughHeightEstimateRangeFt(stories).maxFt` below (the same
 * numeric range `lib/zoningAssistant.ts`'s `roughHeightEstimate()` reuses for its prose,
 * so the prose and this check never silently disagree), using the conservative (taller)
 * end of the honest range so this check never produces a false pass on a building that's
 * actually at the top of its estimated range.
 */
export function checkHeightLimit(estimatedHeightFt: number, maxHeightFt: number): HeightLimitCheck {
  const marginFt = maxHeightFt - estimatedHeightFt;
  return {
    pass: marginFt >= 0,
    estimatedHeightFt: round1(estimatedHeightFt),
    maxHeightFt,
    marginFt: round1(marginFt),
  };
}

/**
 * Honest, explicitly-labeled estimate range for a plan's overall built height, keyed only
 * by story count (two ~9-10 ft stories plus roof, or one ~9-10 ft story plus roof) — the
 * single numeric source of truth that both `lib/zoningAssistant.ts`'s `roughHeightEstimate()`
 * prose and `checkHeightLimit` above reuse, so the two never drift apart into two
 * different "honest estimates."
 */
export function roughHeightEstimateRangeFt(stories: 1 | 2): { minFt: number; maxFt: number } {
  return stories === 2 ? { minFt: 20, maxFt: 24 } : { minFt: 15, maxFt: 18 };
}

export interface ZoningComplianceResult {
  coverage: LotCoverageCheck;
  setback: SetbackClearanceCheck;
  /** Only populated when `isCornerLot` was true in the input — null otherwise. When present, this (not `setback`) is the binding setback constraint. */
  cornerSetback: CornerLotSetbackCheck | null;
  height: HeightLimitCheck;
  /** True only when coverage, height, and the binding setback check (cornerSetback when on a corner lot, otherwise setback) all pass. */
  overallPass: boolean;
}

export interface ZoningComplianceInput {
  footprintAreaSqft: number;
  footprintWFt: number;
  footprintHFt: number;
  lotWidthFt: number;
  lotDepthFt: number;
  frontSetbackFt: number;
  sideSetbackFt: number;
  rearSetbackFt: number;
  maxLotCoveragePct: number;
  /** Story count, used only to pick the honest height-estimate range (see `roughHeightEstimateRangeFt`) — never a real measured height. */
  stories: 1 | 2;
  maxHeightFt: number;
  /** True if this lot has two street-facing sides (the normal front, plus one side yard that also faces a street) — see `checkCornerLotSetback`. */
  isCornerLot: boolean;
}

export function checkZoningCompliance(input: ZoningComplianceInput): ZoningComplianceResult {
  const coverage = checkLotCoverage(input.footprintAreaSqft, input.lotWidthFt, input.lotDepthFt, input.maxLotCoveragePct);
  const setback = checkSetbackClearance(
    input.footprintWFt,
    input.footprintHFt,
    input.lotWidthFt,
    input.lotDepthFt,
    input.frontSetbackFt,
    input.sideSetbackFt,
    input.rearSetbackFt,
  );
  const cornerSetback = input.isCornerLot
    ? checkCornerLotSetback(
        input.footprintWFt,
        input.footprintHFt,
        input.lotWidthFt,
        input.lotDepthFt,
        input.frontSetbackFt,
        input.sideSetbackFt,
        input.rearSetbackFt,
      )
    : null;
  const estimatedHeightFt = roughHeightEstimateRangeFt(input.stories).maxFt;
  const height = checkHeightLimit(estimatedHeightFt, input.maxHeightFt);
  const bindingSetbackPass = cornerSetback ? cornerSetback.pass : setback.pass;
  return { coverage, setback, cornerSetback, height, overallPass: coverage.pass && bindingSetbackPass && height.pass };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
