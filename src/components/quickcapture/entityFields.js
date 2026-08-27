import {
  careerHistoryConfig, educationConfig, researchConfig, publicationsConfig,
  presentationsConfig, volunteeringConfig, leadershipConfig, membershipConfig,
  documentConfig, conferenceConfig,
} from "@/coreConfigs";

// Editable field definitions for each Quick Capture entity, reusing the
// profession-agnostic core configs where possible and injecting
// profession-specific options (credential types, CE categories) for the
// compliance-driven entities.
export function getQuickCaptureFields(professionModule) {
  return {
    Conference: conferenceConfig.fields,
    Presentation: presentationsConfig.fields,
    ContinuingEducation: [
      { name: "title", label: "Course Title", type: "text", required: true, colSpan: 2 },
      { name: "provider", label: "Provider", type: "text" },
      { name: "credits", label: "Credits / Hours", type: "number" },
      { name: "category", label: "Category", type: "select", options: professionModule.ce.categories },
      { name: "ce_type", label: "Format", type: "select", options: professionModule.ce.types },
      { name: "completion_date", label: "Completion Date", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["completed", "in_progress", "planned"] },
      { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
    ],
    Volunteering: volunteeringConfig.fields,
    Leadership: leadershipConfig.fields,
    CareerHistory: careerHistoryConfig.fields,
    Education: educationConfig.fields,
    Research: researchConfig.fields,
    Publication: publicationsConfig.fields,
    Membership: membershipConfig.fields,
    Credential: [
      { name: "name", label: "Credential Name", type: "text", required: true, colSpan: 2 },
      { name: "credential_type", label: "Type", type: "select", options: professionModule.credentialTypes },
      { name: "issuing_body", label: "Issuing Body", type: "select", options: professionModule.issuingBodies },
      { name: "license_number", label: "Number", type: "text" },
      { name: "jurisdiction", label: "Jurisdiction", type: "select", options: professionModule.jurisdictions },
      { name: "issue_date", label: "Issue Date", type: "date" },
      { name: "expiration_date", label: "Expiration", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["active", "expiring", "expired", "pending", "inactive"] },
      { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
    ],
    Document: documentConfig.fields.filter((f) => f.name !== "file_url"),
  };
}