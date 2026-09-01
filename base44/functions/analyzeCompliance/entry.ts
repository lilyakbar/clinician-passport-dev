import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  RESERVED_OVERALL_KEY,
  resolveCategoryKey,
  resolveTopicKey,
  ensureCanonicalKeys,
  validKeysForRequirements,
} from '../../shared/requirementKeys.ts';

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

function normalize(s: string): string {
  return (s || "").toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\b(and|or|the|of|for|in|ce|cme)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(w => w.length > 3);
}

function fuzzyMatch(a: string, b: string): boolean {
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

    // --- Fetch active licenses with jurisdictions, filtered by profession ---
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

    // --- Group by jurisdiction ---
    const byJurisdiction: Record<string, any[]> = {};
    licenses.forEach(c => {
      if (!byJurisdiction[c.jurisdiction]) byJurisdiction[c.jurisdiction] = [];
      byJurisdiction[c.jurisdiction].push(c);
    });

    // --- Fetch completed CE records, filtered by profession ---
    const ceRecords = await base44.entities.ContinuingEducation.list("-completion_date", 200).catch(() => []);
    const completedCE = ceRecords.filter(c => c.status === "completed" && (!c.profession || c.profession === professionKey));

    // --- Fetch cached compliance profiles for this profession ---
    const cached = await base44.entities.ComplianceProfile.list("-last_checked", 100).catch(() => []);
    const cacheMap: Record<string, any> = {};
    cached.forEach(p => { if (!p.profession || p.profession === professionKey) cacheMap[`${p.jurisdiction}:${p.profession}`] = p; });

    // --- Fetch ALL CeApplicability records for this user ---
    const allApplicability = await base44.entities.CeApplicability.list("-created_date", 500).catch(() => []);

    const today = new Date().toISOString().slice(0, 10);
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // --- Process all jurisdictions in parallel ---
    const jurisdictions = await Promise.all(Object.entries(byJurisdiction).map(async ([jurisdiction, creds]) => {
      const cacheKey = `${jurisdiction}:${professionKey}`;
      let profile = cacheMap[cacheKey];
      let requirements: any;
      let sourceName: string;
      let sourceUrl: string;
      let official: boolean;
      let lastChecked: string;
      let verificationStatus: string;
      let credentialType = "";
      let issuingBody = "";
      let cycleStartDate = "";

      const useCache = profile && !forceRefresh && profile.last_checked && profile.last_checked >= staleDate;

      if (useCache) {
        try {
          requirements = JSON.parse(profile.requirements);
          // Ensure canonical keys exist (backward compat with old cached profiles)
          requirements = ensureCanonicalKeys(requirements, professionKey);
          sourceName = profile.source_name || "";
          sourceUrl = profile.source_url || "";
          official = !!profile.official;
          lastChecked = profile.last_checked;
          verificationStatus = profile.verification_status || "unverified";
          credentialType = profile.credential_type || "";
          issuingBody = profile.issuing_body || "";
          cycleStartDate = profile.cycle_start_date || "";
        } catch {
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

        // Map LLM category/topic names to stable canonical keys
        requirements = ensureCanonicalKeys(requirements, professionKey);

        // Populate new profile metadata from the primary license
        const primaryCred = creds[0];
        credentialType = primaryCred?.credential_type || "";
        issuingBody = primaryCred?.issuing_body || "";
        const cycleYears = requirements.cycle_years || 2;
        if (primaryCred?.issue_date) {
          cycleStartDate = primaryCred.issue_date;
        } else if (primaryCred?.expiration_date) {
          const exp = new Date(primaryCred.expiration_date);
          exp.setFullYear(exp.getFullYear() - cycleYears);
          cycleStartDate = exp.toISOString().slice(0, 10);
        }

        const payload = {
          jurisdiction,
          profession: professionKey,
          credential_type: credentialType,
          issuing_body: issuingBody,
          cycle_start_date: cycleStartDate,
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

      // --- Model C: use first credential as target for CeApplicability links ---
      const targetCred = creds[0];
      const targetCredId = targetCred.id;

      // Get applicability links for this credential
      const applicabilityLinks = allApplicability.filter(a => a.credential_id === targetCredId);
      const confirmedLinks = applicabilityLinks.filter(a => a.status === "confirmed");

      // Determine valid requirement keys for this profile (for orphan detection)
      const validKeys = validKeysForRequirements(requirements);

      // Separate confirmed links into active (valid key) and orphan (removed key)
      const activeLinks = confirmedLinks.filter(a => validKeys.has(a.requirement_key));
      const orphanLinks = confirmedLinks.filter(a => !validKeys.has(a.requirement_key));

      // --- Compliance calculation ---
      let totalDocHours: number;
      let categoryAnalysis: any[];
      let mandatoryTopicAnalysis: any[];
      let calculationMode: string;

      if (activeLinks.length > 0) {
        // === Model C calculation: only confirmed, non-orphan links count ===
        calculationMode = "model_c";

        const ceMap: Record<string, any> = {};
        completedCE.forEach(ce => { ceMap[ce.id] = ce; });

        // Group active non-topic links by CE for per-CE cap enforcement
        const linksByCE: Record<string, any[]> = {};
        activeLinks.forEach(link => {
          if (!linksByCE[link.ce_id]) linksByCE[link.ce_id] = [];
          linksByCE[link.ce_id].push(link);
        });

        let overallHours = 0;
        const categoryHoursMap: Record<string, number> = {};
        const topicMetSet = new Set<string>();

        // Topics are presence-based — any confirmed topic link means met
        activeLinks.forEach(link => {
          if (link.requirement_key.startsWith("topic:")) {
            topicMetSet.add(link.requirement_key);
          }
        });

        // Per-CE, per-bucket independent caps.
        // Each requirement key (overall / each category) may receive up to ceCredits
        // independently; one bucket does not reduce another. Duplicate links for the
        // same CE + requirement key are summed then capped at ceCredits.
        for (const [ceId, links] of Object.entries(linksByCE)) {
          const ce = ceMap[ceId];
          if (!ce) continue;
          const ceCredits = Number(ce.credits) || 0;

          // Sum credits by requirement key within this CE (dedupes duplicate links)
          const byKey: Record<string, number> = {};
          links.forEach(link => {
            if (link.requirement_key.startsWith("topic:")) return;
            const k = link.requirement_key;
            byKey[k] = (byKey[k] || 0) + (Number(link.credits_applied) || 0);
          });

          for (const [key, allocated] of Object.entries(byKey)) {
            const effective = Math.min(allocated, ceCredits);
            if (effective <= 0) continue;
            if (key === RESERVED_OVERALL_KEY) {
              overallHours += effective;
            } else if (key.startsWith("category:")) {
              categoryHoursMap[key] = (categoryHoursMap[key] || 0) + effective;
            }
          }
        }

        // Overall total counts confirmed overall-link credits only.
        // Category credits satisfy their own category requirements and never inflate the overall total.
        totalDocHours = overallHours;

        categoryAnalysis = (requirements.categories || []).map((cat: any) => {
          const docHours = categoryHoursMap[cat.canonical_key] || 0;
          return {
            name: cat.name,
            required: cat.hours_required || 0,
            documented: docHours,
            met: docHours >= (cat.hours_required || 0),
            gap: Math.max(0, (cat.hours_required || 0) - docHours),
            mandatory: cat.mandatory !== false,
          };
        });

        mandatoryTopicAnalysis = (requirements.mandatory_topics || []).map((t: any) => ({
          topic: t.label,
          met: topicMetSet.has(t.canonical_key),
        }));

      } else {
        // === Fallback: fuzzy match (current behavior) — non-breaking for existing users ===
        calculationMode = "fallback";

        totalDocHours = completedCE.reduce((s, c) => s + (Number(c.credits) || 0), 0);

        categoryAnalysis = (requirements.categories || []).map((cat: any) => {
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

        mandatoryTopicAnalysis = (requirements.mandatory_topics || []).map((t: any) => {
          const label = t.label || t.topic || "";
          const met = completedCE.some(ce => fuzzyMatch(label, ce.category) || fuzzyMatch(label, ce.title));
          return { topic: label, met };
        });
      }

      // --- Modality analysis (always deterministic, same for both modes) ---
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

      // --- Generate AI applicability suggestions for CE without any link ---
      const ceWithAnyLink = new Set(applicabilityLinks.map(a => a.ce_id));
      const ceWithoutLinks = completedCE.filter(ce => !ceWithAnyLink.has(ce.id));

      if (ceWithoutLinks.length > 0 && targetCredId) {
        const suggestions: any[] = [];
        for (const ce of ceWithoutLinks) {
          const ceCredits = Number(ce.credits) || 0;
          const ceText = `${ce.title || ""} ${ce.category || ""}`;

          // Match category — if canonical match, suggest category link; otherwise suggest overall
          const catKey = ce.category ? resolveCategoryKey(ce.category, professionKey) : null;
          const isKnownCategory = catKey && !catKey.includes("unmapped_");

          if (isKnownCategory) {
            suggestions.push({
              ce_id: ce.id,
              credential_id: targetCredId,
              requirement_key: catKey,
              credits_applied: ceCredits,
              status: "ai_suggested",
              source: "ai",
            });
          } else {
            suggestions.push({
              ce_id: ce.id,
              credential_id: targetCredId,
              requirement_key: RESERVED_OVERALL_KEY,
              credits_applied: ceCredits,
              status: "ai_suggested",
              source: "ai",
            });
          }

          // Match topics (presence-based, credits_applied = 0)
          for (const topic of (requirements.mandatory_topics || [])) {
            const topicLabel = topic.label || "";
            if (fuzzyMatch(topicLabel, ceText)) {
              suggestions.push({
                ce_id: ce.id,
                credential_id: targetCredId,
                requirement_key: topic.canonical_key,
                credits_applied: 0,
                status: "ai_suggested",
                source: "ai",
              });
            }
          }
        }

        if (suggestions.length > 0) {
          try {
            await base44.entities.CeApplicability.bulkCreate(suggestions);
          } catch (e) { /* non-fatal */ }
        }
      }

      // --- Build response (same format as before, plus new metadata) ---
      const totalRequired = requirements.total_hours_required || 0;
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
        credential_type: credentialType,
        issuing_body: issuingBody,
        cycle_start_date: cycleStartDate,
        source: { name: sourceName, url: sourceUrl, official },
        last_checked: lastChecked,
        verification_status: verificationStatus,
        calculation_mode: calculationMode,
        orphan_links: orphanLinks.map(o => ({
          id: o.id,
          ce_id: o.ce_id,
          requirement_key: o.requirement_key,
          credits_applied: o.credits_applied,
        })),
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