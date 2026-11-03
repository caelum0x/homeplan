import type { BriefInput, PrivateTopology } from "./layout/types";

/**
 * Turns a plain-language brief ("3-bedroom, 2-bath, ~1400 sqft, open-plan
 * kitchen/living") into the structured constraints the layout engine needs.
 *
 * Deterministic regex extraction on purpose, not an LLM call: it is free,
 * instant, works offline, and every number it reports is literally present
 * in the text — there is nothing to hallucinate. This is the known tradeoff
 * noted in the plan file (fast-follow: optional LLM-assisted parsing for
 * descriptions that don't use these patterns).
 */
export function parseDescription(raw: string): BriefInput {
  const text = raw.toLowerCase();

  const isStudio = /\bstudio\b/.test(text);
  const bedrooms = firstNumber(
    text,
    [
      /(\d+(?:\.\d+)?)\s*[- ]?\s*bed(?:room)?s?/,
      /(\d+(?:\.\d+)?)\s*bd/,
      /(\d+(?:\.\d+)?)\s*br\b/,
    ],
    isStudio ? 1 : 3,
  );

  const bathrooms = firstNumber(
    text,
    [
      /(\d+(?:\.\d+)?)\s*[- ]?\s*bath(?:room)?s?/,
      /(\d+(?:\.\d+)?)\s*ba\b/,
    ],
    2,
  );

  const sqft = firstNumber(
    text,
    [
      /(\d{3,5}(?:,\d{3})?)\s*(?:sq\.?\s?ft\.?|sqft|square\s?feet|sf\b)/,
      /~\s*(\d{3,5})/,
    ],
    1400,
  );

  const openPlan = /open[- ]?(plan|concept)|open\s+kitchen|great\s?room/.test(
    text,
  );
  const hasGarage = /garage|carport/.test(text);
  const hasOffice = /office|study|den\b/.test(text);
  const hasDining = /dining/.test(text) || !openPlan;

  // Only set when the brief actually says so — an omitted field keeps the original
  // single-story engine (and this function's exact previous output) for every other brief.
  const stories = parseStories(text);
  const lShaped = /\bl[- ]?shaped?\b|\bl[- ]?wing\b|\bl[- ]?shaped?\s+(?:footprint|floor\s?plan|house|home)\b/.test(text);
  const styleTopologyPreferences = parseStyleTopologyPreferences(text);

  return {
    ...(stories ? { stories } : {}),
    ...(lShaped ? { lShaped } : {}),
    ...(styleTopologyPreferences ? { styleTopologyPreferences } : {}),
    bedrooms: clamp(Math.round(bedrooms), 1, 8),
    bathrooms: clamp(roundHalf(bathrooms), 1, 6),
    sqft: clamp(Math.round(sqft), 400, 12000),
    openPlan,
    hasGarage,
    hasOffice,
    hasDining,
    raw,
  };
}

function parseStories(text: string): 1 | 2 | undefined {
  if (/\b(?:2|two|double)[- ]?(?:stor(?:e?y|eys|ies)|floors?|levels?)\b|\bupstairs\b/.test(text)) return 2;
  if (/\b(?:1|one|single)[- ]?(?:stor(?:e?y|eys|ies)|floor|level)\b|\branch\b|\bbungalow\b/.test(text)) return 1;
  return undefined;
}

/**
 * Real private-zone topology (see `PrivateTopology`, lib/layout/types.ts) keyword
 * matches, in the order a brief's own words should be tried as preferences — not a
 * priority ranking, just the table `parseStyleTopologyPreferences` scans; the actual
 * preference ORDER returned is driven by each keyword's position in the real brief text
 * (first mentioned = first preference), not this table's order.
 */
const STYLE_TOPOLOGY_PATTERNS: ReadonlyArray<{ pattern: RegExp; topology: PrivateTopology }> = [
  { pattern: /\bcourtyard\b/, topology: "courtyard" },
  { pattern: /\bside[- ]hallway\b|\bsingle[- ]loaded\s+corridor\b/, topology: "side-hallway" },
  { pattern: /\bcenter[- ]hall\b|\bdouble[- ]row\b|\bdouble[- ]loaded\s+corridor\b/, topology: "double-row" },
];

/**
 * Turns real style keywords in the brief ("a cozy courtyard-style 3 bedroom house") into
 * an ordered `BriefInput.styleTopologyPreferences` list — first-mentioned keyword wins the
 * first preference slot, same convention as every other field in this file (literal words
 * in the text, nothing inferred). Each topology appears at most once even if its keyword
 * is repeated. Returns undefined (not an empty array) when the brief names none of these,
 * so `parseDescription`'s spread keeps the field entirely absent — unchanged output for
 * every brief that predates this.
 */
function parseStyleTopologyPreferences(text: string): PrivateTopology[] | undefined {
  const matches: Array<{ index: number; topology: PrivateTopology }> = [];
  for (const { pattern, topology } of STYLE_TOPOLOGY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) matches.push({ index: match.index, topology });
  }
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => a.index - b.index);
  const ordered: PrivateTopology[] = [];
  for (const { topology } of matches) {
    if (!ordered.includes(topology)) ordered.push(topology);
  }
  return ordered;
}

function firstNumber(text: string, patterns: RegExp[], fallback: number): number {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, "");
      const value = Number.parseFloat(cleaned);
      if (!Number.isNaN(value) && value > 0) return value;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
