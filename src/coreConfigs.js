// Profession-agnostic record configurations consumed by the reusable EntityManager.
// Field options that are profession-specific (e.g. membership orgs, degrees) are
// injected at render time from the active profession module via the `fromProfession`
// helper on a field.

export const careerHistoryConfig = {
  entityName: "CareerHistory",
  title: "Career History",
  singularTitle: "Position",
  description: "Employment positions across your clinical career.",
  fields: [
    { name: "position_title", label: "Position Title", type: "text", required: true, colSpan: 2 },
    { name: "organization", label: "Organization", type: "text", required: true },
    { name: "organization_type", label: "Organization Type", type: "text" },
    { name: "location", label: "Location", type: "text" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "current", label: "Current Position", type: "boolean" },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["position_title", "organization", "start_date", "end_date"],
};

export const educationConfig = {
  entityName: "Education",
  title: "Education",
  singularTitle: "Education Record",
  description: "Degrees, residencies, and formal training programs.",
  fields: [
    { name: "degree", label: "Degree", type: "select", optionsFromProfession: "educationDegrees", required: true },
    { name: "field_of_study", label: "Field of Study", type: "text" },
    { name: "institution", label: "Institution", type: "text", required: true, colSpan: 2 },
    { name: "location", label: "Location", type: "text" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "completed", label: "Completed", type: "boolean" },
    { name: "honors", label: "Honors", type: "text" },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["degree", "field_of_study", "institution", "end_date"],
};

export const researchConfig = {
  entityName: "Research",
  title: "Research",
  singularTitle: "Research Project",
  description: "Research projects and scholarly investigations.",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, colSpan: 2 },
    { name: "role", label: "Your Role", type: "text" },
    { name: "institution", label: "Institution", type: "text" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "link", label: "Link", type: "text", colSpan: 2 },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["title", "role", "institution", "start_date"],
};

export const publicationsConfig = {
  entityName: "Publication",
  title: "Publications",
  singularTitle: "Publication",
  description: "Peer-reviewed articles, book chapters, and other scholarly work.",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, colSpan: 2 },
    { name: "authors", label: "Authors", type: "text", colSpan: 2 },
    { name: "journal", label: "Journal / Publisher", type: "text" },
    { name: "type", label: "Type", type: "text" },
    { name: "publication_date", label: "Publication Date", type: "date" },
    { name: "doi", label: "DOI", type: "text" },
    { name: "link", label: "Link", type: "text", colSpan: 2 },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["title", "journal", "publication_date", "type"],
};

export const presentationsConfig = {
  entityName: "Presentation",
  title: "Presentations",
  singularTitle: "Presentation",
  description: "Lectures, posters, and conference presentations.",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, colSpan: 2 },
    { name: "event", label: "Event / Conference", type: "text" },
    { name: "type", label: "Type", type: "select", options: ["Lecture", "Poster", "Keynote", "Panel", "Workshop", "Webinar"] },
    { name: "date", label: "Date", type: "date" },
    { name: "location", label: "Location", type: "text" },
    { name: "link", label: "Link", type: "text", colSpan: 2 },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["title", "event", "date", "type"],
};

export const volunteeringConfig = {
  entityName: "Volunteering",
  title: "Volunteering",
  singularTitle: "Volunteer Role",
  description: "Community and pro bono clinical service.",
  fields: [
    { name: "organization", label: "Organization", type: "text", required: true },
    { name: "role", label: "Role", type: "text", required: true },
    { name: "cause", label: "Cause / Focus", type: "text" },
    { name: "hours", label: "Hours", type: "number" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "current", label: "Ongoing", type: "boolean" },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["organization", "role", "cause", "start_date"],
};

export const leadershipConfig = {
  entityName: "Leadership",
  title: "Leadership",
  singularTitle: "Leadership Role",
  description: "Leadership roles, committee chairs, and administrative appointments.",
  fields: [
    { name: "role", label: "Role", type: "text", required: true },
    { name: "organization", label: "Organization", type: "text", required: true },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "current", label: "Ongoing", type: "boolean" },
    { name: "description", label: "Description", type: "textarea", colSpan: 2 },
  ],
  columns: ["role", "organization", "start_date", "end_date"],
};

export const membershipConfig = {
  entityName: "Membership",
  title: "Professional Memberships",
  singularTitle: "Membership",
  description: "Professional society and association memberships.",
  fields: [
    { name: "organization", label: "Organization", type: "select", optionsFromProfession: "membershipOrganizations", required: true, colSpan: 2 },
    { name: "membership_type", label: "Membership Type", type: "select", options: ["Member", "Fellow", "Student", "Associate", "Life Member", "Affiliate"] },
    { name: "role", label: "Role / Committee", type: "text" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "current", label: "Active", type: "boolean" },
  ],
  columns: ["organization", "membership_type", "role", "start_date"],
};

export const documentConfig = {
  entityName: "Document",
  title: "Documents",
  singularTitle: "Document",
  description: "Licenses, certificates, insurance, and supporting files.",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, colSpan: 2 },
    { name: "category", label: "Category", type: "select", options: ["License", "Certificate", "Insurance", "Degree", "Board Certification", "DEA", "CV / Resume", "Reference Letter", "Other"] },
    { name: "file_url", label: "File", type: "file", colSpan: 2 },
    { name: "date_uploaded", label: "Date Uploaded", type: "date" },
    { name: "expiration_date", label: "Expiration Date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
  ],
  columns: ["title", "category", "file_url", "date_uploaded", "expiration_date"],
};

export const conferenceConfig = {
  entityName: "Conference",
  title: "Conferences",
  singularTitle: "Conference",
  description: "Conferences, meetings, and professional events attended or presented at.",
  fields: [
    { name: "title", label: "Conference", type: "text", required: true, colSpan: 2 },
    { name: "organization", label: "Organization", type: "text" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "end_date", label: "End Date", type: "date" },
    { name: "location", label: "Location", type: "text" },
    { name: "attendance", label: "Attendance", type: "select", options: ["Attended", "Presented", "Exhibitor", "Virtual"] },
    { name: "ce_earned", label: "CE Hours Earned", type: "number" },
    { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
  ],
  columns: ["title", "organization", "start_date", "location"],
};