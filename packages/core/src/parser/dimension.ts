import type { Dimension, UnitSystem } from "../types/config.js";

// Imperial regex patterns (ordered from most specific to least)
const FT_IN_FRAC =
  /^(\d+(?:\.\d+)?)\s*(?:ft|')\s+(\d+)\s*-\s*(\d+)\/(\d+)\s*(?:in|")$/i;
const FT_IN =
  /^(\d+(?:\.\d+)?)\s*(?:ft|')\s+(\d+(?:\.\d+)?)\s*(?:in|")$/i;
const FT_ONLY = /^(\d+(?:\.\d+)?)\s*(?:ft|')$/i;
const IN_ONLY = /^(\d+(?:\.\d+)?)\s*(?:in|")$/i;

// Metric regex patterns
const METERS = /^(\d+(?:\.\d+)?)\s*m$/i;
const MILLIMETERS = /^(\d+(?:\.\d+)?)\s*mm$/i;

/**
 * Parse a dimension string into a numeric value in the canonical unit.
 *
 * For imperial (canonical unit = feet):
 *   "12ft"        → 12.0
 *   "12ft 6in"    → 12.5
 *   "12.5ft"      → 12.5
 *   "33in"        → 2.75
 *   "4ft 3-1/2in" → 4.291667
 *   "6in"         → 0.5
 *
 * For metric (canonical unit = meters):
 *   "3.5m"        → 3.5
 *   "900mm"       → 0.9
 *
 * Bare numbers return as-is (the caller applies the default unit).
 */
export function parseDimension(value: Dimension, units: UnitSystem): number {
  if (typeof value === "number") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("Empty dimension string");
  }

  // Try bare number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  if (units === "imperial") {
    return parseImperial(trimmed);
  } else {
    return parseMetric(trimmed);
  }
}

function parseImperial(s: string): number {
  let match: RegExpMatchArray | null;

  // "4ft 3-1/2in" → feet + fractional inches
  match = s.match(FT_IN_FRAC);
  if (match) {
    const feet = parseFloat(match[1]);
    const wholeInches = parseInt(match[2], 10);
    const fracNum = parseInt(match[3], 10);
    const fracDen = parseInt(match[4], 10);
    if (fracDen === 0) throw new Error(`Invalid fraction in dimension: "${s}"`);
    const totalInches = wholeInches + fracNum / fracDen;
    return feet + totalInches / 12;
  }

  // "12ft 6in" → feet + inches
  match = s.match(FT_IN);
  if (match) {
    const feet = parseFloat(match[1]);
    const inches = parseFloat(match[2]);
    return feet + inches / 12;
  }

  // "12ft" or "12'" → feet
  match = s.match(FT_ONLY);
  if (match) {
    return parseFloat(match[1]);
  }

  // "33in" or '33"' → inches converted to feet
  match = s.match(IN_ONLY);
  if (match) {
    return parseFloat(match[1]) / 12;
  }

  throw new Error(
    `Invalid imperial dimension string: "${s}". Expected formats: "12ft", "12ft 6in", "33in", "4ft 3-1/2in"`,
  );
}

function parseMetric(s: string): number {
  let match: RegExpMatchArray | null;

  // "3.5m" → meters
  match = s.match(METERS);
  if (match) {
    return parseFloat(match[1]);
  }

  // "900mm" → millimeters converted to meters
  match = s.match(MILLIMETERS);
  if (match) {
    return parseFloat(match[1]) / 1000;
  }

  throw new Error(
    `Invalid metric dimension string: "${s}". Expected formats: "3.5m", "900mm"`,
  );
}

/**
 * Format a numeric value into a display string.
 *
 * Imperial: 12.5 → "12'-6\""
 *           12.0 → "12'-0\""
 * Metric:   3.5  → "3.50m"
 */
export function formatDimension(value: number, units: UnitSystem): string {
  if (units === "imperial") {
    return formatImperial(value);
  } else {
    return formatMetric(value);
  }
}

function formatImperial(feet: number): string {
  const negative = feet < 0;
  const absFeet = Math.abs(feet);
  const wholeFeet = Math.floor(absFeet);
  const remainingInches = Math.round((absFeet - wholeFeet) * 12);

  // Handle rounding 12 inches up to next foot
  if (remainingInches >= 12) {
    return `${negative ? "-" : ""}${wholeFeet + 1}'-0"`;
  }

  return `${negative ? "-" : ""}${wholeFeet}'-${remainingInches}"`;
}

function formatMetric(meters: number): string {
  return `${meters.toFixed(2)}m`;
}
