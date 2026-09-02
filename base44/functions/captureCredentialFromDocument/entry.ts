import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  MIN_MEANINGFUL_CHARS, detectFileType, extractPdfText, extractDocxText,
  normalizeForGrounding, isGrounded, sanitizeItemDates, sanitizeItemStrings,
  normalizeCredentialType, buildCredentialFallback, validateCredentialItem,
} from "../../shared/documentCapture.ts";

// ---------------------------------------------------------------------------
// captureCredentialFromDocument
//
// Document-backed credential capture (V1): given a private PDF/DOCX file plus
// the Dentistry profession config, deterministically extract the document
// text, ask the LLM to propose credential(s) from ONLY that text, then run the
// exact same grounding / recognized-type / record-scoped jurisdiction /
// license-number / placeholder / credential-date safeguards used by
// importFromCV. Returns at most ONE proposed Credential plus source metadata
// for the user to review in the standard Credential form. This function never
// writes to the database — it only proposes. No renewal/update behavior.
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
          source_quote: { type: "string", description: "A short verbatim quote copied directly from the source text that supports this item. Must be exact text that appears in the source document text." }
        }
      }
    }
  }
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      file_uri, file_name, profession,
      credential_types, jurisdiction_required_types, state_names, credential_type_aliases,
    } = await req.json();

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
- For every item, include a "source_quote": a short verbatim excerpt copied directly from the source text above that supports the extracted information. The quote MUST be exact text that appears verbatim in the source document text.
- Dates must be in YYYY-MM-DD format (use YYYY-01-01 if only year is known, YYYY-MM-01 if only month+year). Never emit placeholder dates such as 0000-00-00, "unknown", "not stated", or "not provided" — if a date is not stated in the source text, leave that date field empty.
- Credentials: extract ONLY professional licenses, permits, registrations, board certifications, and similar practice-authority credentials (e.g. state dental license, DEA registration, BLS/ACLS/PALS, NPI, sedation permit). Academic degrees such as DDS, DMD, BDS, or PhD are NOT Credentials — never include them.
- Scan the ENTIRE document for credentials, including short one-line certification entries (e.g. "BLS Provider — American Heart Association — Expiration: 2028-08-01", "ACLS", "PALS", "CPR", "DEA Registration", "NPI"). Capture every credential that names a recognized type, even when the entry is short or lacks a license number. Do not skip a credential merely because its line is terse.
- Set credential_type to one of exactly these values: ${(recognized && recognized.length) ? recognized.join(", ") : "the recognized profession credential types"}. Do not invent or use any credential_type not in that list. Map variants to the closest canonical type (e.g. "BLS Provider" or "Basic Life Support" -> "BLS Certification"; "ACLS" -> "ACLS Certification"; "PALS" -> "PALS Certification"; "CPR" -> "CPR Certification"; "DEA" or "DEA Number" -> "DEA Registration"; "NPI" -> "NPI Number").
- For credentials that require a state/jurisdiction (e.g. State Dental License, Sedation Permit, Nitrous Oxide Permit), only create the record if that credential's OWN source text explicitly names the state, and set jurisdiction to the US state abbreviation. The state MUST appear within the source_quote you provide for that credential — never infer a state from a different line elsewhere in the document. If the state is not stated in that credential's own text, omit that credential entirely.
- Set status only when the text clearly indicates a lifecycle state (active, expiring, expired, pending, inactive); otherwise leave status empty. Never invent license numbers or expiration dates — only populate fields the text actually provides.`,
      response_json_schema: CREDENTIAL_SCHEMA
    });

    const raw = result || {};
    let candidates = Array.isArray(raw.credentials) ? raw.credentials : [];

    // 5b. Deterministic fallback for missed BLS/ACLS/PALS/CPR lines: synthesize
    // a credential from the actual document line when the LLM omitted that
    // canonical type entirely. Synthesized records flow through the same
    // grounding + credential gates below.
    {
      const alreadyPresent = new Set(
        candidates.map((c) => normalizeCredentialType(c?.credential_type, recognized, aliases)).filter(Boolean)
      );
      const fallback = buildCredentialFallback(documentText, aliases, recognized, alreadyPresent);
      if (fallback.length) candidates = [...candidates, ...fallback];
    }

    // 6. Grounding validation + trust gates (identical to importFromCV):
    //    - drop any candidate whose source_quote is not verbatim in the text
    //    - sanitize placeholder dates/strings (keep the quote for the gate)
    //    - recognized-type normalization, record-scoped jurisdiction,
    //      license-number token check, record-scoped date grounding + Jan-1
    const validated = [];
    for (const item of candidates) {
      if (!item || typeof item !== "object") continue;
      if (!isGrounded(item.source_quote, normalizedText)) continue;
      const kept = { ...item };
      sanitizeItemDates(kept);
      sanitizeItemStrings(kept);
      const ok = validateCredentialItem(kept, { recognized, aliases, needsJurisdiction, stateNames: stateNamesMap, normalizedText });
      if (!ok) continue;
      // Preserve the grounded source_quote as provenance metadata (the gate
      // strips it from the persisted shape; we return it separately).
      validated.push({ ...ok, source_quote: item.source_quote || "" });
    }

    if (!validated.length) {
      return Response.json(
        { error: "No supported credential could be extracted from this document." },
        { status: 422 }
      );
    }

    // 7. Propose ONE credential. Prefer the most complete record (one that
    //    names a license/ID number or an expiration date); otherwise take the
    //    first validated candidate.
    const pick =
      validated.find((c) => c.license_number || c.expiration_date) || validated[0];
    const { source_quote, ...credential } = pick;
    credential.profession = professionKey;

    return Response.json({
      credential,
      source_quote: source_quote || "",
      source_document_name: file_name || "",
      file_uri,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}