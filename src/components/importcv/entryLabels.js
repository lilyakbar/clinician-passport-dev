// Shared label helpers for CV-import review UI.

export function getEntryLabel(section, item) {
  switch (section) {
    case "profile":        return item.full_name || "Profile";
    case "education":      return `${item.degree || ""} — ${item.institution || ""}`;
    case "career_history": return `${item.position_title || ""} @ ${item.organization || ""}`;
    case "memberships":    return item.organization || "";
    case "leadership":      return `${item.role || ""} — ${item.organization || ""}`;
    case "research":       return item.title || "";
    case "presentations":  return item.title || "";
    case "volunteering":   return `${item.role || ""} @ ${item.organization || ""}`;
    case "conferences":    return item.title || "";
    default:               return JSON.stringify(item).slice(0, 60);
  }
}

export function getEntrySubtitle(section, item) {
  const dates = [item.start_date, item.end_date].filter(Boolean).map(d => d.slice(0, 7)).join(" – ");
  const dateStr = item.start_date ? (item.current ? `${item.start_date.slice(0, 7)} – Present` : dates) : "";
  switch (section) {
    case "profile":        return item.specialty || item.location || "";
    case "education":      return `${item.location || ""} ${dateStr ? "· " + dateStr : ""}`.trim();
    case "presentations":
    case "conferences":     return `${item.location || ""} ${item.date || item.start_date ? "· " + (item.date || item.start_date || "").slice(0, 7) : ""}`.trim();
    default:               return `${item.location || ""} ${dateStr ? "· " + dateStr : ""}`.trim();
  }
}