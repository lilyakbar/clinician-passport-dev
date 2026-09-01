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
// forms appears as a token in the grounded source text; returns the canonical
// abbreviation (or null if it cannot be resolved/grounded).
function resolveJurisdiction(rawJur, stateNames, normalizedText) {
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
  const inText = isTokenInText(abbr, normalizedText)
    || isTokenInText(stateNames[abbr], normalizedText);
  if (!inText) return null;
  return abbr;
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

    const { file_uri, file_name, profession, credential_types, jurisdiction_required_types, state_names, credential_type_aliases } = await req.json();
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
- Dates must be in YYYY-MM-DD format (use YYYY-01-01 if only year is known, YYYY-MM-01 if only month+year).
- If a role says "Present" or is ongoing, set current: true and omit end_date.
- For degrees, include the full degree name (e.g. "Doctor of Dental Medicine (DMD)").
- For career_history, include residencies, fellowships, internships, and employment.
- For the profile, extract name, credentials (e.g. "DMD"), specialty, and a professional summary/bio if present.
- Do NOT include personal contact info (phone, email, home address) in any field.
- Location should be "City, State" format.
- Credentials: extract ONLY professional licenses, permits, registrations, board certifications, and similar practice-authority credentials (e.g. state dental license, DEA registration, BLS/ACLS/PALS, NPI, sedation permit). Academic degrees such as DDS, DMD, BDS, or PhD are Education, NOT Credentials — never place them in credentials.
- For credentials, set credential_type to one of exactly these values: ${(credential_types && credential_types.length) ? credential_types.join(", ") : "the recognized profession credential types"}. Do not invent or use any credential_type not in that list.
- For credentials that require a state/jurisdiction (e.g. State Dental License, Sedation Permit, Nitrous Oxide Permit), only create the record if the source text explicitly names the state, and set jurisdiction to the US state abbreviation. If the state is not stated, omit that credential entirely.
- For credentials, set status only when the text clearly indicates a lifecycle state (active, expiring, expired, pending, inactive); otherwise leave status empty. Never invent license numbers or expiration dates — only populate fields the text actually provides.
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

    for (const sectionKey of Object.keys(ENTITY_MAP)) {
      const items = Array.isArray(raw[sectionKey]) ? raw[sectionKey] : [];
      const kept = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (!isGrounded(item.source_quote, normalizedText)) continue; // unsupported -> reject
        // Keep the source_quote on CE items so the CE gate can verify explicit
        // credit/hour language in the grounded text; it is stripped after gating.
        kept.push(sectionKey === "continuing_education" ? { ...item } : stripQuote(item));
      }
      grounded[sectionKey] = kept;
    }

    // Section-specific trust gates (run after grounding, before dedup).

    // Credentials: constrain to recognized profession credential types;
    // enforce jurisdiction for state-issued credentials; blank any license
    // number not actually present as a token in the source text.
    if (Array.isArray(grounded.credentials)) {
      const recognized = Array.isArray(credential_types) ? credential_types : null;
      const aliases = credential_type_aliases && typeof credential_type_aliases === "object" ? credential_type_aliases : null;
      const needsJurisdiction = Array.isArray(jurisdiction_required_types) ? jurisdiction_required_types : [];
      const stateNames = state_names && typeof state_names === "object" ? state_names : null;
      grounded.credentials = grounded.credentials.filter((item) => {
        if (!item || !item.name || !item.credential_type) return false;
        const normalizedType = normalizeCredentialType(item.credential_type, recognized, aliases);
        if (!normalizedType) return false; // unsupported type
        item.credential_type = normalizedType;
        if (needsJurisdiction.includes(normalizedType)) {
          const resolved = resolveJurisdiction(item.jurisdiction, stateNames, normalizedText);
          if (!resolved) return false;
          item.jurisdiction = resolved;
        }
        if (item.license_number && !isTokenInText(item.license_number, normalizedText)) {
          item.license_number = "";
        }
        return true;
      });
    }

    // Continuing Education: only when the text explicitly states a positive
    // CE/CDE credit/hour amount. The LLM is instructed to route accordingly;
    // this gate is the backstop that drops creditless items.
    if (Array.isArray(grounded.continuing_education)) {
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

    return Response.json({
      extracted: grounded,
      matches,
      import_batch_id,
      source_document_name: file_name || ""
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}