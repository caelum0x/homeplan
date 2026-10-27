// Real stair dimensions, shared by the 2-story generator (lib/layout/multiStory.ts) and every
// renderer that draws treads (lib/stairs.ts) — kept dependency-free so renderers never pull the
// layout engine in just to read a constant.

/** Stair strip width (ft): a 36" IRC-minimum clear flight plus handrail/wall-finish allowance. */
export const STAIRS_WIDTH = 4;
/** Risers for a ~9.5ft floor-to-floor at ≤7.75" each (IRC R311.7.5.1). */
export const STAIR_RISERS = 15;
/** Tread depth (in), the IRC R311.7.5.2 minimum. */
export const STAIR_TREAD_IN = 10;
/** Horizontal length of the flight: (risers − 1) treads. 14 × 10" ≈ 11.7ft. */
export const STAIR_RUN = ((STAIR_RISERS - 1) * STAIR_TREAD_IN) / 12;
/** IRC R311.7.6: a landing at the top and bottom of every flight, ≥ 36" in the direction of travel. */
export const STAIR_LANDING = 3;
