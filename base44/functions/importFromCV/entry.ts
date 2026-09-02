import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { Buffer } from "node:buffer";
import mammoth from 'npm:mammoth@1.6.0';
import { classifyItem } from "../../shared/cvMatching.ts";

// ---------------------------------------------------------------------------
// Deterministic document text extraction
//
// The model never receives the binary CV. We extract plain text server-side
// first, gate on it, and only then ask the LLM to structure that text.
// PDF  -> Core.ExtractDataFromUploadedFile (platform document-extraction cap)
// DOCX -> mammoth.extractRawText (deterministic OOXML parse)
// ---------------------------------------------------------------------------

const MIN_MEANINGFUL_CHARS = 80;

async function extractPdfText(base44, signedUrl) {
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

async function extractDocxText(signedUrl) {
  // DEV: stage-specific error handling to identify the exact DOCX failure.
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

function detectFileType(fileName) {
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
function normalizeForGrounding(s) {
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

function isGrounded(quote, normalizedText) {
  const q = normalizeForGrounding(quote);
  if (!q) return false;
  return normalizedText.includes(q);
}

// Token-level grounding for short identifiers (license numbers, state
// abbreviations) where substring matching would false-positive — e.g. "ca"
// inside "california". Checks that the value appears as a standalone word.
function isTokenInText(token, normalizedText) {
  const t = normalizeForGrounding(token);
  if (!t) return false;
  return normalizedText.split(" ").includes(t);
}

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

function sanitizeItemDates(item) {
  if (!item || typeof item !== "object") return item;
  for (const k of DATE_KEYS) {
    if (k in item && isPlaceholderDate(item[k])) item[k] = "";
  }
  return item;
}

// Conservative credential-type normalization: accept an exact canonical match
// (case-insensitive) or an explicit alias from the profession's alias map.
// Anything else returns null (the caller drops the record). No fuzzy matching.
function normalizeCredentialType(rawType, recognized, aliases) {
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
function resolveJurisdiction(rawJur, stateNames, normalizedScope) {
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

// Diagnostic-only helpers (used solely when the caller passes debug: true).
// Each returns a short reason string explaining why an item would be rejected
// by its gate, or null if the item would pass. They never run in normal mode.
function credentialDropReason(item, recognized, aliases, needsJurisdiction, stateNames) {
  if (!item) return "item is null/undefined";
  if (!item.name) return "missing name";
  if (!item.credential_type) return "missing credential_type";
  const normalizedType = normalizeCredentialType(item.credential_type, recognized, aliases);
  if (!normalizedType) return `credential_type "${item.credential_type}" not recognized (no canonical or alias match)`;
  if (needsJurisdiction.includes(normalizedType)) {
    const scope = normalizeForGrounding(item.source_quote || "");
    const resolved = resolveJurisdiction(item.jurisdiction, stateNames, scope);
    if (!resolved) return `jurisdiction "${item.jurisdiction || "(empty)"}" not supported by this credential's own source_quote for ${normalizedType}`;
  }
  return null;
}

function ceDropReason(item) {
  if (!item) return "item is null/undefined";
  if (!item.title) return "missing title";
  const quote = normalizeForGrounding(item.source_quote || "");
  if (!quote) return "missing or empty source_quote";
  const ceLanguage = /\b(?:ce|cde)\s*(?:hour|credit)s?\b/.test(quote)
    || /\b(?:hour|credit)s?\s*(?:ce|cde)\b/.test(quote)
    || /\bcontinuing\s+education\b/.test(quote);
  if (!ceLanguage) return "no explicit CE/CDE/continuing-education language in source_quote";
  const numMatch = quote.match(/(\d+(?:\.\d+)?)\s*(?:ce|cde)?\s*(?:hour|credit)s?/);
  if (!numMatch) return "no numeric credit/hour amount found in source_quote";
  const c = Number(numMatch[1]);
  if (!(typeof c === "number" && !isNaN(c) && c > 0)) return `parsed credit amount is not a positive number (${c})`;
  return null;
}

// ---------------------------------------------------------------------------
// Extraction schema — every record carries a verbatim source_quote that must
// exist in the extracted document text, or the record is rejected.
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    profile: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        credentials_string: { type: "string" },
        specialty: { type: "string" },
        bio: { type: "string" },
        location: { type: "string" },
        source_quote: { type: "string", description: "A short verbatim excerpt copied directly from the source text that supports this profile. Must be exact text that appears in the source document text." }
      }
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: "string" },
          field_of_study: { type: "string" },
          institution: { type: "string" },
          location: { type: "string" },
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          completed: { type: "boolean" },
          honors: { type: "string" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    career_history: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position_title: { type: "string" },
          organization: { type: "string" },
          organization_type: { type: "string" },
          location: { type: "string" },
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD or null if current" },
          current: { type: "boolean" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    memberships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          organization: { type: "string" },
          membership_type: { type: "string" },
          role: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          current: { type: "boolean" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    leadership: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          organization: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          current: { type: "boolean" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    research: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          role: { type: "string" },
          institution: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    presentations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          event: { type: "string" },
          date: { type: "string" },
          type: { type: "string" },
          location: { type: "string" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    volunteering: {
      type: "array",
      items: {
        type: "object",
        properties: {
          organization: { type: "string" },
          role: { type: "string" },
          cause: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          current: { type: "boolean" },
          description: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    conferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          organization: { type: "string" },
          start_date: { type: "string" },
          location: { type: "string" },
          attendance: { type: "string" },
          notes: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    credentials: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          credential_type: { type: "string" },
          issuing_body: { type: "string" },
          license_number: { type: "string" },
          issue_date: { type: "string", description: "YYYY-MM-DD" },
          expiration_date: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", enum: ["active", "expiring", "expired", "pending", "inactive"] },
          jurisdiction: { type: "string", description: "US state abbreviation, e.g. CA" },
          notes: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    },
    continuing_education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          provider: { type: "string" },
          category: { type: "string" },
          ce_type: { type: "string" },
          credits: { type: "number", description: "Numeric CE/CDE credit or hour amount stated in the source text. Must be > 0." },
          completion_date: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", enum: ["completed", "in_progress", "planned"] },
          notes: { type: "string" },
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    }
  }
};

const ENTITY_MAP = {
  education: "Education",
  career_history: "CareerHistory",
  memberships: "Membership",
  leadership: "Leadership",
  research: "Research",
  presentations: "Presentation",
  volunteering: "Volunteering",
  conferences: "Conference",
  credentials: "Credential",
  continuing_education: "ContinuingEducation"
};

const PROFILE_FIELDS = ["full_name", "credentials_string", "specialty", "bio", "location"];

function stripQuote(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const { source_quote, ...rest } = obj;
  return rest;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_uri, file_name, profession, credential_types, jurisdiction_required_types, state_names, credential_type_aliases, debug } = await req.json();
    const debugMode = debug === true;
    if (!file_uri) return Response.json({ error: 'file_uri is required' }, { status: 400 });

    // 1. File-type safety: only PDF and DOCX are accepted.
    const fileType = detectFileType(file_name);
    if (!fileType) {
      return Response.json(
        { error: 'Unsupported file type. Please upload a PDF or DOCX file.' },
        { status: 422 }
      );
    }

    // Mint a short-lived signed URL only so the server can read the private file.
    // The signed URL is never persisted on any Passport record and never sent to the LLM.
    let signed_url;
    try {
      ({ signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 300 }));
    } catch (e) {
      return Response.json({ error: `[DOCX stage: CreateFileSignedUrl] ${e?.message || String(e)}` }, { status: 500 });
    }

    // 2. Deterministic text extraction (no LLM).
    let documentText = "";
    if (fileType === "pdf") {
      documentText = await extractPdfText(base44, signed_url);
    } else {
      documentText = await extractDocxText(signed_url);
    }

    // 3. Hard readability gate: do not call the LLM unless we have real text.
    const meaningful = (documentText.match(/[a-zA-Z0-9]/g) || []).length;
    if (!documentText || meaningful < MIN_MEANINGFUL_CHARS) {
      return Response.json(
        { error: "We couldn't reliably read this document. Please try a text-based PDF or DOCX file." },
        { status: 422 }
      );
    }

    const normalizedText = normalizeForGrounding(documentText);

    // 4. The LLM structures ONLY the extracted text. No binary file is passed.
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare career data extraction specialist. You are given the plain text content of a CV/resume document that was already extracted deterministically. Extract career information from ONLY this text into the exact JSON schema provided.

SOURCE DOCUMENT TEXT:
"""
${documentText}
"""

CRITICAL RULES:
- Extract ONLY information directly supported by the supplied document text above.
- Never infer, invent, complete, or supplement missing career information.
- If information is not present in the text, leave the field empty or omit the record.
- If the supplied source text is insufficient for a section, return an empty array for that section rather than generating plausible information.
- For every item and for the profile, include a "source_quote": a short verbatim excerpt copied directly from the source text above that supports the extracted information. The quote MUST be exact text that appears verbatim in the source document text.
- Dates must be in YYYY-MM-DD format (use YYYY-01-01 if only year is known, YYYY-MM-01 if only month+year). Never emit placeholder dates such as 0000-00-00, "unknown", "not stated", or "not provided" — if a date is not stated in the source text, leave that date field empty.
- If a role says "Present" or is ongoing, set current: true and omit end_date.
- For degrees, include the full degree name (e.g. "Doctor of Dental Medicine (DMD)").
- For career_history, include residencies, fellowships, internships, and employment.
- For the profile, extract name, credentials (e.g. "DMD"), specialty, and a professional summary/bio if present.
- Do NOT include personal contact info (phone, email, home address) in any field.
- Location should be "City, State" format.
- Credentials: extract ONLY professional licenses, permits, registrations, board certifications, and similar practice-authority credentials (e.g. state dental license, DEA registration, BLS/ACLS/PALS, NPI, sedation permit). Academic degrees such as DDS, DMD, BDS, or PhD are Education, NOT Credentials — never place them in credentials.
- Scan the ENTIRE document for credentials, including short one-line certification entries (e.g. "BLS Provider — American Heart Association — Expiration: 2028-08-01", "ACLS", "PALS", "CPR", "DEA Registration", "NPI"). These often appear in a certifications/skills section, a header, or as a brief bullet. Capture every credential that names a recognized type, even when the entry is short or lacks a license number. Do not skip a credential merely because its line is terse.
- For credentials, set credential_type to one of exactly these values: ${(credential_types && credential_types.length) ? credential_types.join(", ") : "the recognized profession credential types"}. Do not invent or use any credential_type not in that list. Map variants to the closest canonical type (e.g. "BLS Provider" or "Basic Life Support" -> "BLS Certification"; "ACLS" -> "ACLS Certification"; "PALS" -> "PALS Certification"; "CPR" -> "CPR Certification"; "DEA" or "DEA Number" -> "DEA Registration"; "NPI" -> "NPI Number").
- For credentials that require a state/jurisdiction (e.g. State Dental License, Sedation Permit, Nitrous Oxide Permit), only create the record if that credential's OWN source text explicitly names the state, and set jurisdiction to the US state abbreviation. The state MUST appear within the source_quote you provide for that credential — never infer a state from a different line elsewhere in the document. If the state is not stated in that credential's own text, omit that credential entirely.
- For credentials, set status only when the text clearly indicates a lifecycle state (active, expiring, expired, pending, inactive); otherwise leave status empty. Never invent license numbers or expiration dates — only populate fields the text actually provides. If an expiration date is stated, record it; otherwise leave expiration_date empty.
- Continuing Education: place an item here ONLY if the source text explicitly states a CE/CDE credit or hour amount (e.g. "16 CE hours", "3 CDE credits", "8-hour continuing education course"). A conference, course, certification, or training item without an explicit credit/hour amount must NOT be placed in continuing_education — leave it in conferences, presentations, or career_history as appropriate. Always set credits to the numeric amount stated in the text.`,
      response_json_schema: EXTRACTION_SCHEMA
    });

    const raw = result || {};

    // 5. Grounding validation: drop any record whose source_quote is not found
    // verbatim in the extracted document text. Quotes are not persisted.
    const grounded = {};

    // Profile: require a grounded quote; also require full_name (if present) to
    // appear in the source text. Otherwise return an empty profile.
    let profile = {};
    if (raw.profile && typeof raw.profile === "object") {
      const p = raw.profile;
      if (isGrounded(p.source_quote, normalizedText)) {
        profile = { ...p };
        // Drop full_name if it isn't actually in the document text.
        if (p.full_name && !normalizedText.includes(normalizeForGrounding(p.full_name))) {
          delete profile.full_name;
        }
        delete profile.source_quote;
      }
    }
    grounded.profile = profile;

    const drops = [];
    for (const sectionKey of Object.keys(ENTITY_MAP)) {
      const items = Array.isArray(raw[sectionKey]) ? raw[sectionKey] : [];
      const kept = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (!isGrounded(item.source_quote, normalizedText)) {
          if (debugMode && (sectionKey === "credentials" || sectionKey === "continuing_education")) {
            drops.push({
              stage: "grounding",
              section: sectionKey,
              item: { ...item },
              reason: "source_quote not found verbatim in extracted document text"
            });
          }
          continue; // unsupported -> reject
        }
        // Sanitize placeholder dates on a copy so sentinel values are never
        // persisted and the raw LLM output (used for debug) stays pristine.
        // Keep the source_quote on CE and credential items so their gates can
        // verify record-specific evidence (CE credit language; a state-issued
        // credential's own jurisdiction). Quotes are stripped after gating.
        const keepQuote = sectionKey === "continuing_education" || sectionKey === "credentials";
        const keptItem = keepQuote ? { ...item } : stripQuote(item);
        sanitizeItemDates(keptItem);
        kept.push(keptItem);
      }
      grounded[sectionKey] = kept;
    }

    // Diagnostic snapshot: deep copy of grounded state after grounding, before gates.
    // The gates below mutate item objects in place, so this copy preserves the
    // pre-gate values (e.g. the LLM's original credential_type before normalization).
    const groundedPreGate = debugMode ? JSON.parse(JSON.stringify(grounded)) : null;

    // Section-specific trust gates (run after grounding, before dedup).

    // Credentials: constrain to recognized profession credential types;
    // enforce jurisdiction for state-issued credentials; blank any license
    // number not actually present as a token in the source text.
    if (Array.isArray(grounded.credentials)) {
      const recognized = Array.isArray(credential_types) ? credential_types : null;
      const aliases = credential_type_aliases && typeof credential_type_aliases === "object" ? credential_type_aliases : null;
      const needsJurisdiction = Array.isArray(jurisdiction_required_types) ? jurisdiction_required_types : [];
      const stateNames = state_names && typeof state_names === "object" ? state_names : null;
      const preGateCreds = debugMode ? [...grounded.credentials] : null;
      grounded.credentials = grounded.credentials.filter((item) => {
        if (!item || !item.name || !item.credential_type) return false;
        const normalizedType = normalizeCredentialType(item.credential_type, recognized, aliases);
        if (!normalizedType) return false; // unsupported type
        item.credential_type = normalizedType;
        if (needsJurisdiction.includes(normalizedType)) {
          // A state can only be assigned to a state-issued credential if that
          // credential's OWN source_quote supports the state — never because
          // the same document mentions the state on another line.
          const scope = normalizeForGrounding(item.source_quote || "");
          const resolved = resolveJurisdiction(item.jurisdiction, stateNames, scope);
          if (!resolved) return false;
          item.jurisdiction = resolved;
        }
        if (item.license_number && !isTokenInText(item.license_number, normalizedText)) {
          item.license_number = "";
        }
        return true;
      });
      if (debugMode && preGateCreds) {
        for (const item of preGateCreds) {
          if (!grounded.credentials.includes(item)) {
            drops.push({
              stage: "credential_gate",
              section: "credentials",
              item: { ...item },
              reason: credentialDropReason(item, recognized, aliases, needsJurisdiction, stateNames)
            });
          }
        }
      }
      // Quotes were preserved through gating for record-scoped jurisdiction
      // checks; strip them now so they are never persisted.
      grounded.credentials = grounded.credentials.map((item) => stripQuote(item));
    }

    // Continuing Education: only when the text explicitly states a positive
    // CE/CDE credit/hour amount. The LLM is instructed to route accordingly;
    // this gate is the backstop that drops creditless items.
    if (Array.isArray(grounded.continuing_education)) {
      const preGateCE = debugMode ? [...grounded.continuing_education] : null;
      grounded.continuing_education = grounded.continuing_education.filter((item) => {
        if (!item || !item.title) return false;
        const quote = normalizeForGrounding(item.source_quote || "");
        if (!quote) return false;
        // Require explicit CE/CDE hour/credit language in the grounded quote.
        const ceLanguage = /\b(?:ce|cde)\s*(?:hour|credit)s?\b/.test(quote)
          || /\b(?:hour|credit)s?\s*(?:ce|cde)\b/.test(quote)
          || /\bcontinuing\s+education\b/.test(quote);
        if (!ceLanguage) return false;
        // Parse the numeric credit/hour amount from the grounded quote only.
        const numMatch = quote.match(/(\d+(?:\.\d+)?)\s*(?:ce|cde)?\s*(?:hour|credit)s?/);
        if (!numMatch) return false;
        const c = Number(numMatch[1]);
        if (!(typeof c === "number" && !isNaN(c) && c > 0)) return false;
        item.credits = c;
        delete item.source_quote;
        return true;
      });
      if (debugMode && preGateCE) {
        for (const item of preGateCE) {
          if (!grounded.continuing_education.includes(item)) {
            drops.push({
              stage: "ce_gate",
              section: "continuing_education",
              item: { ...item },
              reason: ceDropReason(item)
            });
          }
        }
      }
    }

    const import_batch_id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());

    // 6. Only grounded items enter the existing duplicate-detection workflow.
    const matches = {};
    for (const sectionKey of Object.keys(ENTITY_MAP)) {
      const items = grounded[sectionKey];
      if (!items.length) continue;
      const entityName = ENTITY_MAP[sectionKey];
      let existing = [];
      try {
        existing = await base44.asServiceRole.entities[entityName].filter({ created_by_id: user.id });
      } catch (_e) {
        existing = [];
      }
      matches[sectionKey] = items.map((item, idx) => ({
        index: idx,
        ...classifyItem(sectionKey, item, existing)
      }));
    }

    const response = {
      extracted: grounded,
      matches,
      import_batch_id,
      source_document_name: file_name || ""
    };
    if (debugMode) {
      response.diagnostic = {
        raw_llm_output: raw,
        post_grounding_pre_gate: groundedPreGate,
        post_gate: grounded,
        drops
      };
    }
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}