import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  MIN_MEANINGFUL_CHARS, detectFileType, extractPdfText, extractDocxText,
  normalizeForGrounding, isGrounded, isTokenInText, phraseTokensInText,
  sanitizeItemDates, sanitizeItemStrings, normalizeCredentialType,
  buildCredentialFallback, resolveJurisdiction, yearInScope, JAN1_RE,
} from "../../shared/documentCapture.ts";

// ---------------------------------------------------------------------------
// captureCredentialFromDocument
//
// Document-backed credential capture (V1): given a private PDF/DOCX file plus
// the Dentistry profession config, deterministically extract the document
// text, ask the LLM to propose credential(s) from ONLY that text, then run
// PER-FIELD grounding validation: each populated field (name, credential_type,
// issuing_body, license_number, jurisdiction, issue_date, expiration_date,
// status) must be supported by its own short verbatim source quote, and is
// validated only against that quote using the existing credential-type,
// jurisdiction, license-number, date, placeholder, and sanitization
// safeguards. A field that cannot be grounded is left blank rather than
// rejecting an otherwise valid Credential. Returns at most ONE proposed
// Credential plus source metadata for the user to review in the standard
// Credential form. This function never writes to the database — it only
// proposes. No renewal/update behavior.
//
// NOTE: this per-field grounding model is local to document capture. CV Import
// (importFromCV) continues to use the shared record-scoped validateCredentialItem
// helper unchanged.
// ---------------------------------------------------------------------------

const CREDENTIAL_SCHEMA = {
  type: "object",
  properties: {
    credentials: {
      type: "array",
      description: "Professional practice-authority credentials found in the document.",
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
          source_quotes: {
            type: "object",
            description: "A map of field name to a short verbatim quote copied directly from the source text that directly supports that specific field's value. Required keys: name, credential_type, issuing_body, license_number, jurisdiction, issue_date, expiration_date, status. Each quote MUST be exact text that appears verbatim in the source document text. If a field is empty, its quote may be empty.",
            properties: {
              name: { type: "string" },
              credential_type: { type: "string" },
              issuing_body: { type: "string" },
              license_number: { type: "string" },
              jurisdiction: { type: "string" },
              issue_date: { type: "string" },
              expiration_date: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      }
    }
  }
};

const FIELD_KEYS = ["name", "credential_type", "issuing_body", "license_number", "jurisdiction", "issue_date", "expiration_date", "status"];

// True if a field's value is directly supported by its own quote: the value's
// normalized tokens appear consecutively (multi-token) or as a standalone
// token (single-token) within the normalized quote scope. Not fuzzy.
function valueSupportedByQuote(value, quote) {
  const qScope = normalizeForGrounding(quote);
  if (!qScope) return false;
  const vNorm = normalizeForGrounding(value);
  if (!vNorm) return false;
  if (vNorm.includes(" ")) return phraseTokensInText(value, qScope);
  return isTokenInText(value, qScope);
}

// Pick a representative provenance quote for a candidate (used for the returned
// source_quote metadata and the debug panel's quote line).
function representativeQuote(quotes) {
  if (!quotes || typeof quotes !== "object") return "";
  for (const k of ["name", "credential_type", "issuing_body", "license_number", "jurisdiction", "issue_date", "expiration_date", "status"]) {
    if (quotes[k]) return quotes[k];
  }
  return "";
}

// Per-field grounding validation. For each populated field, require its own
// verbatim source quote (grounded in the document) and validate the value only
// against that quote using the existing safeguards. Ungrounded fields are
// blanked; the credential is dropped only if name/credential_type become empty
// or a required jurisdiction cannot be grounded. Returns:
//   { ok, kept, stage, reason, dateNotes, licenseNote, fieldNotes }
// `kept` is the validated credential shape (no source_quotes).
function validatePerField(item, ctx) {
  const { recognized, aliases, needsJurisdiction, stateNames, normalizedText } = ctx || {};
  const quotes = (item && item.source_quotes && typeof item.source_quotes === "object") ? item.source_quotes : {};

  // Sanitize placeholders first so they never reach grounding.
  const sanitized = { ...item };
  sanitizeItemDates(sanitized);
  sanitizeItemStrings(sanitized);

  const kept = {};
  const dateNotes = [];
  let licenseNote = null;
  const fieldNotes = [];

  // credential_type: the quote must be grounded in the document; the type must
  // be recognized. (The canonical type string may not appear verbatim when an
  // alias maps to it, so we do not require the value in the quote — only that
  // the quote is a real verbatim excerpt and the type is recognized.)
  const rawType = sanitized.credential_type || "";
  const typeQuote = quotes.credential_type || "";
  if (rawType && isGrounded(typeQuote, normalizedText)) {
    const normalizedType = normalizeCredentialType(rawType, recognized, aliases);
    if (normalizedType) {
      kept.credential_type = normalizedType;
    } else {
      fieldNotes.push(`credential_type "${rawType}" blanked: not a recognized type`);
    }
  } else if (rawType) {
    fieldNotes.push("credential_type blanked: its source quote is not grounded in the document");
  }

  // name: quote grounded + value supported by the quote.
  if (sanitized.name) {
    const q = quotes.name || "";
    if (isGrounded(q, normalizedText) && valueSupportedByQuote(sanitized.name, q)) {
      kept.name = sanitized.name;
    } else {
      fieldNotes.push("name blanked: not grounded by its own source quote");
    }
  }

  // issuing_body: quote grounded + value supported by the quote.
  if (sanitized.issuing_body) {
    const q = quotes.issuing_body || "";
    if (isGrounded(q, normalizedText) && valueSupportedByQuote(sanitized.issuing_body, q)) {
      kept.issuing_body = sanitized.issuing_body;
    } else {
      fieldNotes.push("issuing_body blanked: not grounded by its own source quote");
    }
  }

  // status: quote grounded + value supported by the quote (token in quote).
  if (sanitized.status) {
    const q = quotes.status || "";
    if (isGrounded(q, normalizedText) && valueSupportedByQuote(sanitized.status, q)) {
      kept.status = sanitized.status;
    } else {
      fieldNotes.push("status blanked: not grounded by its own source quote");
    }
  }

  // license_number: token present in its own quote scope (stronger than
  // whole-document token matching).
  if (sanitized.license_number) {
    const q = quotes.license_number || "";
    if (isGrounded(q, normalizedText) && isTokenInText(sanitized.license_number, normalizeForGrounding(q))) {
      kept.license_number = sanitized.license_number;
    } else {
      licenseNote = `license_number "${sanitized.license_number}" blanked: not present as a token in its own source quote`;
    }
  }

  // jurisdiction: resolve against its own quote scope (record-scoped to the
  // field's quote, not the whole document).
  if (sanitized.jurisdiction) {
    const q = quotes.jurisdiction || "";
    if (isGrounded(q, normalizedText)) {
      const resolved = resolveJurisdiction(sanitized.jurisdiction, stateNames, normalizeForGrounding(q));
      if (resolved) {
        kept.jurisdiction = resolved;
      } else {
        fieldNotes.push("jurisdiction blanked: could not be resolved/grounded in its own source quote");
      }
    } else {
      fieldNotes.push("jurisdiction blanked: its source quote is not grounded in the document");
    }
  }

  // issue_date / expiration_date: year must appear in the field's own quote
  // scope, plus the January-1 safeguard against that quote.
  for (const dateKey of ["issue_date", "expiration_date"]) {
    const d = sanitized[dateKey];
    if (!d) continue;
    const q = quotes[dateKey] || "";
    if (!isGrounded(q, normalizedText)) {
      dateNotes.push(`${dateKey} "${d}" blanked: its source quote is not grounded in the document`);
      continue;
    }
    const qScope = normalizeForGrounding(q);
    const yearMatch = String(d).match(/(\d{4})/);
    const year = yearMatch ? yearMatch[1] : null;
    if (!yearInScope(year, qScope)) {
      dateNotes.push(`${dateKey} "${d}" blanked: year ${year} not found in this field's own source quote`);
      continue;
    }
    if (/^\d{4}-01-01$/.test(String(d).trim()) && !JAN1_RE.test(q)) {
      dateNotes.push(`${dateKey} "${d}" blanked: January-1 safeguard (no Jan-1 literal in this field's source quote)`);
      continue;
    }
    kept[dateKey] = d;
  }

  // notes: free text, no grounding required.
  if (sanitized.notes) kept.notes = sanitized.notes;

  // Drop if required fields are missing after grounding.
  if (!kept.name || !kept.credential_type) {
    return { ok: false, kept, stage: "missing_required_field", reason: "name or credential_type could not be grounded", dateNotes, licenseNote, fieldNotes };
  }
  // Drop if a state-issued credential lost its jurisdiction.
  if (Array.isArray(needsJurisdiction) && needsJurisdiction.includes(kept.credential_type) && !kept.jurisdiction) {
    return { ok: false, kept, stage: "jurisdiction_not_resolved", reason: `jurisdiction could not be grounded for "${kept.credential_type}"`, dateNotes, licenseNote, fieldNotes };
  }

  return { ok: true, kept, stage: "passed", reason: "credential survived per-field grounding gates", dateNotes, licenseNote, fieldNotes };
}

// Normalize fallback-synthesized records (which carry a single source_quote)
// into the per-field source_quotes map shape expected by validatePerField.
function adaptFallbackItem(fb) {
  if (!fb || !fb.source_quote) return fb;
  const q = fb.source_quote;
  const source_quotes = {};
  for (const k of FIELD_KEYS) {
    if (fb[k] !== undefined && fb[k] !== "") source_quotes[k] = q;
  }
  const { source_quote, ...rest } = fb;
  return { ...rest, source_quotes };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      file_uri, file_name, profession,
      credential_types, jurisdiction_required_types, state_names, credential_type_aliases,
      debug,
    } = await req.json();
    const debugMode = debug === true;

    if (!file_uri) return Response.json({ error: 'file_uri is required' }, { status: 400 });
    if (!file_name) return Response.json({ error: 'file_name is required' }, { status: 400 });

    const professionKey = profession || "dentistry";

    // 1. File-type safety: only PDF and DOCX are accepted.
    const fileType = detectFileType(file_name);
    if (!fileType) {
      return Response.json(
        { error: 'Unsupported file type. Please upload a PDF or DOCX file.' },
        { status: 422 }
      );
    }

    // 2. Mint a short-lived signed URL only so the server can read the private
    // file. The signed URL is never persisted and never sent to the LLM.
    let signed_url;
    try {
      ({ signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 300 }));
    } catch (e) {
      return Response.json({ error: `[CreateFileSignedUrl] ${e?.message || String(e)}` }, { status: 500 });
    }

    // 3. Deterministic text extraction (no LLM).
    let documentText = "";
    if (fileType === "pdf") {
      documentText = await extractPdfText(base44, signed_url);
    } else {
      documentText = await extractDocxText(signed_url);
    }

    // 4. Hard readability gate: do not call the LLM unless we have real text.
    const meaningful = (documentText.match(/[a-zA-Z0-9]/g) || []).length;
    if (!documentText || meaningful < MIN_MEANINGFUL_CHARS) {
      return Response.json(
        { error: "We couldn't reliably read this document. Please try a text-based PDF or DOCX file." },
        { status: 422 }
      );
    }

    const normalizedText = normalizeForGrounding(documentText);
    const recognized = Array.isArray(credential_types) ? credential_types : null;
    const aliases = credential_type_aliases && typeof credential_type_aliases === "object" ? credential_type_aliases : null;
    const needsJurisdiction = Array.isArray(jurisdiction_required_types) ? jurisdiction_required_types : [];
    const stateNamesMap = state_names && typeof state_names === "object" ? state_names : null;
    const ctx = { recognized, aliases, needsJurisdiction, stateNames: stateNamesMap, normalizedText };

    // 5. The LLM structures ONLY the extracted text. No binary file is passed.
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare credential extraction specialist. You are given the plain text content of a professional document (e.g. a license, renewal notice, certification card, or registration document) that was already extracted deterministically. Extract professional credentials from ONLY this text into the exact JSON schema provided.

SOURCE DOCUMENT TEXT:
"""
${documentText}
"""

CRITICAL RULES:
- Extract ONLY information directly supported by the supplied document text above.
- Never infer, invent, complete, or supplement missing information.
- If information is not present in the text, leave the field empty or omit the record.
- For EVERY populated field, provide a "source_quotes" object mapping each field name to a short verbatim excerpt copied directly from the source text above that directly supports that specific field's value. Each quote MUST be exact text that appears verbatim in the source document text. The quote for a field must contain that field's value (e.g. the quote for license_number must contain the license number; the quote for issue_date must contain the issue date). If a field is empty, leave its quote empty.
- Dates must be in YYYY-MM-DD format (use YYYY-01-01 if only year is known, YYYY-MM-01 if only month+year). Never emit placeholder dates such as 0000-00-00, "unknown", "not stated", or "not provided" — if a date is not stated in the source text, leave that date field empty.
- Credentials: extract ONLY professional licenses, permits, registrations, board certifications, and similar practice-authority credentials (e.g. state dental license, DEA registration, BLS/ACLS/PALS, NPI, sedation permit). Academic degrees such as DDS, DMD, BDS, or PhD are NOT Credentials — never include them.
- Scan the ENTIRE document for credentials, including short one-line certification entries (e.g. "BLS Provider — American Heart Association — Expiration: 2028-08-01", "ACLS", "PALS", "CPR", "DEA Registration", "NPI"). Capture every credential that names a recognized type, even when the entry is short or lacks a license number. Do not skip a credential merely because its line is terse.
- Set credential_type to one of exactly these values: ${(recognized && recognized.length) ? recognized.join(", ") : "the recognized profession credential types"}. Do not invent or use any credential_type not in that list. Map variants to the closest canonical type (e.g. "BLS Provider" or "Basic Life Support" -> "BLS Certification"; "ACLS" -> "ACLS Certification"; "PALS" -> "PALS Certification"; "CPR" -> "CPR Certification"; "DEA" or "DEA Number" -> "DEA Registration"; "NPI" -> "NPI Number").
- For credentials that require a state/jurisdiction (e.g. State Dental License, Sedation Permit, Nitrous Oxide Permit), only create the record if that credential's OWN source text explicitly names the state, and set jurisdiction to the US state abbreviation. The state MUST appear within the source_quotes.jurisdiction you provide for that credential — never infer a state from a different line elsewhere in the document. If the state is not stated in that credential's own text, omit that credential entirely.
- Set status only when the text clearly indicates a lifecycle state (active, expiring, expired, pending, inactive); otherwise leave status empty. Never invent license numbers or expiration dates — only populate fields the text actually provides.`,
      response_json_schema: CREDENTIAL_SCHEMA
    });

    const raw = result || {};
    let candidates = Array.isArray(raw.credentials) ? raw.credentials : [];

    // 5b. Deterministic fallback for missed BLS/ACLS/PALS/CPR lines: synthesize
    // a credential from the actual document line when the LLM omitted that
    // canonical type entirely. Synthesized records are adapted to the
    // per-field source_quotes shape and flow through the same per-field gates.
    {
      const alreadyPresent = new Set(
        candidates.map((c) => normalizeCredentialType(c?.credential_type, recognized, aliases)).filter(Boolean)
      );
      const fallback = buildCredentialFallback(documentText, aliases, recognized, alreadyPresent);
      if (fallback.length) candidates = [...candidates, ...adaptFallbackItems(fallback)];
    }

    // 6. Per-field grounding validation: each populated field must be supported
    //    by its own grounded quote. Ungrounded fields are blanked; the record is
    //    dropped only if name/credential_type or a required jurisdiction cannot
    //    be grounded.
    const validated = [];
    const validatedQuotes = [];
    const debugCandidates = debugMode ? [] : null;
    for (const item of candidates) {
      if (!item || typeof item !== "object") continue;
      const quotes = (item.source_quotes && typeof item.source_quotes === "object") ? item.source_quotes : {};
      const repQuote = representativeQuote(quotes);
      const entry = debugMode ? { raw: { ...item }, source_quote: repQuote, source_quotes: { ...quotes } } : null;

      const res = validatePerField(item, ctx);
      if (entry) {
        entry.postGrounding = { ...res.kept, source_quotes: { ...quotes } };
        entry.stage = res.stage;
        entry.reason = res.reason;
        if (res.dateNotes && res.dateNotes.length) entry.dateNotes = res.dateNotes;
        if (res.licenseNote) entry.licenseNote = res.licenseNote;
        if (res.fieldNotes && res.fieldNotes.length) entry.fieldNotes = res.fieldNotes;
        if (res.ok) entry.validated = { ...res.kept };
        debugCandidates.push(entry);
      }
      if (!res.ok) continue;

      validated.push(res.kept);
      validatedQuotes.push(repQuote);
    }

    if (!validated.length) {
      if (debugMode) {
        return Response.json({
          error: "No supported credential could be extracted from this document.",
          credential: null,
          debug: { candidates: debugCandidates, candidateCount: candidates.length, rawResult: raw, textLength: documentText.length },
        }, { status: 200 });
      }
      return Response.json(
        { error: "No supported credential could be extracted from this document." },
        { status: 422 }
      );
    }

    // 7. Propose ONE credential. Prefer the most complete record (one that
    //    names a license/ID number or an expiration date); otherwise take the
    //    first validated candidate.
    let pickIdx = validated.findIndex((c) => c.license_number || c.expiration_date);
    if (pickIdx < 0) pickIdx = 0;
    const credential = { ...validated[pickIdx], profession: professionKey };

    return Response.json({
      credential,
      source_quote: validatedQuotes[pickIdx] || "",
      source_document_name: file_name || "",
      file_uri,
      ...(debugMode ? { debug: { candidates: debugCandidates, candidateCount: candidates.length } } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function adaptFallbackItems(fallback) {
  return (fallback || []).map(adaptFallbackItem).filter(Boolean);
}