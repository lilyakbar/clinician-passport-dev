// Duplicate-detection helpers for CV import.
// Shared between importFromCV (and later Quick Capture) so matching rules stay in one place.

function normalizeStr(s) {
  if (s === undefined || s === null) return "";
  return String(s)
    .toLowerCase()
    .replace(/[.,&/\\-]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s) {
  const n = normalizeStr(s);
  if (!n) return new Set();
  return new Set(n.split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function similar(a, b) {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return jaccard(a, b) >= 0.5;
}

function yearOf(d) {
  if (!d) return null;
  const n = parseInt(String(d).slice(0, 4), 10);
  return isNaN(n) ? null : n;
}

// Standard interval overlap; missing end treated as open-ended (current).
function datesOverlap(s1, e1, s2, e2) {
  if (!s1 || !s2) return false;
  const e1b = e1 || "9999-12-31";
  const e2b = e2 || "9999-12-31";
  return s1 <= e2b && s2 <= e1b;
}

function sameYear(d1, d2) {
  const y1 = yearOf(d1);
  const y2 = yearOf(d2);
  return y1 !== null && y2 !== null && y1 === y2;
}

const matchers = {
  career_history: function (x, e) {
    const titleEq = normalizeStr(x.position_title) === normalizeStr(e.position_title);
    const orgEq = normalizeStr(x.organization) === normalizeStr(e.organization);
    const ov = datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date);
    if (titleEq && orgEq && ov) return "duplicate";
    if (orgEq && (similar(x.position_title, e.position_title) || ov)) return "possible";
    if (similar(x.organization, e.organization) && similar(x.position_title, e.position_title)) return "possible";
    return null;
  },
  education: function (x, e) {
    const degEq = normalizeStr(x.degree) === normalizeStr(e.degree);
    const instEq = normalizeStr(x.institution) === normalizeStr(e.institution);
    const ov = datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date);
    if (degEq && instEq && ov) return "duplicate";
    if (instEq && (similar(x.degree, e.degree) || ov)) return "possible";
    if (similar(x.institution, e.institution) && ov) return "possible";
    return null;
  },
  research: function (x, e) {
    const titleEq = normalizeStr(x.title) === normalizeStr(e.title);
    if (titleEq) return "duplicate";
    if (similar(x.title, e.title) && (normalizeStr(x.institution) === normalizeStr(e.institution) || datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date))) return "possible";
    if (similar(x.title, e.title)) return "possible";
    return null;
  },
  presentations: function (x, e) {
    const titleEq = normalizeStr(x.title) === normalizeStr(e.title);
    const eventEq = normalizeStr(x.event) === normalizeStr(e.event);
    const dateEq = sameYear(x.date, e.date);
    if (titleEq && (eventEq || dateEq)) return "duplicate";
    if (similar(x.title, e.title)) return "possible";
    if (eventEq && dateEq) return "possible";
    return null;
  },
  volunteering: function (x, e) {
    const orgEq = normalizeStr(x.organization) === normalizeStr(e.organization);
    const roleEq = normalizeStr(x.role) === normalizeStr(e.role);
    const ov = datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date);
    if (orgEq && roleEq && ov) return "duplicate";
    if (orgEq && (similar(x.role, e.role) || ov)) return "possible";
    if (similar(x.organization, e.organization) && similar(x.role, e.role)) return "possible";
    return null;
  },
  leadership: function (x, e) {
    const orgEq = normalizeStr(x.organization) === normalizeStr(e.organization);
    const roleEq = normalizeStr(x.role) === normalizeStr(e.role);
    const ov = datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date);
    if (orgEq && roleEq && ov) return "duplicate";
    if (orgEq && (similar(x.role, e.role) || ov)) return "possible";
    if (similar(x.organization, e.organization) && similar(x.role, e.role)) return "possible";
    return null;
  },
  memberships: function (x, e) {
    const orgEq = normalizeStr(x.organization) === normalizeStr(e.organization);
    const roleEq = normalizeStr(x.role) === normalizeStr(e.role);
    const ov = datesOverlap(x.start_date, x.end_date, e.start_date, e.end_date);
    if (orgEq && (roleEq || !x.role || !e.role) && ov) return "duplicate";
    if (orgEq) return "possible";
    if (similar(x.organization, e.organization)) return "possible";
    return null;
  },
  conferences: function (x, e) {
    const titleEq = normalizeStr(x.title) === normalizeStr(e.title);
    const dateEq = sameYear(x.start_date, e.start_date);
    if (titleEq && dateEq) return "duplicate";
    if (similar(x.title, e.title)) return "possible";
    if (normalizeStr(x.organization) === normalizeStr(e.organization) && dateEq) return "possible";
    return null;
  }
};

// Classify one extracted item against the user's existing records for a section.
// Returns { state: "new"|"duplicate"|"possible", matchId?, matchRecord? }
export function classifyItem(section, extracted, existingRecords) {
  const matcher = matchers[section];
  if (!matcher) return { state: "new" };
  let possible = null;
  for (const e of existingRecords) {
    const res = matcher(extracted, e);
    if (res === "duplicate") return { state: "duplicate", matchId: e.id, matchRecord: e };
    if (res === "possible" && !possible) possible = { state: "possible", matchId: e.id, matchRecord: e };
  }
  return possible || { state: "new" };
}