import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  MIN_MEANINGFUL_CHARS, detectFileType, extractPdfText, extractDocxText,
  normalizeForGrounding, isGrounded, isLikelyTitleName, sanitizeItemDates,
  sanitizeItemStrings, normalizeCredentialType, buildCredentialFallback,
  validateCredentialItem, validateCeItem,
} from "../../shared/documentCapture.ts";
import { classifyItem } from "../../shared/cvMatching.ts";

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

    // 4b. Deterministic fallback for missed BLS/ACLS/PALS/CPR lines: synthesize
    // a credential from the actual document line when the LLM omitted that
    // canonical type entirely. Synthesized records flow through the same
    // grounding + credential gates below (including record-scoped date grounding).
    {
      const existingCreds = Array.isArray(raw.credentials) ? raw.credentials : [];
      const fbRecognized = Array.isArray(credential_types) ? credential_types : null;
      const fbAliases = credential_type_aliases && typeof credential_type_aliases === "object" ? credential_type_aliases : null;
      const alreadyPresent = new Set(
        existingCreds.map((c) => normalizeCredentialType(c?.credential_type, fbRecognized, fbAliases)).filter(Boolean)
      );
      const fallback = buildCredentialFallback(documentText, fbAliases, fbRecognized, alreadyPresent);
      if (fallback.length) raw.credentials = [...existingCreds, ...fallback];
    }

    // 5. Grounding validation: drop any record whose source_quote is not found
    // verbatim in the extracted document text. Quotes are not persisted.
    const grounded = {};

    // Profile: every field must be grounded in the Profile item's OWN
    // source_quote (not inferred from unrelated document content) and survive
    // placeholder/disclaimer sanitization. full_name additionally must pass the
    // title/header safeguards. If nothing genuine remains, the profile is empty
    // (no changes) rather than invented or generalized.
    let profile = {};
    if (raw.profile && typeof raw.profile === "object") {
      const p = raw.profile;
      const profQuote = normalizeForGrounding(p.source_quote || "");
      if (profQuote && isGrounded(p.source_quote, normalizedText)) {
        profile = { ...p };
        // full_name: keep only when the actual name appears in the profile's
        // own source_quote AND passes the title/header safeguards.
        if (p.full_name && (!profQuote.includes(normalizeForGrounding(p.full_name)) || isLikelyTitleName(p.full_name))) {
          delete profile.full_name;
        }
        // specialty, location, credentials_string, bio: keep only when that
        // specific value is directly supported by the profile's own source_quote.
        for (const f of ["specialty", "location", "credentials_string", "bio"]) {
          if (p[f] && !profQuote.includes(normalizeForGrounding(p[f]))) delete profile[f];
        }
        // Blank any remaining placeholder/disclaimer values (e.g. "None",
        // "Not provided", "This document contains fictional test data only.").
        sanitizeItemStrings(profile);
        delete profile.source_quote;
      }
    }
    grounded.profile = profile;

    for (const sectionKey of Object.keys(ENTITY_MAP)) {
      const items = Array.isArray(raw[sectionKey]) ? raw[sectionKey] : [];
      const kept = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (!isGrounded(item.source_quote, normalizedText)) {
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
        sanitizeItemStrings(keptItem);
        kept.push(keptItem);
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
      grounded.credentials = grounded.credentials
        .map((item) => validateCredentialItem(item, { recognized, aliases, needsJurisdiction, stateNames, normalizedText }))
        .filter(Boolean);
    }

    // Continuing Education: only when the text explicitly states a positive
    // CE/CDE credit/hour amount. The LLM is instructed to route accordingly;
    // this gate is the backstop that drops creditless items.
    if (Array.isArray(grounded.continuing_education)) {
      grounded.continuing_education = grounded.continuing_education
        .map((item) => validateCeItem(item))
        .filter(Boolean);
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
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}