// Profession module registry. The shared core stays profession-agnostic; each
// module defines its own credential types, governing bodies, CE/CME terminology,
// renewal rules, and opportunity categories. Add new modules here as they ship.
import { dentistry } from "./dentistry";
import { medicine } from "./medicine";

const registry = {
  dentistry,
  medicine,
};

export function getProfessionModule(key) {
  return registry[key] || registry.dentistry;
}

export const availableProfessions = Object.values(registry);

export function getProfessionLabel(key) {
  return (registry[key] || registry.dentistry).label;
}

// Future profession packs — listed in the switcher for visibility, not yet implemented.
// Each will follow the same module shape when it ships.
export const futureProfessions = [
  { key: "pa", label: "Physician Assistant (PA-C)" },
  { key: "np", label: "Nurse Practitioner / APRN" },
  { key: "pharmd", label: "Pharmacist (PharmD)" },
  { key: "rn", label: "Registered Nurse (RN)" },
  { key: "pt", label: "Physical Therapist (PT/DPT)" },
  { key: "ot", label: "Occupational Therapist (OT)" },
];