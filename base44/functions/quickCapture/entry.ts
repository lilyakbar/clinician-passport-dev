import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ENTITY_FIELDS = {
  Conference: ["title", "organization", "start_date", "end_date", "location", "attendance", "ce_earned", "notes"],
  Presentation: ["title", "event", "date", "type", "location", "description", "link"],
  ContinuingEducation: ["title", "provider", "category", "ce_type", "credits", "completion_date", "status", "notes"],
  Volunteering: ["organization", "role", "cause", "hours", "start_date", "end_date", "current", "description"],
  Leadership: ["role", "organization", "start_date", "end_date", "current", "description"],
  CareerHistory: ["position_title", "organization", "location", "start_date", "end_date", "current", "description"],
  Education: ["degree", "field_of_study", "institution", "location", "start_date", "end_date", "completed", "honors", "description"],
  Research: ["title", "role", "institution", "start_date", "end_date", "description", "link"],
  Publication: ["title", "authors", "journal", "publication_date", "type", "doi", "link", "description"],
  Membership: ["organization", "membership_type", "role", "start_date", "end_date", "current"],
  Credential: ["name", "credential_type", "issuing_body", "license_number", "issue_date", "expiration_date", "status", "jurisdiction", "notes"],
  Document: ["title", "category", "date_uploaded", "expiration_date", "notes"],
};

const SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity: { type: "string" },
          summary: { type: "string" },
          missing: { type: "array", items: { type: "string" } },
          // Flat superset of every Passport field — only fill the ones stated in the text.
          title: { type: "string" },
          organization: { type: "string" },
          role: { type: "string" },
          position_title: { type: "string" },
          degree: { type: "string" },
          field_of_study: { type: "string" },
          institution: { type: "string" },
          event: { type: "string" },
          location: { type: "string" },
          type: { type: "string" },
          attendance: { type: "string" },
          category: { type: "string" },
          ce_type: { type: "string" },
          status: { type: "string" },
          cause: { type: "string" },
          description: { type: "string" },
          link: { type: "string" },
          doi: { type: "string" },
          journal: { type: "string" },
          authors: { type: "string" },
          credential_type: { type: "string" },
          issuing_body: { type: "string" },
          license_number: { type: "string" },
          jurisdiction: { type: "string" },
          notes: { type: "string" },
          membership_type: { type: "string" },
          honors: { type: "string" },
          provider: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          date: { type: "string" },
          completion_date: { type: "string" },
          publication_date: { type: "string" },
          issue_date: { type: "string" },
          expiration_date: { type: "string" },
          date_uploaded: { type: "string" },
          credits: { type: "number" },
          hours: { type: "number" },
          ce_earned: { type: "number" },
          current: { type: "boolean" },
          completed: { type: "boolean" },
        },
      },
    },
  },
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch (e) { body = {}; }
    const text = (body.text || "").toString().slice(0, 2000);
    if (!text.trim()) return Response.json({ error: "Text is required" }, { status: 400 });

    const fieldList = Object.entries(ENTITY_FIELDS)
      .map(([e, fs]) => `- ${e}: ${fs.join(", ")}`)
      .join("\n");

    const prompt = [
      "You are the Quick Capture assistant inside Clinician Passport, a professional memory platform for dentists.",
      "The user describes recent professional activity in natural language. Detect each distinct career record that can be inferred from the text and classify it into one of these Passport entities:",
      fieldList,
      "RULES:",
      "- FILL every field whose value is explicitly stated in the text. For example, '6 hours of CE' => credits: 6; 'AAE Annual Meeting in Boston' => title: 'AAE Annual Meeting', location: 'Boston'; 'presented a poster' => type: 'Poster'; 'became chief resident' => role: 'Chief Resident'.",
      "- Only extract information explicitly stated in the text. Never invent dates, hours, organizations, titles, contacts, accomplishments, or any other fact.",
      "- Leave unknown fields as empty string (do not guess). For numbers use 0 only if stated.",
 "- 'current' is boolean. 'credits' and 'ce_earned' and 'hours' are numbers. Dates are ISO YYYY-MM-DD; if only a month/year is given, use the first of that month.",
      "- Return one candidate per distinct activity. For example, attending a conference AND presenting a poster there AND completing CE there AND volunteering AND taking a leadership role are five separate candidates.",
      "- For each candidate, list the key fields that are missing or unknown in the 'missing' array (e.g. 'start date', 'hours', 'organization').",
      "- Only use entity names from the list above. If something does not fit any entity, omit it.",
      "CLASSIFICATION HINTS: 'chief resident', 'committee chair', 'officer', 'program director' => Leadership. 'volunteered', 'free clinic', 'screening event' => Volunteering. 'attended X meeting/conference' => Conference. 'presented a poster/talk' => Presentation. 'completed N hours/credits of CE' => ContinuingEducation. 'licensed in X', 'BLS', 'DEA', 'permit' => Credential.",
      "Output JSON matching the schema.",
      "USER TEXT:\n" + text,
    ].join("\n");

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SCHEMA,
    });

    let data = llmRes;
    if (typeof data === "string") data = JSON.parse(data);

    // Collect only the fields that belong to the detected entity, keeping values the LLM extracted.
    const candidates = (data.candidates || [])
      .filter((c) => ENTITY_FIELDS[c.entity])
      .map((c, i) => {
        const allowed = ENTITY_FIELDS[c.entity];
        const fields = {};
        for (const k of allowed) {
          if (c[k] !== undefined && c[k] !== null && c[k] !== "") fields[k] = c[k];
        }
        return { entity: c.entity, summary: c.summary || "", fields, missing: c.missing || [], _id: i };
      });

    return Response.json({ candidates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}