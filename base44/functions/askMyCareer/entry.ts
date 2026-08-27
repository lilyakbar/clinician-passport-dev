import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ALLOWED_MODES = ["history", "credentials", "career_lens", "live_opportunities", "connect", "gap_detection", "optimize_ce"];
const WEB_MODES = new Set(["credentials", "live_opportunities", "connect", "optimize_ce"]);

const ENTITIES = [
  { name: "Credential", short: "cred" },
  { name: "ContinuingEducation", short: "ce" },
  { name: "Conference", short: "conf" },
  { name: "CareerHistory", short: "job" },
  { name: "Education", short: "edu" },
  { name: "Research", short: "res" },
  { name: "Publication", short: "pub" },
  { name: "Presentation", short: "pres" },
  { name: "Volunteering", short: "vol" },
  { name: "Leadership", short: "lead" },
  { name: "Membership", short: "mem" },
  { name: "Document", short: "doc" },
  { name: "CareerGoal", short: "goal" },
  { name: "Opportunity", short: "opp" },
  { name: "Application", short: "app" },
  { name: "Reminder", short: "rem" },
];

function describe(entity, r) {
  const f = (arr) => arr.filter(Boolean).join(" · ");
  switch (entity) {
    case "Credential": return { title: r.name || r.credential_type || "Credential", subtitle: f([r.credential_type, r.issuing_body, r.jurisdiction, r.status, r.expiration_date && ("expires " + r.expiration_date)]) };
    case "ContinuingEducation": return { title: r.title || "CE Course", subtitle: f([r.provider, r.category, r.credits != null ? (r.credits + " credits") : null, r.completion_date, r.status, r.certificate_url ? "certificate attached" : "no certificate"]) };
    case "CareerHistory": return { title: r.position_title || "Position", subtitle: f([r.organization, r.location, r.start_date, r.current ? "current" : r.end_date]) };
    case "Education": return { title: f([r.degree, r.field_of_study]) || "Education", subtitle: f([r.institution, r.location, r.end_date, r.completed ? "completed" : "in progress"]) };
    case "Research": return { title: r.title || "Research", subtitle: f([r.role, r.institution, r.start_date, r.end_date]) };
    case "Publication": return { title: r.title || "Publication", subtitle: f([r.journal, r.publication_date, r.type, r.doi]) };
    case "Presentation": return { title: r.title || "Presentation", subtitle: f([r.event, r.date, r.type, r.location]) };
    case "Conference": return { title: r.title || "Conference", subtitle: f([r.organization, r.start_date, r.end_date, r.location, r.attendance, r.ce_earned != null ? (r.ce_earned + " CE hrs") : null]) };
    case "Volunteering": return { title: r.role || "Volunteer", subtitle: f([r.organization, r.cause, r.location, r.hours != null ? (r.hours + " hrs") : null, r.start_date, r.current ? "current" : r.end_date]) };
    case "Leadership": return { title: r.role || "Leadership", subtitle: f([r.organization, r.start_date, r.current ? "current" : r.end_date]) };
    case "Membership": return { title: r.organization || "Membership", subtitle: f([r.membership_type, r.role, r.start_date, r.current ? "active" : r.end_date]) };
    case "Document": return { title: r.title || "Document", subtitle: f([r.category, r.date_uploaded, r.expiration_date && ("expires " + r.expiration_date), r.file_url ? "file attached" : "no file"]) };
    case "CareerGoal": return { title: r.title || "Goal", subtitle: f([r.category, r.status, (r.progress != null ? (r.progress + "%") : null), r.target_date && ("target " + r.target_date)]) };
    case "Opportunity": return { title: r.title || "Opportunity", subtitle: f([r.organization, r.type, r.location, r.deadline && ("deadline " + r.deadline), r.status]) };
    case "Application": return { title: r.target_title || "Application", subtitle: f([r.organization, r.position, r.status, r.applied_date]) };
    case "Reminder": return { title: r.title || "Reminder", subtitle: f([r.related_name, r.due_date, r.frequency, r.status]) };
    default: return { title: "Record", subtitle: "" };
  }
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    environment: { type: "string", enum: ["MY PASSPORT", "LIVE SOURCE", "BOTH"] },
    matchedRecords: { type: "array", items: { type: "object", properties: { ref: { type: "string" }, reason: { type: "string" } } } },
    sources: { type: "array", items: { type: "object", properties: { organization: { type: "string" }, title: { type: "string" }, url: { type: "string" }, official: { type: "boolean" }, note: { type: "string" } } } },
    lens: { type: "object", properties: {
      categories: { type: "array", items: { type: "object", properties: { name: { type: "string" }, refs: { type: "array", items: { type: "string" } } } } },
      missing: { type: "array", items: { type: "string" } },
      documentsToLocate: { type: "array", items: { type: "string" } }
    } },
    gaps: { type: "array", items: { type: "object", properties: { ref: { type: "string" }, issue: { type: "string" } } } },
    opportunities: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, organization: { type: "string" }, type: { type: "string" },
      date: { type: "string" }, deadline: { type: "string" }, location: { type: "string" },
      url: { type: "string" }, why: { type: "string" }
    } } },
    requirements: { type: "array", items: { type: "object", properties: {
      requirement: { type: "string" }, jurisdiction: { type: "string" }, licenseType: { type: "string" },
      renewalPeriod: { type: "string" }, source: { type: "string" }, url: { type: "string" },
      official: { type: "boolean" }, verified: { type: "string" }, note: { type: "string" }
    } } },
    disclaimer: { type: "string" }
  }
};

function modeInstruction(mode) {
  switch (mode) {
    case "history":
      return "MODE 1 — SEARCH MY HISTORY. Answer the user's question using ONLY their stored Passport records. Reference relevant records by their [ref] tag in matchedRecords. If the answer cannot be determined from stored data, say so plainly. Never invent records, dates, hours, or accomplishments. Set environment to 'MY PASSPORT'.";
    case "credentials":
      return "MODE 2 — CREDENTIAL & RENEWAL INTELLIGENCE. Use the user's stored credentials and CE records, AND current official regulatory sources from the web. For each current requirement, populate the 'requirements' array with requirement, jurisdiction, licenseType, renewalPeriod, source (organization), url, official (true only for an official board/government/authority site), verified (exactly one of: 'Verified from official source', 'Secondary source — verify with board', 'Unable to confidently verify'), and note. Also include matching sources. Never state the user is legally compliant. Set environment to 'BOTH' if web sources are used, else 'MY PASSPORT'. If current requirements cannot be confidently verified, say so in summary and set verified to 'Unable to confidently verify'.";
    case "career_lens":
      return "MODE 3 — CAREER LENS. The user is preparing for a specific professional goal stated in the query. Search the entire Passport and organize relevant records into logical categories (lens.categories), each with the relevant record refs. Then list missing information (lens.missing) and documents the user may need to locate (lens.documentsToLocate). Never fabricate achievements or enhance facts beyond what is recorded. Set environment to 'MY PASSPORT'.";
    case "live_opportunities":
      return "MODE 4 — LIVE OPPORTUNITY SEARCH. Find CURRENT, real, upcoming professional opportunities matching the query using live web research. Only return real events/opportunities you found with a real source url. Exclude expired events. For each, explain why it may match the user's profile/goals. Never invent events. If you cannot find confident results, return an empty opportunities array and explain in summary. Set environment to 'LIVE SOURCE'.";
    case "connect":
      return "MODE 5 — CONNECT INTERNAL + EXTERNAL. Identify relevant Passport records (matchedRecords) — especially active goals and any gaps (e.g. a volunteer goal with no recent activity, or a credential nearing renewal with an incomplete requirement) — AND find live external opportunities (opportunities) that connect to those goals or gaps. Explain the connection in each opportunity's 'why'. Clearly separate stored vs live information. Set environment to 'BOTH'.";
    case "optimize_ce":
      return "MODE 7 — OPTIMIZE MY CE. The user maintains one or more licenses and wants to know what CE they still need. Using live web research, retrieve current renewal CE requirements for each relevant jurisdiction/license and populate the 'requirements' array (with jurisdiction, licenseType, renewalPeriod, source, url, official, verified, note). Then compare against the user's documented CE (matchedRecords), identify apparent gaps (gaps), and note potentially overlapping requirements in the summary. Optionally find live CE courses that may help (opportunities), but never guarantee a course satisfies a board — include a note to verify acceptance. Set environment to 'BOTH'.";
    case "gap_detection":
      return "MODE 6 — PASSPORT CHECKUP. Analyze the user's records for completeness. For each incomplete record, return a gap with the record ref and a specific issue (e.g. missing date, missing hours, missing certificate, missing DOI, missing description, missing end date). Also detect sparse periods in the professional timeline (e.g. few records between certain years) and mention them in the summary as 'Your Passport may be incomplete during <period>' — never as a judgment of professional activity. Phrase all gaps as record-quality observations, never judgments about the user's career. Set environment to 'MY PASSPORT'.";
    default: return "";
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch (e) { body = {}; }
    const mode = ALLOWED_MODES.includes(body.mode) ? body.mode : "history";
    const query = (body.query || "").toString().slice(0, 1200);
    const professionKey = (body.profession || "").toString();
    const professionLabel = (body.professionLabel || "").toString();
    if (!query.trim()) return Response.json({ error: "A query is required" }, { status: 400 });

    // Gather profile context
    let profile = null;
    try {
      const profiles = await base44.entities.Profile.list("-created_date", 20);
      profile = (profiles || []).find((p) => !professionKey || p.profession === professionKey) || (profiles && profiles[0]);
    } catch (e) { profile = null; }

    // Gather passport records (user-scoped; RLS isolates to this user)
    const refMap = {};
    const lines = [];
    for (const e of ENTITIES) {
      let recs = [];
      try { recs = await base44.entities[e.name].list("-created_date", 60); } catch (err) { recs = []; }
      if ((e.name === "Credential" || e.name === "ContinuingEducation") && professionKey) {
        recs = recs.filter((r) => r.profession === professionKey);
      }
      recs.forEach((r, i) => {
        const ref = `${e.short}:${i + 1}`;
        const d = describe(e.name, r);
        refMap[ref] = { id: r.id, entity: e.name, title: d.title, subtitle: d.subtitle };
        lines.push(`[${ref}] ${e.name} — ${d.title}${d.subtitle ? " | " + d.subtitle : ""}`);
      });
    }

    const useWeb = WEB_MODES.has(mode);
    const profDesc = professionLabel || (profile?.profession === "medicine" ? "Medicine (physician, MD/DO)" : "Dentistry");
    const profileCtx = profile
      ? `Profession: ${profile.profession || professionKey || "dentistry"} (${profDesc}). Specialty: ${profile.specialty || "n/a"}. Location: ${profile.location || "n/a"}.`
      : `Profession: ${professionKey || "dentistry"} (${profDesc}).`;

    const system = [
      "You are Ask My Career, the AI career-intelligence assistant inside Clinician Passport, a lifelong professional memory platform for licensed healthcare professionals.",
      "You operate across two strictly separated information environments:",
      "MY PASSPORT = the user's own stored professional records (provided below).",
      "LIVE SOURCE = current external information retrieved from the web.",
      "Never blur the two. Never make an external claim appear to be part of the user's record, and never present stored data as an external fact.",
      "HARD RULES: Never fabricate records, dates, hours, credentials, requirements, events, publications, awards, or accomplishments. Only reference Passport records that actually exist, using their exact [ref] tag. If you cannot confidently answer, say 'I don't have enough verified information to answer that yet.'",
      "Output valid JSON matching the schema. Use markdown in the summary field. Reference records by ref tag only.",
      profileCtx,
      modeInstruction(mode),
    ].join("\n");

    const recordsBlock = lines.length
      ? "\n\n--- PASSPORT RECORDS (MY PASSPORT) ---\n" + lines.join("\n")
      : "\n\n--- PASSPORT RECORDS ---\n(No records stored yet.)";

    const prompt = system + recordsBlock + "\n\n--- USER QUESTION ---\n" + query;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: useWeb,
      model: useWeb ? "gemini_3_flash" : "automatic",
      response_json_schema: SCHEMA,
    });

    let data = llmRes;
    if (typeof data === "string") { data = JSON.parse(data); }

    const mapRef = (ref) => refMap[ref] || null;
    const today = new Date().toISOString().slice(0, 10);

    const result = {
      mode,
      query,
      environment: data.environment || (useWeb ? "LIVE SOURCE" : "MY PASSPORT"),
      summary: data.summary || "",
      matchedRecords: (data.matchedRecords || []).map((m) => {
        const r = mapRef(m.ref);
        return r ? { ...r, reason: m.reason || "" } : null;
      }).filter(Boolean),
      sources: (data.sources || []).map((s) => ({
        organization: s.organization || "",
        title: s.title || "",
        url: s.url || "",
        official: !!s.official,
        note: s.note || "",
        retrieved: today,
      })),
      lens: data.lens ? {
        categories: (data.lens.categories || []).map((c) => ({
          name: c.name || "",
          records: (c.refs || []).map(mapRef).filter(Boolean),
        })).filter((c) => c.records.length || c.name),
        missing: data.lens.missing || [],
        documentsToLocate: data.lens.documentsToLocate || [],
      } : null,
      gaps: (data.gaps || []).map((g) => {
        const r = mapRef(g.ref);
        return r ? { ...r, issue: g.issue || "" } : null;
      }).filter(Boolean),
      opportunities: (data.opportunities || []).map((o) => ({
        name: o.name || "", organization: o.organization || "", type: o.type || "",
        date: o.date || "", deadline: o.deadline || "", location: o.location || "",
        url: o.url || "", why: o.why || "",
      })),
      requirements: (data.requirements || []).map((r) => ({
        requirement: r.requirement || "", jurisdiction: r.jurisdiction || "",
        licenseType: r.licenseType || "", renewalPeriod: r.renewalPeriod || "",
        source: r.source || "", url: r.url || "", official: !!r.official,
        verified: r.verified || "", note: r.note || "", lastChecked: today,
      })),
      disclaimer: data.disclaimer || "",
    };

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}