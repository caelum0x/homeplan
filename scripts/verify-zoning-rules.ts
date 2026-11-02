// Real verification for lib/layout/zoningRules.ts — runs the actual floor-plan generator
// to get a real footprint/area, then checks the deterministic setback/coverage math against
// hand-computed expectations. See plans/homeplan.md for how this was used.
import { parseDescription } from "../lib/parseDescription";
import { generateFloorPlan } from "../lib/layout/generate";
import { checkLotCoverage, checkSetbackClearance, checkZoningCompliance, R1_SUBURBAN_BASELINE } from "../lib/layout/zoningRules";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

// --- 1. Pure unit-math sanity checks, hand-computed, no generator involved ---
console.log("\n=== Pure math: checkLotCoverage ===");
{
  // 2000 sqft footprint on a 60x100=6000 sqft lot = 33.33% coverage. Cap 35% -> pass,
  // margin = 0.35*6000 - 2000 = 2100 - 2000 = 100 sqft.
  const r = checkLotCoverage(2000, 60, 100, 35);
  check("6000 sqft lot, 2000 sqft footprint, 35% cap -> pass", r.pass === true);
  check("actualCoveragePct ~= 33.3", Math.abs(r.actualCoveragePct - 33.3) < 0.1, String(r.actualCoveragePct));
  check("marginSqft == 100", Math.abs(r.marginSqft - 100) < 0.01, String(r.marginSqft));

  // Same lot, 2500 sqft footprint = 41.67% > 35% cap -> fail, margin = 2100-2500 = -400.
  const r2 = checkLotCoverage(2500, 60, 100, 35);
  check("6000 sqft lot, 2500 sqft footprint, 35% cap -> fail", r2.pass === false);
  check("marginSqft == -400", Math.abs(r2.marginSqft - -400) < 0.01, String(r2.marginSqft));

  // Exact boundary: footprint == cap exactly -> pass (margin 0, >= 0 is pass).
  const r3 = checkLotCoverage(2100, 60, 100, 35);
  check("exact boundary (margin 0) -> pass", r3.pass === true, String(r3.marginSqft));
}

console.log("\n=== Pure math: checkSetbackClearance ===");
{
  // Lot 60x120, front 20, side 7 (each side), rear 15.
  // Buildable width = 60 - 2*7 = 46. Buildable depth = 120 - 20 - 15 = 85.
  // Footprint 40x50 (w x h) fits as-generated (40<=46, 50<=85).
  const r = checkSetbackClearance(40, 50, 60, 120, 20, 7, 15);
  check("buildableWidthFt == 46", r.buildableWidthFt === 46, String(r.buildableWidthFt));
  check("buildableDepthFt == 85", r.buildableDepthFt === 85, String(r.buildableDepthFt));
  check("40x50 fits as-generated", r.pass === true && r.fittingOrientation === "as-generated", JSON.stringify(r));
  check("margin == min(46-40, 85-50) == 6", Math.abs(r.marginFt - 6) < 0.01, String(r.marginFt));

  // Footprint 50x40 (w x h swapped) does NOT fit as-generated (50 > 46) but DOES fit rotated
  // 90 (h=40<=46, w=50<=85).
  const r2 = checkSetbackClearance(50, 40, 60, 120, 20, 7, 15);
  check("50x40 fits rotated-90 only", r2.pass === true && r2.fittingOrientation === "rotated-90", JSON.stringify(r2));

  // Footprint way too big for either orientation -> fail, fittingOrientation null.
  const r3 = checkSetbackClearance(55, 90, 60, 120, 20, 7, 15);
  check("oversized footprint -> fail, no orientation", r3.pass === false && r3.fittingOrientation === null, JSON.stringify(r3));

  // Setbacks alone exceed the lot -> negative buildable dims -> fail.
  const r4 = checkSetbackClearance(10, 10, 20, 20, 15, 15, 15);
  check("setbacks exceed lot -> fail", r4.pass === false, JSON.stringify(r4));
  check("buildableWidthFt negative (20 - 30 = -10)", r4.buildableWidthFt === -10, String(r4.buildableWidthFt));
}

// --- 2. Real generated plans through the actual engine ---
console.log("\n=== Real generated plans ===");
{
  // A small, roomy lot: generous enough that a modest house should comfortably pass both
  // checks under the R1 baseline.
  const input = parseDescription("3-bedroom, 2-bath, ~1400 sqft, open-plan kitchen/living");
  const plan = generateFloorPlan(input);
  console.log(`  plan footprint: ${plan.footprint.w}' x ${plan.footprint.h}', totalAreaSqft=${plan.totalAreaSqft}`);

  const roomyResult = checkZoningCompliance({
    footprintAreaSqft: plan.totalAreaSqft,
    footprintWFt: plan.footprint.w,
    footprintHFt: plan.footprint.h,
    lotWidthFt: 80,
    lotDepthFt: 150,
    frontSetbackFt: R1_SUBURBAN_BASELINE.frontSetbackFt,
    sideSetbackFt: R1_SUBURBAN_BASELINE.sideSetbackFt,
    rearSetbackFt: R1_SUBURBAN_BASELINE.rearSetbackFt,
    maxLotCoveragePct: R1_SUBURBAN_BASELINE.maxLotCoveragePct,
  });
  // Hand-cross-check: 80x150=12000 sqft lot, buildable envelope (80-14)x(150-35) = 66x115.
  const expectedLotArea = 80 * 150;
  const expectedCoveragePct = (plan.totalAreaSqft / expectedLotArea) * 100;
  check("coverage.lotAreaSqft == 12000", roomyResult.coverage.lotAreaSqft === 12000, String(roomyResult.coverage.lotAreaSqft));
  check(
    "coverage.actualCoveragePct matches hand calc",
    Math.abs(roomyResult.coverage.actualCoveragePct - expectedCoveragePct) < 0.15,
    `${roomyResult.coverage.actualCoveragePct} vs ${expectedCoveragePct}`,
  );
  check("roomy 80x150 lot: real small plan passes lot coverage", roomyResult.coverage.pass === true, JSON.stringify(roomyResult.coverage));
  check("roomy 80x150 lot: real small plan passes setback clearance", roomyResult.setback.pass === true, JSON.stringify(roomyResult.setback));
  check("overallPass true on roomy lot", roomyResult.overallPass === true);

  // The exact same real plan on a deliberately tiny lot must fail both checks — and the
  // numbers must be internally consistent (buildable envelope smaller than the footprint).
  const tinyResult = checkZoningCompliance({
    footprintAreaSqft: plan.totalAreaSqft,
    footprintWFt: plan.footprint.w,
    footprintHFt: plan.footprint.h,
    lotWidthFt: 25,
    lotDepthFt: 40,
    frontSetbackFt: R1_SUBURBAN_BASELINE.frontSetbackFt,
    sideSetbackFt: R1_SUBURBAN_BASELINE.sideSetbackFt,
    rearSetbackFt: R1_SUBURBAN_BASELINE.rearSetbackFt,
    maxLotCoveragePct: R1_SUBURBAN_BASELINE.maxLotCoveragePct,
  });
  check("tiny 25x40 lot: real plan fails lot coverage", tinyResult.coverage.pass === false, JSON.stringify(tinyResult.coverage));
  check("tiny 25x40 lot: real plan fails setback clearance", tinyResult.setback.pass === false, JSON.stringify(tinyResult.setback));
  check("overallPass false on tiny lot", tinyResult.overallPass === false);
  check(
    "tiny lot buildable envelope negative/near-zero on depth (40-20-15=5)",
    Math.abs(tinyResult.setback.buildableDepthFt - 5) < 0.01,
    String(tinyResult.setback.buildableDepthFt),
  );

  // A larger real generated plan (garage + office) to confirm the real footprint area (not
  // the bounding rectangle) is what coverage math uses — same distinction already
  // established for lib/zoningAssistant.ts.
  const bigInput = parseDescription("4 bed 3 bath house, 2200 square feet, with a 2-car garage and a home office");
  const bigPlan = generateFloorPlan(bigInput);
  console.log(`  big plan footprint: ${bigPlan.footprint.w}' x ${bigPlan.footprint.h}', totalAreaSqft=${bigPlan.totalAreaSqft}`);
  const boundingArea = bigPlan.footprint.w * bigPlan.footprint.h;
  check(
    "real totalAreaSqft is smaller than the bounding rectangle (garage notch confirmed present)",
    bigPlan.totalAreaSqft < boundingArea - 1,
    `totalAreaSqft=${bigPlan.totalAreaSqft} boundingArea=${boundingArea}`,
  );
  const bigCov = checkLotCoverage(bigPlan.totalAreaSqft, 100, 100, 35);
  const boundingCov = checkLotCoverage(boundingArea, 100, 100, 35);
  check(
    "coverage computed from real footprint is lower than coverage computed from the bounding box",
    bigCov.actualCoveragePct < boundingCov.actualCoveragePct,
    `real=${bigCov.actualCoveragePct} bounding=${boundingCov.actualCoveragePct}`,
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
