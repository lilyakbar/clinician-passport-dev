import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    resume: {
      type: "object",
      properties: {
        header: {
          type: "object",
          properties: {
            name: { type: "string" },
            credentials: { type: "string" },
            title: { type: "string", description: "Professional headline tailored to the target role" }
          }
        },
        summary: { type: "string", description: "3-4 sentence professional summary tailored to the role" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              bullets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Achievement-oriented bullet point" },
                    source_type: { type: "string" },
                    source_id: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    excluded: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_type: { type: "string" },
          source_id: { type: "string" },
          label: { type: "string", description: "Short title identifying this entry" },
          reason: { type: "string", description: "Why it wasn't included (1 sentence)" },
          suggested_section: { type: "string", description: "Which resume section it could fit in" },
          formatted_bullet: { type: "string", description: "Pre-written bullet point so user can one-click add" }
        }
      }
    }
  }
};

function cleanRecord(record) {
  if (!record) return null;
  const { created_date, updated_date, created_by_id, ...rest } = record;
  return rest;
}

function cleanProfile(p) {
  if (!p) return null;
  const { email, phone, linkedin, website, ...rest } = p;
  return rest;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { job_link, template_style, sample_resume_url } = await req.json();

    // Fetch all passport data in parallel
    const [profiles, education, career, creds, ce, research, pubs, pres, confs, leader, member, volunteer] = await Promise.all([
      base44.entities.Profile.list().catch(() => []),
      base44.entities.Education.list().catch(() => []),
      base44.entities.CareerHistory.list().catch(() => []),
      base44.entities.Credential.list().catch(() => []),
      base44.entities.ContinuingEducation.list().catch(() => []),
      base44.entities.Research.list().catch(() => []),
      base44.entities.Publication.list().catch(() => []),
      base44.entities.Presentation.list().catch(() => []),
      base44.entities.Conference.list().catch(() => []),
      base44.entities.Leadership.list().catch(() => []),
      base44.entities.Membership.list().catch(() => []),
      base44.entities.Volunteering.list().catch(() => []),
    ]);

    const passportData = {
      profile: cleanProfile(profiles[0]),
      education: education.map(cleanRecord),
      career_history: career.map(cleanRecord),
      credentials: creds.map(cleanRecord),
      continuing_education: ce.map(cleanRecord),
      research: research.map(cleanRecord),
      publications: pubs.map(cleanRecord),
      presentations: pres.map(cleanRecord),
      conferences: confs.map(cleanRecord),
      leadership: leader.map(cleanRecord),
      memberships: member.map(cleanRecord),
      volunteering: volunteer.map(cleanRecord),
    };

    const hasJob = !!job_link;
    const useWeb = hasJob;

    const prompt = `You are an expert healthcare resume writer and career coach. Your job is to curate a tailored, high-impact resume from a clinician's complete career record (their "Passport").

CRITICAL — NO FABRICATION: You must ONLY use information explicitly present in the Passport Data below. NEVER invent or fabricate degrees, institutions, credentials, dates, procedure counts, or any facts that are not in the data. If a field is missing or empty, simply omit it — do not guess or fill gaps. Every bullet point you write must be directly supported by a specific record in the Passport Data. When formatting a record into a bullet, rephrase and polish the language for impact, but do not add facts that aren't there.

${hasJob ? `TARGET JOB: The user wants to apply for a position. Research the job posting at this link and identify the key requirements, skills, and qualifications sought:
JOB LINK: ${job_link}

Tailor the resume to strongly position the candidate for THIS specific role — emphasize the most relevant experiences, skills, and achievements that match the job requirements.` : `No specific job link provided. Create a strong, general-purpose resume that presents the candidate's most well-rounded and impactful professional profile.`}

TEMPLATE STYLE: ${template_style || "Clinical/Academic"}
${template_style === "Clinical/Academic" ? "Emphasize education, research, publications, and clinical training. Use a structured, academic format." : ""}
${template_style === "Private Practice" ? "Emphasize clinical skills, patient care volume, and practice experience. Use a concise, practice-focused format." : ""}
${template_style === "Modern Minimal" ? "Use a clean, contemporary format with concise bullets and a minimalist aesthetic. Prioritize impact over completeness." : ""}
${template_style === "Comprehensive CV" ? "Use a detailed, chronological format that includes all major sections — education, positions, credentials, research, publications, presentations, leadership, service, and memberships." : ""}

${sample_resume_url ? "FORMAT REFERENCE: The user uploaded a sample resume whose layout, section order, and tone they admire. Analyze its structure and match that style in your output." : ""}

PASSPORT DATA (the clinician's full career record, with entity IDs for reference):
${JSON.stringify(passportData, null, 2)}

INSTRUCTIONS:
1. Curate a SELECTIVE resume — include only the most relevant and impactful entries for the target role. Do NOT include everything.
2. Write compelling, achievement-oriented bullet points. Start with action verbs. Quantify ONLY where the data explicitly contains numbers (patient volume, procedure counts, credits, hours). Never invent numbers.
3. Organize sections in a logical order for the target role. Common sections: Education, Clinical Experience, Credentials & Licensure, Research, Publications, Presentations, Leadership, Volunteer Service, Professional Memberships, Continuing Education, Conferences.
4. For each included bullet, include source_type (entity name) and source_id (the entity ID from the data) so it can be tracked.
5. Return an "excluded" array of entries you chose NOT to include. For each, provide: a short label, a one-sentence reason, the suggested section where it could fit, and a pre-formatted bullet point so the user can add it with one click if desired.
6. NEVER include personal contact info (phone, email, address, LinkedIn) anywhere in the resume.
7. The header should use the candidate's name and credentials from their profile. The title should be a professional headline based on the profile's specialty and the target role.
8. The summary should be 3-4 sentences highlighting the candidate's most relevant qualifications. Only reference facts that exist in the Passport Data.
9. REMEMBER: Every fact, institution, degree, date, credential, and number must come directly from the Passport Data. Polish the wording, but never add information that isn't there.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: useWeb,
      model: useWeb ? "gemini_3_1_pro" : "automatic",
      response_json_schema: RESUME_SCHEMA,
      ...(sample_resume_url ? { file_urls: [sample_resume_url] } : {})
    });

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}