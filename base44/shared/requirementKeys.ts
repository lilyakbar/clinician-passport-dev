// Canonical requirement-key taxonomy for CE-to-compliance mapping (Model C).
// Shared between analyzeCompliance (backend) and future UI suggestion components.
// Keys are stable strings so CeApplicability links survive requirement label changes.

export const RESERVED_OVERALL_KEY = "overall";

export const DENTISTRY_REQUIREMENT_KEYS = {
  overall: RESERVED_OVERALL_KEY,
  categories: [
    { key: "clinical_didactic", label: "Clinical / Didactic" },
    { key: "practice_management", label: "Practice Management" },
    { key: "infection_control_osha", label: "Infection Control / OSHA" },
    { key: "ethics_jurisprudence", label: "Ethics & Jurisprudence" },
    { key: "pharmacology", label: "Pharmacology" },
    { key: "radiography", label: "Radiography" },
    { key: "cpr_bls_acls", label: "CPR / BLS / ACLS" },
    { key: "patient_safety", label: "Patient Safety" },
    { key: "opioid_pain_management", label: "Opioid / Pain Management" },
    { key: "dental_materials", label: "Dental Materials" },
  ],
  topics: [
    { key: "opioid_prescribing", label: "Opioid Prescribing" },
    { key: "infection_control", label: "Infection Control" },
    { key: "ethics", label: "Ethics" },
    { key: "jurisprudence", label: "Jurisprudence" },
    { key: "cpr", label: "CPR" },
    { key: "bls", label: "BLS" },
    { key: "pain_management", label: "Pain Management" },
    { key: "child_abuse_recognition", label: "Child Abuse Recognition" },
    { key: "domestic_violence", label: "Domestic Violence" },
    { key: "cultural_competency", label: "Cultural Competency" },
  ],
};

const KEYS_BY_PROFESSION: Record<string, any> = {
  dentistry: DENTISTRY_REQUIREMENT_KEYS,
};

export function getRequirementKeys(profession: string): any {
  return KEYS_BY_PROFESSION[profession] || DENTISTRY_REQUIREMENT_KEYS;
}

function normalize(s: string): string {
  return (s || "").toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\b(and|or|the|of|for|in|ce|cme)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  const slug = (s || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || "unknown";
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(w => w.length > 2);
}

function fuzzyMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.some(w => tb.includes(w));
}

// Resolve an LLM-returned category name to a canonical category key string.
// Returns "category:<key>" or "category:unmapped_<slug>" if no canonical match.
export function resolveCategoryKey(label: string, profession = "dentistry"): string {
  const keys = getRequirementKeys(profession);
  for (const cat of keys.categories) {
    if (normalize(label) === normalize(cat.label) || fuzzyMatch(label, cat.label)) {
      return `category:${cat.key}`;
    }
  }
  return `category:unmapped_${slugify(label)}`;
}

// Resolve an LLM-returned topic name to a canonical topic key string.
// Returns "topic:<key>" or "topic:unmapped_<slug>" if no canonical match.
export function resolveTopicKey(label: string, profession = "dentistry"): string {
  const keys = getRequirementKeys(profession);
  for (const t of keys.topics) {
    if (normalize(label) === normalize(t.label) || fuzzyMatch(label, t.label)) {
      return `topic:${t.key}`;
    }
  }
  return `topic:unmapped_${slugify(label)}`;
}

// Check whether a requirement key is a recognised canonical key for the profession.
// Orphans (keys that were once canonical but have since been removed from the taxonomy)
// and arbitrary strings all return false.
export function isKnownCanonicalKey(requirementKey: string, profession = "dentistry"): boolean {
  const keys = getRequirementKeys(profession);
  if (requirementKey === RESERVED_OVERALL_KEY) return true;
  if (requirementKey.startsWith("category:")) {
    const k = requirementKey.substring(9);
    return keys.categories.some((c: any) => c.key === k);
  }
  if (requirementKey.startsWith("topic:")) {
    const k = requirementKey.substring(6);
    return keys.topics.some((t: any) => t.key === k);
  }
  return false;
}

// Check whether a requirement key is an unmapped fallback (not canonical but valid).
export function isUnmappedKey(requirementKey: string): boolean {
  return requirementKey.startsWith("category:unmapped_") || requirementKey.startsWith("topic:unmapped_");
}

// Build the set of valid requirement keys for a specific compliance profile's
// requirements object (which carries canonical_key on each category/topic).
// Used to detect orphan confirmed links whose requirement_key is no longer part
// of the current requirement set.
export function validKeysForRequirements(requirements: any): Set<string> {
  const valid = new Set<string>([RESERVED_OVERALL_KEY]);
  if (requirements.categories) {
    for (const cat of requirements.categories) {
      if (cat.canonical_key) valid.add(cat.canonical_key);
    }
  }
  if (requirements.mandatory_topics) {
    for (const t of requirements.mandatory_topics) {
      const ck = typeof t === "string" ? null : t.canonical_key;
      if (ck) valid.add(ck);
    }
  }
  return valid;
}

// Ensure a requirements object (from cache or fresh LLM) carries canonical_key
// on every category and topic.  Handles legacy string-topic format for backward compat.
export function ensureCanonicalKeys(requirements: any, profession = "dentistry"): any {
  const out = { ...requirements };
  if (out.categories) {
    out.categories = out.categories.map((cat: any) => ({
      ...cat,
      canonical_key: cat.canonical_key || resolveCategoryKey(cat.name, profession),
    }));
  }
  if (out.mandatory_topics) {
    out.mandatory_topics = out.mandatory_topics.map((t: any) => {
      if (typeof t === "string") {
        return { label: t, canonical_key: resolveTopicKey(t, profession) };
      }
      const label = t.label || t.topic || "";
      return {
        ...t,
        label,
        canonical_key: t.canonical_key || resolveTopicKey(label, profession),
      };
    });
  }
  return out;
}