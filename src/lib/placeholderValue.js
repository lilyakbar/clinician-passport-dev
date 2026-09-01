// Shared placeholder / empty-value rule for CV import.
// Used by both ProfileReview (review screen) and ImportCV (import writer)
// so that a missing field can never overwrite existing data with a placeholder.

const PLACEHOLDER_PHRASES = new Set([
  "not stated",
  "not provided",
  "not mentioned",
  "not specified",
  "not applicable",
  "not available",
  "not known",
  "n/a",
  "none",
  "unknown",
  "tbd",
]);

// Returns true only when the value is a non-empty string that is not a
// recognized placeholder phrase. Case-insensitive, trims whitespace.
export function hasRealValue(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "") return false;
  return !PLACEHOLDER_PHRASES.has(s);
}