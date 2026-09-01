import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// --- Canonical requirement taxonomy (mirrors dentistry.js requirementTaxonomy) ---
const CANONICAL_CATEGORIES = [
  { key: "infection_control", label: "Infection Control / OSHA" },
  { key: "ethics_jurisprudence", label: "Ethics & Jurisprudence" },
  { key: "opioid_pain", label: "Opioid / Pain Management" },
  { key: "cpr_bls", label: "CPR / BLS / ACLS" },
  { key: "pharmacology", label: "Pharmacology" },
  { key: "radiography", label: "Radiography" },
  { key: "patient_safety", label: "Patient Safety" },
  { key: "clinical_didactic", label: "Clinical / Didactic" },
  { key: "practice_management", label: "Practice Management" },
  { key: "dental_materials", label: "Dental Materials" },
];
const CANONICAL_TOPICS = [
  { key: "opioid_pain", label: "Opioid Prescribing" },
  { key: "ethics_jurisprudence", label: "Ethics & Jurisprudence" },
  { key: "infection_control", label: "Infection Control" },
  { key: "child_abuse", label: "Child Abuse Recognition" },
  { key: "cultural_competency", label: "Cultural Competency" },
];

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

// Map a board free-text label to a stable canonical key, or generate a
// distinct unmapped_<slug> fallback so unknown requirements never collapse together.
function mapToCanonicalKey(boardLabel) {
  if (!boardLabel) return null;
  const keySpace = boardLabel.replace(/_/g, " ");
  for (const item of CANONICAL_CATEGORIES) {
    if (fuzzyMatch(boardLabel, item.label) || fuzzyMatch(keySpace, item.label)) {
      return { key: item.key, unmapped: false };
    }
  }
  for (const item of CANONICAL_TOPICS) {
    if (fuzzyMatch(boardLabel, item.label) || fuzzyMatch(keySpace, item.label)) {
      return { key: item.key, unmapped: false };
    }
  }
  const slug = normalize(boardLabel).replace(/\s+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
  return { key: `unmapped_${slug}`, unmapped: true };
}

// Build canonical categories with collision guard (append _2, _3 for duplicate slugs).
function buildCanonicalCategories(rawCategories) {
  const usedKeys = new Set();
  return (rawCategories || []).map(cat => {
    const mapped = mapToCanonicalKey(cat.name);
    let key = mapped.key;
    if (usedKeys.has(key)) {
      let i = 2;
      while (usedKeys.has(`${key}_${i}`)) i++;
      key = `${key}_${i}`;
    }
    usedKeys.add(key);
    return {
      key,
      label: cat.name,
      hours_required: cat.hours_required || 0,
      mandatory: cat.mandatory !== false,
      unmapped: mapped.unmapped,
    };
  });
}

// Build canonical mandatory topics with collision guard.
function buildCanonicalTopics(rawTopics) {
  const usedKeys = new Set();
  return (rawTopics || []).map(topicLabel => {
    const mapped = mapToCanonicalKey(topicLabel);
    let key = mapped.key;
    if (usedKeys.has(key)) {
      let i = 2;
      while (usedKeys.has(`${key}_${i}`)) i++;
      key = `${key}_${i}`;
    }
    usedKeys.add(key);
    return { key, label: topicLabel };
  });
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const forceRefresh = !!body.force_refresh;
    const professionKey = body.profession || "dentistry";

    // Fetch all data in parallel
    const [allCreds, ceRecords, cached, allLinks] = await Promise.all([
      base44.entities.Credential.list("-expiration_date", 200).catch(() => []),
      base44.entities.ContinuingEducation.list("-completion_date", 200).catch(() => []),
      base44.entities.ComplianceProfile.list("-last_checked", 100).catch(() => []),
      base44.entities.CeApplicability.list("-created_date", 500).catch(() => []),
    ]);

    // Filter active licenses with jurisdiction
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

    const completedCE = ceRecords.filter(c => c.status === "completed" && (!c.profession || c.profession === professionKey));
    const ceMap: Record<string, any> = {};
    completedCE.forEach(ce => { ceMap[ce.id] = ce; });

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
          // Migrate old-format cached requirements (no canonical keys) to canonical
          if (requirements.categories?.length && !requirements.categories[0].key) {
            requirements.categories = buildCanonicalCategories(requirements.categories);
            requirements.mandatory_topics = buildCanonicalTopics(requirements.mandatory_topics);
            try {
              await base44.entities.ComplianceProfile.update(profile.id, {
                requirements: JSON.stringify(requirements),
              });
            } catch { /* non-fatal */ }
          }
          sourceName = profile.source_name || "";
          sourceUrl = profile.source_url || "";
          official = !!profile.official;
          lastChecked = profile.last_checked;
          verificationStatus = profile.verification_status || "unverified";
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

        // Map LLM free-text categories/topics to stable canonical keys
        requirements = {
          ...result,
          categories: buildCanonicalCategories(result.categories),
          mandatory_topics: buildCanonicalTopics(result.mandatory_topics),
        };

        sourceName = result.source_name || "";
        sourceUrl = result.source_url || "";
        official = !!result.official;
        lastChecked = today;
        verificationStatus = official ? "verified" : "unverified";

        const anchorCred = creds[0];
        const payload = {
          jurisdiction,
          profession: professionKey,
          credential_type: anchorCred?.credential_type || null,
          issuing_body: anchorCred?.issuing_body || null,
          cycle_start_date: null,
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
        } catch { /* cache write failure is non-fatal */ }
      }

      // --- CeApplicability: compliance from confirmed links only ---

      const anchorCred = creds[0];
      const credIds = creds.map(c => c.id);
      const jurisdictionLinks = allLinks.filter((l: any) => credIds.includes(l.credential_id));

      const confirmed = jurisdictionLinks.filter((l: any) => l.status === "confirmed");
      const suggested = jurisdictionLinks.filter((l: any) => l.status === "ai_suggested");

      // Valid requirement keys for this requirement set
      const validKeys = new Set([
        "overall",
        ...(requirements.categories || []).map((c: any) => c.key),
        ...(requirements.mandatory_topics || []).map((t: any) => t.key),
      ]);

      // Orphan handling: confirmed links to removed keys are flagged (not deleted);
      // ai_suggested links to removed keys are auto-deleted.
      const orphanedConfirmed = confirmed.filter((l: any) => !validKeys.has(l.requirement_key));
      const orphanedSuggested = suggested.filter((l: any) => !validKeys.has(l.requirement_key));

      if (orphanedSuggested.length > 0) {
        await Promise.all(orphanedSuggested.map((l: any) =>
          base44.entities.CeApplicability.delete(l.id).catch(() => {})
        ));
      }

      const activeConfirmed = confirmed.filter((l: any) => validKeys.has(l.requirement_key));
      const activeSuggested = suggested.filter((l: any) => validKeys.has(l.requirement_key));

      // --- Generate new AI suggestions for the anchor credential ---
      // Only propose links for (ce, credential, key) triples that don't already exist.
      const existingLinkKeys = new Set(
        jurisdictionLinks
          .filter((l: any) => l.credential_id === anchorCred.id)
          .map((l: any) => `${l.ce_id}:${l.requirement_key}`)
      );

      const newSuggestions: any[] = [];
      for (const ce of completedCE) {
        const ceCredits = Number(ce.credits) || 0;

        // Overall eligibility suggestion: propose for every completed CE
        if (!existingLinkKeys.has(`${ce.id}:overall`)) {
          newSuggestions.push({
            ce_id: ce.id,
            credential_id: anchorCred.id,
            requirement_key: "overall",
            credits_applied: ceCredits,
            status: "ai_suggested",
            source: "ai",
          });
          existingLinkKeys.add(`${ce.id}:overall`);
        }

        // Category suggestions: fuzzy match CE category/title to requirement label
        for (const cat of (requirements.categories || [])) {
          const catKeySpace = cat.key.replace(/_/g, " ");
          if (
            fuzzyMatch(ce.category, cat.label) || fuzzyMatch(ce.title, cat.label) ||
            fuzzyMatch(ce.category, catKeySpace) || fuzzyMatch(ce.title, catKeySpace)
          ) {
            if (!existingLinkKeys.has(`${ce.id}:${cat.key}`)) {
              newSuggestions.push({
                ce_id: ce.id,
                credential_id: anchorCred.id,
                requirement_key: cat.key,
                credits_applied: Math.min(ceCredits, cat.hours_required || ceCredits),
                status: "ai_suggested",
                source: "ai",
              });
              existingLinkKeys.add(`${ce.id}:${cat.key}`);
            }
          }
        }

        // Topic suggestions: fuzzy match (presence-only, credits_applied = 0)
        for (const topic of (requirements.mandatory_topics || [])) {
          const topicKeySpace = topic.key.replace(/_/g, " ");
          if (
            fuzzyMatch(ce.category, topic.label) || fuzzyMatch(ce.title, topic.label) ||
            fuzzyMatch(ce.category, topicKeySpace) || fuzzyMatch(ce.title, topicKeySpace)
          ) {
            if (!existingLinkKeys.has(`${ce.id}:${topic.key}`)) {
              newSuggestions.push({
                ce_id: ce.id,
                credential_id: anchorCred.id,
                requirement_key: topic.key,
                credits_applied: 0,
                status: "ai_suggested",
                source: "ai",
              });
              existingLinkKeys.add(`${ce.id}:${topic.key}`);
            }
          }
        }
      }

      let createdSuggestions: any[] = [];
      if (newSuggestions.length > 0) {
        try {
          createdSuggestions = await base44.entities.CeApplicability.bulkCreate(newSuggestions);
        } catch { /* non-fatal */ }
      }

      // Combine active + newly created suggestions for UI
      const allSuggestions = [...activeSuggested, ...createdSuggestions];

      // Build key → label map for display
      const keyToLabel: Record<string, string> = { overall: "Total CE Hours" };
      (requirements.categories || []).forEach((c: any) => { keyToLabel[c.key] = c.label; });
      (requirements.mandatory_topics || []).forEach((t: any) => { keyToLabel[t.key] = t.label; });

      const suggestionsForUI = allSuggestions.map((l: any) => ({
        id: l.id,
        ce_id: l.ce_id,
        ce_title: ceMap[l.ce_id]?.title || "Unknown CE",
        ce_credits: Number(ceMap[l.ce_id]?.credits) || 0,
        requirement_key: l.requirement_key,
        requirement_label: keyToLabel[l.requirement_key] || l.requirement_key,
        credits_applied: l.credits_applied || 0,
      }));

      // --- Deterministic compliance calculation (confirmed links only) ---

      const cycleYears = requirements.cycle_years || 2;

      // Cycle window: from ComplianceProfile.cycle_start_date, or derived from
      // the anchor credential's expiration_date minus cycle_years.
      let window: { start: Date; end: Date } | null = null;
      if (profile?.cycle_start_date) {
        const start = new Date(profile.cycle_start_date);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + cycleYears);
        window = { start, end };
      } else if (anchorCred?.expiration_date) {
        const end = new Date(anchorCred.expiration_date);
        const start = new Date(end);
        start.setFullYear(start.getFullYear() - cycleYears);
        window = { start, end };
      }

      const inWindowCeIds = window
        ? new Set(completedCE.filter(ce => {
            if (!ce.completion_date) return false;
            const d = new Date(ce.completion_date);
            return d >= window!.start && d <= window!.end;
          }).map(ce => ce.id))
        : new Set(completedCE.map(ce => ce.id));

      // Cap helper: credits_applied can never exceed the CE course's actual credits
      const capCredits = (link: any) => Math.min(
        Number(link.credits_applied) || 0,
        Number(ceMap[link.ce_id]?.credits) || 0
      );

      // Overall: sum confirmed "overall" links, filtered by cycle window
      const overallDoc = activeConfirmed
        .filter((l: any) => l.requirement_key === "overall" && inWindowCeIds.has(l.ce_id))
        .reduce((s: number, l: any) => s + capCredits(l), 0);
      const totalRequired = requirements.total_hours_required || 0;

      // Categories: each summed independently from its own confirmed links
      const categoryAnalysis = (requirements.categories || []).map((cat: any) => {
        const doc = activeConfirmed
          .filter((l: any) => l.requirement_key === cat.key)
          .reduce((s: number, l: any) => s + capCredits(l), 0);
        return {
          name: cat.label,
          key: cat.key,
          required: cat.hours_required || 0,
          documented: doc,
          met: doc >= (cat.hours_required || 0),
          gap: Math.max(0, (cat.hours_required || 0) - doc),
          mandatory: cat.mandatory !== false,
          unmapped: !!cat.unmapped,
        };
      });

      // Topics: confirmed presence (pass/fail)
      const topicAnalysis = (requirements.mandatory_topics || []).map((t: any) => {
        const met = activeConfirmed.some((l: any) => l.requirement_key === t.key);
        return { topic: t.label, key: t.key, met };
      });

      // Modality: deterministic from CE.ce_type (in-cycle only)
      const inWindowCE = completedCE.filter(ce => inWindowCeIds.has(ce.id));
      const onlineTypes = ["online", "webinar", "self-study", "self study"];
      const onlineHours = inWindowCE
        .filter(ce => onlineTypes.some(t => normalize(ce.ce_type).includes(t)))
        .reduce((s: number, c: any) => s + (Number(c.credits) || 0), 0);
      const selfStudyHours = inWindowCE
        .filter(ce => normalize(ce.ce_type).includes("self-study") || normalize(ce.ce_type).includes("self study"))
        .reduce((s: number, c: any) => s + (Number(c.credits) || 0), 0);

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

      // Orphans for UI
      const orphanedForUI = orphanedConfirmed.map((l: any) => ({
        id: l.id,
        ce_id: l.ce_id,
        ce_title: ceMap[l.ce_id]?.title || "Unknown CE",
        requirement_key: l.requirement_key,
        requirement_label: keyToLabel[l.requirement_key] || l.requirement_key,
      }));

      return {
        jurisdiction,
        anchor_credential_id: anchorCred.id,
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
            documented: overallDoc,
            met: overallDoc >= totalRequired,
            gap: Math.max(0, totalRequired - overallDoc),
          },
          categories: categoryAnalysis,
          modality: modalityAnalysis,
          mandatory_topics: topicAnalysis,
        },
        suggestions: suggestionsForUI,
        orphaned_links: orphanedForUI,
        confirmed_count: activeConfirmed.length,
        suggestion_count: suggestionsForUI.length,
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