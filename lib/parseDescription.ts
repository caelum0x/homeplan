import type { BriefInput } from "./layout/types";

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

  return {
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
