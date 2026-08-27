import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
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
    result = await mammoth.extractRawText({ arrayBuffer });
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
  conferences: "Conference"
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

    const { file_uri, file_name } = await req.json();
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
- Location should be "City, State" format.`,
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
        kept.push(stripQuote(item));
      }
      grounded[sectionKey] = kept;
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