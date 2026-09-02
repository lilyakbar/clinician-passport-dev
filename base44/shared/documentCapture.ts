// Shared, reusable document-capture helpers extracted from importFromCV.
//
// These functions implement the deterministic, behavior-preserving safeguards
// used by CV Import and intended for reuse by future document-backed capture
// (e.g. credential/CE capture from a license, renewal, or certificate file):
//   - file-type detection + deterministic text extraction (PDF/DOCX)
//   - verbatim source_quote grounding (substring + token + phrase + year)
//   - placeholder date/string sanitization
//   - credential-type normalization (canonical + alias, no fuzzy matching)
//   - record-scoped jurisdiction resolution for state-issued credentials
//   - record-scoped date grounding + January-1 safeguard
//   - CE credit validation (explicit CE language + positive numeric amount)
//   - deterministic BLS/ACLS/PALS/CPR fallback synthesis
//
// No prompts, extraction schemas, matching rules, or user-facing behavior live
// here — only the pure, reusable validation/extraction primitives. The logic is
// identical to what importFromCV used inline; this module simply centralizes it.

import { Buffer } from "node:buffer";
import mammoth from 'npm:mammoth@1.6.0';

// ---------------------------------------------------------------------------
// Deterministic document text extraction
//
// The model never receives the binary document. We extract plain text
// server-side first, gate on it, and only then ask the LLM to structure it.
// PDF  -> Core.ExtractDataFromUploadedFile (platform document-extraction cap)
// DOCX -> mammoth.extractRawText (deterministic OOXML parse)
// ---------------------------------------------------------------------------

export const MIN_MEANINGFUL_CHARS = 80;

export async function extractPdfText(base44, signedUrl) {
  // Use the platform's document-extraction capability to pull the text of a
  // text-based PDF into a single field, deterministically.
  const res = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
    file_url: signedUrl,
    json_schema: {
      type: "object",
      properties: {
        full_text: {
          type: "string",
          description: "The complete plain-text content of the document, preserving all readable text in reading order. Do not summarize or omit any text."
        }
      },
      required: ["full_text"]
    }
  });
  if (res?.status !== "success" || !res?.output) return "";
  return String(res.output.full_text || "").trim();
}

export async function extractDocxText(signedUrl) {
  // Fetch the private file via its short-lived signed URL and parse the OOXML
  // binary to plain text with mammoth (no LLM involved).
  let resp;
  try {
    resp = await fetch(signedUrl);
  } catch (e) {
    throw new Error(`[DOCX stage: fetch] ${e?.message || String(e)}`);
  }
  if (!resp.ok) {
    throw new Error(`[DOCX stage: fetch] HTTP ${resp.status} ${resp.statusText}`);
  }
  let arrayBuffer;
  try {
    arrayBuffer = await resp.arrayBuffer();
  } catch (e) {
    throw new Error(`[DOCX stage: arrayBuffer] ${e?.message || String(e)}`);
  }
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error(`[DOCX stage: arrayBuffer] empty buffer (${arrayBuffer?.byteLength ?? 0} bytes)`);
  }
  let result;
  try {
    const buffer = Buffer.from(arrayBuffer);
    result = await mammoth.extractRawText({ buffer });
  } catch (e) {
    throw new Error(`[DOCX stage: mammoth.extractRawText] ${e?.message || String(e)}`);
  }
  return String(result?.value || "").trim();
}

export function detectFileType(fileName) {
  const ext = (fileName || "").toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return null;
}

// ---------------------------------------------------------------------------
// Grounding validation
// ---------------------------------------------------------------------------

// Normalize for substring grounding: allow only trivial differences
// (case, whitespace, punctuation, common Unicode quote/dash/hyphen variants).
export function normalizeForGrounding(s) {
  if (s === undefined || s === null) return "";
  return String(s)
    .toLowerCase()
    .replace(/\u00ad/g, "")                 // soft hyphen
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[^a-z0-9'"\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGrounded(quote, normalizedText) {
  const q = normalizeForGrounding(quote);
  if (!q) return false;
  return normalizedText.includes(q);
}

// Token-level grounding for short identifiers (license numbers, state
// abbreviations) where substring matching would false-positive — e.g. "ca"
// inside "california". Checks that the value appears as a standalone word.
export function isTokenInText(token, normalizedText) {
  const t = normalizeForGrounding(token);
  if (!t) return false;
  return normalizedText.split(" ").includes(t);
}

// Token-sequence (phrase) containment — not fuzzy. Returns true only if the
// phrase's normalized tokens appear consecutively in the normalized text.
export function phraseTokensInText(phrase, normalizedText) {
  const pTokens = normalizeForGrounding(phrase).split(" ").filter(Boolean);
  if (!pTokens.length) return false;
  const textTokens = normalizedText.split(" ");
  for (let i = 0; i + pTokens.length <= textTokens.length; i++) {
    if (pTokens.every((t, j) => textTokens[i + j] === t)) return true;
  }
  return false;
}

// True if a 4-digit year appears in the normalized scope as a bounded number.
// Word boundaries treat hyphens/space/punct as boundaries, so "2028" inside
// "2028-08-01" or "Expiration: 2028" matches; "2023" inside "12023" does not.
export function yearInScope(year, normalizedScope) {
  if (!year || !normalizedScope) return false;
  return new RegExp(`\\b${year}\\b`).test(normalizedScope);
}

// Document-title/header terms that should never be accepted as a person's
// full_name (e.g. "CLINICIAN", "CV", "TEST PASSPORT", "CURRICULUM VITAE").
const TITLE_NAME_TERMS = new Set(["cv", "resume", "passport", "import", "test", "curriculum", "vitae"]);

// Reject a proposed full_name that is a single token or that contains a
// document-title/header term. Real names ("John Smith", "Dr. Jane Doe") pass.
export function isLikelyTitleName(name) {
  const tokens = normalizeForGrounding(name).split(" ").filter(Boolean);
  if (tokens.length < 2) return true;
  return tokens.some((t) => TITLE_NAME_TERMS.has(t));
}

// January-1 literal patterns for credential date grounding: "01-01", "01/01",
// "january 1", "jan 1", "january 1st", etc. Used to keep YYYY-01-01 only when
// the credential's own source_quote genuinely supports January 1.
export const JAN1_RE = /(?:01[-/]01|jan(?:uary)?\s*0?1(?:st)?\b)/i;

// ---------------------------------------------------------------------------
// Deterministic fallback for short life-support certifications
// ---------------------------------------------------------------------------

// Restricted to BLS/ACLS/PALS/CPR. Uses the explicit alias map only (no fuzzy
// matching) and the actual document line as the source_quote. Synthesizes at
// most one record per canonical type, and only when the LLM did not already
// extract that canonical type. No dates, license numbers, or issuing bodies
// are fabricated — only name/type/quote.
const FALLBACK_CREDENTIAL_TYPES = ["BLS Certification", "ACLS Certification", "PALS Certification", "CPR Certification"];
const FALLBACK_MAX_LINE_LEN = 200;

// Parse a full date literal (YYYY-MM-DD or MM/DD/YYYY) from a line, but only
// when the line also contains one of the given date keywords. Requires a full
// date (day present) — never synthesizes from a bare 4-digit year. Returns "".
export function parseLineDate(lineText, keywords) {
  if (!lineText) return "";
  const lower = lineText.toLowerCase();
  if (!keywords.some((k) => lower.includes(k))) return "";
  let m = lineText.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = lineText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

export function buildCredentialFallback(documentText, aliases, recognized, alreadyPresent) {
  if (!documentText || !aliases || typeof aliases !== "object") return [];
  const typeToAliases = {};
  for (const [aliasKey, canonical] of Object.entries(aliases)) {
    if (FALLBACK_CREDENTIAL_TYPES.includes(canonical)) {
      if (!typeToAliases[canonical]) typeToAliases[canonical] = [];
      typeToAliases[canonical].push(aliasKey);
    }
  }
  const lines = String(documentText).split(/\r?\n/);
  const synthesized = [];
  for (const canonical of FALLBACK_CREDENTIAL_TYPES) {
    if (alreadyPresent.has(canonical)) continue;
    if (recognized && !recognized.includes(canonical)) continue;
    const aliasKeys = typeToAliases[canonical] || [];
    if (!aliasKeys.length) continue;
    for (const line of lines) {
      const lineText = String(line).trim();
      if (!lineText || lineText.length > FALLBACK_MAX_LINE_LEN) continue;
      const normLine = normalizeForGrounding(lineText);
      if (!normLine) continue;
      if (aliasKeys.some((a) => phraseTokensInText(a, normLine))) {
        synthesized.push({
          name: canonical,
          credential_type: canonical,
          source_quote: lineText,
          expiration_date: parseLineDate(lineText, ["expir", "valid until", "valid through", "renewal"]),
          issue_date: parseLineDate(lineText, ["issu", "effective", "granted"]),
        });
        break; // one record per canonical type
      }
    }
  }
  return synthesized;
}

// ---------------------------------------------------------------------------
// Placeholder date / string sanitization
// ---------------------------------------------------------------------------

// Placeholder-date sanitization: treat sentinel values the LLM may emit when a
// date is unknown (0000-00-00, "unknown", "not stated", "not provided", and
// equivalents) as missing so they can never be persisted as real dates.
const DATE_KEYS = ["start_date", "end_date", "date", "issue_date", "expiration_date", "completion_date", "publication_date"];

function isPlaceholderDate(val) {
  if (val === undefined || val === null) return true;
  const s = String(val).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (/^0{4}-0{2}-0{2}/.test(lower)) return true;
  if (/^(unknown|not\s*stated|not\s*provided|not\s*applicable|not\s*known|unspecified|n\/?a|none|tbd|null|undefined)$/.test(lower)) return true;
  return false;
}

export function sanitizeItemDates(item) {
  if (!item || typeof item !== "object") return item;
  for (const k of DATE_KEYS) {
    if (k in item && isPlaceholderDate(item[k])) item[k] = "";
  }
  return item;
}

// Placeholder string phrases and narrow test/disclaimer substrings that should
// never reach review/import as real field values. Mirrors the frontend
// placeholderValue set plus a few close variants.
const PLACEHOLDER_STRING_PHRASES = new Set([
  "not stated", "not provided", "not mentioned", "not specified",
  "not applicable", "not available", "not known", "n/a",
  "none", "unknown", "tbd",
]);
const DISCLAIMER_SUBSTRINGS = [
  "fictional test data", "test data only", "for testing purposes",
  "dummy data", "placeholder data", "this is a test",
  "fictional data", "synthetic data", "sample data only",
];

// Blank string fields whose value is a placeholder phrase or a test/disclaimer
// phrase. Never touches source_quote (grounding/gates need it) or non-string
// fields. Runs after grounding validation, before section gates.
export function sanitizeItemStrings(item) {
  if (!item || typeof item !== "object") return item;
  for (const [k, v] of Object.entries(item)) {
    if (k === "source_quote" || typeof v !== "string") continue;
    const lower = v.trim().toLowerCase();
    if (!lower) continue;
    if (PLACEHOLDER_STRING_PHRASES.has(lower) || DISCLAIMER_SUBSTRINGS.some((s) => lower.includes(s))) {
      item[k] = "";
    }
  }
  return item;
}

// ---------------------------------------------------------------------------
// Credential-type normalization + record-scoped jurisdiction
// ---------------------------------------------------------------------------

// Conservative credential-type normalization: accept an exact canonical match
// (case-insensitive) or an explicit alias from the profession's alias map.
// Anything else returns null (the caller drops the record). No fuzzy matching.
export function normalizeCredentialType(rawType, recognized, aliases) {
  if (!rawType) return null;
  const lower = String(rawType).trim().toLowerCase();
  if (!lower) return null;
  if (recognized) {
    for (const t of recognized) {
      if (t.toLowerCase() === lower) return t;
    }
  }
  if (aliases && aliases[lower]) return aliases[lower];
  return null;
}

// Resolve a state-issued credential jurisdiction. Accepts either the state
// abbreviation or full state name from the LLM; verifies that one of those
// forms appears as a token in the credential's OWN grounded source_quote
// (not elsewhere in the document); returns the canonical abbreviation
// (or null if it cannot be resolved/grounded). A state can only be assigned
// to a state-issued credential if that credential's own source text supports
// that state — never because the same document mentions the state elsewhere.
export function resolveJurisdiction(rawJur, stateNames, normalizedScope) {
  if (!rawJur || !stateNames) return null;
  const val = String(rawJur).trim();
  if (!val) return null;
  const upper = val.toUpperCase();
  const lower = val.toLowerCase();
  let abbr = null;
  if (stateNames[upper]) {
    abbr = upper;
  } else {
    for (const [a, full] of Object.entries(stateNames)) {
      if (full.toLowerCase() === lower) { abbr = a; break; }
    }
  }
  if (!abbr) return null;
  const inScope = isTokenInText(abbr, normalizedScope)
    || isTokenInText(stateNames[abbr], normalizedScope);
  if (!inScope) return null;
  return abbr;
}

// ---------------------------------------------------------------------------
// Reusable record-level gates
// ---------------------------------------------------------------------------

// Credential gate: validate + normalize a single credential item against the
// recognized profession types, enforce record-scoped jurisdiction for
// state-issued credentials, ground issue/expiration dates in the credential's
// OWN source_quote (incl. January-1 safeguard), and blank any license number
// not present as a token in the document text. Returns the validated item
// (quote stripped, ready to persist) or null to drop. Pure validation only —
// no fuzzy matching, no fabrication.
//
// ctx = { recognized, aliases, needsJurisdiction, stateNames, normalizedText }
export function validateCredentialItem(item, ctx) {
  const { recognized, aliases, needsJurisdiction, stateNames, normalizedText } = ctx || {};
  if (!item || !item.name || !item.credential_type) return null;
  const normalizedType = normalizeCredentialType(item.credential_type, recognized, aliases);
  if (!normalizedType) return null; // unsupported type
  item.credential_type = normalizedType;
  const credScope = normalizeForGrounding(item.source_quote || "");
  if (Array.isArray(needsJurisdiction) && needsJurisdiction.includes(normalizedType)) {
    // A state can only be assigned to a state-issued credential if that
    // credential's OWN source_quote supports the state — never because
    // the same document mentions the state on another line.
    const resolved = resolveJurisdiction(item.jurisdiction, stateNames, credScope);
    if (!resolved) return null;
    item.jurisdiction = resolved;
  }
  // Record-scoped date grounding: keep issue_date / expiration_date only
  // if that date's 4-digit year appears in this credential's OWN
  // source_quote. Blanks invented dates whose source line has no year.
  for (const dateKey of ["issue_date", "expiration_date"]) {
    const d = item[dateKey];
    if (!d) continue;
    const yearMatch = String(d).match(/(\d{4})/);
    const year = yearMatch ? yearMatch[1] : null;
    if (!yearInScope(year, credScope)) { item[dateKey] = ""; continue; }
    // Reject year-only dates dressed as January 1: keep YYYY-01-01 only
    // when this credential's own source_quote actually supports Jan 1.
    if (/^\d{4}-01-01$/.test(String(d).trim()) && !JAN1_RE.test(item.source_quote || "")) {
      item[dateKey] = "";
    }
  }
  if (item.license_number && !isTokenInText(item.license_number, normalizedText)) {
    item.license_number = "";
  }
  // Quote was preserved through gating for record-scoped jurisdiction checks;
  // strip it now so it is never persisted.
  delete item.source_quote;
  return item;
}

// CE gate: keep a CE item only when its grounded source_quote explicitly states
// CE/CDE hour/credit language AND a positive numeric credit amount. Sets
// credits to the parsed amount, strips the quote, and returns the item — or
// null to drop creditless / ungrounded items.
export function validateCeItem(item) {
  if (!item || !item.title) return null;
  const quote = normalizeForGrounding(item.source_quote || "");
  if (!quote) return null;
  // Require explicit CE/CDE hour/credit language in the grounded quote.
  const ceLanguage = /\b(?:ce|cde)\s*(?:hour|credit)s?\b/.test(quote)
    || /\b(?:hour|credit)s?\s*(?:ce|cde)\b/.test(quote)
    || /\bcontinuing\s+education\b/.test(quote);
  if (!ceLanguage) return null;
  // Parse the numeric credit/hour amount from the grounded quote only.
  const numMatch = quote.match(/(\d+(?:\.\d+)?)\s*(?:ce|cde)?\s*(?:hour|credit)s?/);
  if (!numMatch) return null;
  const c = Number(numMatch[1]);
  if (!(typeof c === "number" && !isNaN(c) && c > 0)) return null;
  item.credits = c;
  delete item.source_quote;
  return item;
}