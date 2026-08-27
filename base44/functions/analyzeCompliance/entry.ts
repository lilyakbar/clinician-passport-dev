import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const REQUIREMENTS_SCHEMA = {
  type: "object",
  properties: {
    total_hours_required: { type: "number" },
    cycle_years: { type: "number" },
    renewal_frequency: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          hours_required: { type: "number" },
          mandatory: { type: "boolean" }
        }
      }
    },
    modality_restrictions: {
      type: "object",
      properties: {
        max_online_hours: { type: "number" },
        max_self_study_hours: { type: "number" },
        note: { type: "string" }
      }
    },
    mandatory_topics: { type: "array", items: { type: "string" } },
    additional_requirements: { type: "array", items: { type: "string" } },
    source_name: { type: "string" },
    source_url: { type: "string" },
    official: { type: "boolean" }
  }
};

function normalize(s) {
  return (s || "").toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\b(and|or|the|of|for|in|ce|cme)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normalize(s).split(" ").filter(w => w.length > 3);
}

function fuzzyMatch(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.some(w => tb.includes(w));
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const forceRefresh = !!body.force_refresh;
    const professionKey = body.profession || "dentistry";

    // Fetch active licenses with jurisdictions, filtered by profession
    const allCreds = await base44.entities.Credential.list("-expiration_date", 200).catch(() => []);
    const licenseTypes = ["license", "dds", "dmd"];
    const licenses = allCreds.filter(c =>
      c.status === "active" && c.jurisdiction &&
      (!c.profession || c.profession === professionKey) &&
      licenseTypes.some(t => (c.credential_type || "").toLowerCase().includes(t))
    );

    if (licenses.length === 0) {
      return Response.json({
        jurisdictions: [],
        no_licenses: true,
        disclaimer: "No active state licenses with a jurisdiction found. Add a state dental license in Credentials to enable compliance intelligence.",
      });
    }

    // Group by jurisdiction
    const byJurisdiction: Record<string, any[]> = {};
    licenses.forEach(c => {
      if (!byJurisdiction[c.jurisdiction]) byJurisdiction[c.jurisdiction] = [];
      byJurisdiction[c.jurisdiction].push(c);
    });

    // Fetch CE records, filtered by profession
    const ceRecords = await base44.entities.ContinuingEducation.list("-completion_date", 200).catch(() => []);
    const completedCE = ceRecords.filter(c => c.status === "completed" && (!c.profession || c.profession === professionKey));

    // Fetch cached compliance profiles for this profession
    const cached = await base44.entities.ComplianceProfile.list("-last_checked", 100).catch(() => []);
    const cacheMap: Record<string, any> = {};
    cached.forEach(p => { if (!p.profession || p.profession === professionKey) cacheMap[`${p.jurisdiction}:${p.profession}`] = p; });

    const today = new Date().toISOString().slice(0, 10);
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Process all jurisdictions in parallel
    const jurisdictions = await Promise.all(Object.entries(byJurisdiction).map(async ([jurisdiction, creds]) => {
      const cacheKey = `${jurisdiction}:${professionKey}`;
      let profile = cacheMap[cacheKey];
      let requirements: any;
      let sourceName: string;
      let sourceUrl: string;
      let official: boolean;
      let lastChecked: string;
      let verificationStatus: string;

      const useCache = profile && !forceRefresh && profile.last_checked && profile.last_checked >= staleDate;

      if (useCache) {
        try {
          requirements = JSON.parse(profile.requirements);
          sourceName = profile.source_name || "";
          sourceUrl = profile.source_url || "";
          official = !!profile.official;
          lastChecked = profile.last_checked;
          verificationStatus = profile.verification_status || "unverified";
        } catch {
          // Corrupt cache, re-research
          profile = null;
        }
      }

      if (!useCache || !requirements) {
        const profLabel = professionKey === "medicine" ? "physician (MD/DO)" : "dentist";
        const prompt = `Research the current continuing education and license renewal requirements for a ${profLabel} licensed in ${jurisdiction}, United States.

Find the requirements from the official state dental board or equivalent authoritative regulatory source. Search for the current CE requirements, mandatory subject areas, modality restrictions, and renewal cycle.

Return the structured requirements including:
- total_hours_required: Total CE hours/credits required per renewal cycle
- cycle_years: Length of the renewal cycle in years
- renewal_frequency: e.g., "Biennial", "Annual", "Triennial"
- categories: Array of mandatory subject requirements, each with name, hours_required, and mandatory (true if required)
- modality_restrictions: Any limits on online/self-study hours (max_online_hours, max_self_study_hours, note)
- mandatory_topics: Specific mandatory topics that must be covered (e.g., opioid prescribing, infection control, ethics)
- additional_requirements: Non-CE renewal requirements (e.g., CPR certification current, DEA registration, malpractice insurance)
- source_name: The official organization name
- source_url: The URL where you found the requirements
- official: true only if the source is an official government/regulatory board website

Only include requirements you can verify from current authoritative sources. If you cannot verify a specific number, omit it rather than guessing.`;

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          model: "gemini_3_flash",
          response_json_schema: REQUIREMENTS_SCHEMA,
        });

        requirements = result;
        sourceName = result.source_name || "";
        sourceUrl = result.source_url || "";
        official = !!result.official;
        lastChecked = today;
        verificationStatus = official ? "verified" : "unverified";

        // Cache it
        const payload = {
          jurisdiction,
          profession: professionKey,
          requirements: JSON.stringify(requirements),
          source_name: sourceName,
          source_url: sourceUrl,
          official,
          last_checked: today,
          verification_status: verificationStatus,
        };
        try {
          if (profile) {
            await base44.entities.ComplianceProfile.update(profile.id, payload);
          } else {
            await base44.entities.ComplianceProfile.create(payload);
          }
        } catch (e) { /* cache write failure is non-fatal */ }
      }

      // Compare against user's CE
      const totalDocHours = completedCE.reduce((s, c) => s + (Number(c.credits) || 0), 0);
      const totalRequired = requirements.total_hours_required || 0;

      const categoryAnalysis = (requirements.categories || []).map(cat => {
        const docHours = completedCE
          .filter(ce => fuzzyMatch(cat.name, ce.category) || fuzzyMatch(cat.name, ce.title))
          .reduce((s, c) => s + (Number(c.credits) || 0), 0);
        return {
          name: cat.name,
          required: cat.hours_required || 0,
          documented: docHours,
          met: docHours >= (cat.hours_required || 0),
          gap: Math.max(0, (cat.hours_required || 0) - docHours),
          mandatory: cat.mandatory !== false,
        };
      });

      // Modality analysis
      const onlineTypes = ["online", "webinar", "self-study", "self study"];
      const onlineHours = completedCE
        .filter(ce => onlineTypes.some(t => normalize(ce.ce_type).includes(t)))
        .reduce((s, c) => s + (Number(c.credits) || 0), 0);
      const selfStudyHours = completedCE
        .filter(ce => normalize(ce.ce_type).includes("self-study") || normalize(ce.ce_type).includes("self study"))
        .reduce((s, c) => s + (Number(c.credits) || 0), 0);

      const modality = requirements.modality_restrictions || {};
      const modalityAnalysis = {
        max_online_hours: modality.max_online_hours ?? null,
        documented_online: onlineHours,
        online_met: modality.max_online_hours != null ? onlineHours <= modality.max_online_hours : null,
        max_self_study_hours: modality.max_self_study_hours ?? null,
        documented_self_study: selfStudyHours,
        self_study_met: modality.max_self_study_hours != null ? selfStudyHours <= modality.max_self_study_hours : null,
        note: modality.note || "",
      };

      const mandatoryTopicAnalysis = (requirements.mandatory_topics || []).map(t => {
        const met = completedCE.some(ce => fuzzyMatch(t, ce.category) || fuzzyMatch(t, ce.title));
        return { topic: t, met };
      });

      return {
        jurisdiction,
        licenses: creds.map(c => ({
          id: c.id,
          name: c.name,
          credential_type: c.credential_type,
          expiration_date: c.expiration_date,
        })),
        requirements: {
          total_hours_required: totalRequired,
          cycle_years: requirements.cycle_years || null,
          renewal_frequency: requirements.renewal_frequency || "",
          additional_requirements: requirements.additional_requirements || [],
        },
        source: { name: sourceName, url: sourceUrl, official },
        last_checked: lastChecked,
        verification_status: verificationStatus,
        analysis: {
          total_hours: {
            required: totalRequired,
            documented: totalDocHours,
            met: totalDocHours >= totalRequired,
            gap: Math.max(0, totalRequired - totalDocHours),
          },
          categories: categoryAnalysis,
          modality: modalityAnalysis,
          mandatory_topics: mandatoryTopicAnalysis,
        },
      };
    }));

    return Response.json({
      jurisdictions,
      disclaimer: "This information is retrieved from public regulatory sources and is for informational purposes only. It does not constitute legal compliance verification. Requirements change — always confirm current requirements directly with your licensing board before relying on this data.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}