import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Read-only migration export. Two modes:
//   { mode: "manifest", export_all?: true }
//   { mode: "records", entity, skip?, limit?, export_all?: true }
//
// export_all requires admin and reads across all users via the service role.
// Default (self-scoped) uses the user-scoped client so RLS enforces isolation.
// This function NEVER creates, updates, deletes, or otherwise mutates data.

const ENTITIES = [
  "Profile", "Credential", "ContinuingEducation", "Document", "Reminder",
  "ComplianceProfile", "CareerHistory", "Education", "Research", "Publication",
  "Presentation", "Conference", "Volunteering", "Leadership", "Membership",
  "CareerGoal", "Opportunity", "Application", "CareerLensWorkspace",
];

// file-bearing entity/field pairs enumerated in the manifest.
const FILE_FIELDS = [
  { entity: "Document", field: "file_url" },
  { entity: "ContinuingEducation", field: "certificate_url" },
];

const SIGNED_URL_TTL = 3600;

function isPublicFileUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function guessExtension(value) {
  if (!value) return null;
  const m = String(value).match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  return m ? m[1].toLowerCase() : null;
}

const EXT_CONTENT_TYPES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", txt: "text/plain",
  html: "text/html", htm: "text/html", csv: "text/csv", json: "application/json",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  mov: "video/quicktime", zip: "application/zip",
};

function guessContentType(ext) {
  if (!ext) return null;
  return EXT_CONTENT_TYPES[ext] || null;
}

function suggestedFilename(entry) {
  const ext = guessExtension(entry.file_value) || "bin";
  return `${entry.entity}_${entry.record_id}_${entry.field}.${ext}`;
}

// Fetch a single page of an entity. Uses list(sort, limit, skip).
async function listPage(client, entity, sort, limit, skip) {
  const coll = client.entities[entity];
  if (!coll) throw new Error(`Unknown entity: ${entity}`);
  return await coll.list(sort, limit, skip);
}

// Enumerate every record of an entity by paging. Bounded by a hard ceiling to
// protect the 5-minute timeout; reports truncation via has_more.
async function enumerateAll(client, entity, sort = "-created_date", pageSize = 500, max = 100000) {
  const all = [];
  let skip = 0;
  let hasMore = false;
  while (skip < max) {
    const batch = await listPage(client, entity, sort, pageSize, skip);
    if (!batch || !batch.length) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
    hasMore = true;
  }
  if (all.length >= max) hasMore = true;
  return { records: all, has_more: hasMore };
}

async function buildFileManifest(client, svc) {
  const files = [];
  const errors = [];
  for (const { entity, field } of FILE_FIELDS) {
    const { records } = await enumerateAll(client, entity, "-created_date", 500);
    for (const rec of records) {
      const value = rec[field];
      if (!value || typeof value !== "string") continue;
      const isPublic = isPublicFileUrl(value);
      const entry = {
        id: `${entity}:${rec.id}:${field}`,
        entity,
        record_id: rec.id,
        field,
        file_value: value,
        is_public: isPublic,
        signed_url: null,
        signed_url_expires_in: null,
        suggested_filename: null,
        content_type_guess: null,
      };
      if (isPublic) {
        // Legacy public URL — recorded as-is, no signing.
        entry.suggested_filename = suggestedFilename(entry);
        entry.content_type_guess = guessContentType(guessExtension(value));
      } else {
        // Private file_uri — mint a long-lived signed URL for the export run.
        try {
          const { signed_url } = await svc.integrations.Core.CreateFileSignedUrl({
            file_uri: value,
            expires_in: SIGNED_URL_TTL,
          });
          entry.signed_url = signed_url;
          entry.signed_url_expires_in = SIGNED_URL_TTL;
          entry.suggested_filename = suggestedFilename(entry);
          entry.content_type_guess = guessContentType(guessExtension(value));
        } catch (e) {
          const msg = e?.message || "Failed to sign private file URL";
          entry.error = msg;
          errors.push({ stage: "file_signing", entity, record_id: rec.id, field, message: msg });
        }
      }
      files.push(entry);
    }
  }
  return { files, errors };
}

async function buildEntityInventory(client) {
  const inventory = {};
  const errors = [];
  for (const entity of ENTITIES) {
    try {
      const { records, has_more } = await enumerateAll(client, entity, "-created_date", 500);
      inventory[entity] = { count: records.length, has_more };
    } catch (e) {
      const msg = e?.message || "inventory unavailable";
      inventory[entity] = { count: null, has_more: false, unavailable: true };
      errors.push({ stage: "inventory", entity, message: msg });
    }
  }
  return { inventory, errors };
}

async function buildUsers(base44, user, exportAll, svc) {
  if (!exportAll) {
    return {
      users: [{ id: user.id, email: user.email, full_name: user.full_name, role: user.role }],
      errors: [],
    };
  }
  try {
    const users = await svc.entities.User.list("-created_date", 1000);
    return {
      users: (users || []).map((u) => ({
        id: u.id, email: u.email, full_name: u.full_name, role: u.role,
        created_date: u.created_date, updated_date: u.updated_date,
      })),
      errors: [],
    };
  } catch (e) {
    return {
      users: [{ id: user.id, email: user.email, full_name: user.full_name, role: user.role }],
      errors: [{ stage: "users", message: e?.message || "user listing failed" }],
    };
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const exportAll = body?.export_all === true;

    if (exportAll && user.role !== "admin") {
      return Response.json({ error: "export_all requires admin role" }, { status: 403 });
    }

    // Self-scoped reads use the user-scoped client (RLS-enforced).
    // export_all uses the service role to read across all users.
    const readClient = exportAll ? base44.asServiceRole : base44;
    const svc = base44.asServiceRole;

    if (mode === "manifest") {
      const [usersResult, inventoryResult, filesResult] = await Promise.all([
        buildUsers(base44, user, exportAll, svc),
        buildEntityInventory(readClient),
        buildFileManifest(readClient, svc),
      ]);
      const manifest_errors = [
        ...usersResult.errors,
        ...inventoryResult.errors,
        ...filesResult.errors,
      ];
      return Response.json({
        mode: "manifest",
        scope: exportAll ? "export_all" : "self",
        exported_at: new Date().toISOString(),
        exported_by: { id: user.id, email: user.email, role: user.role },
        users: usersResult.users,
        entities: ENTITIES,
        entity_inventory: inventoryResult.inventory,
        files: filesResult.files,
        manifest_errors,
        references: {
          workflows: ["base44/workflows/Credential Reminder Sync.jsonc"],
          profession_packs: ["src/professions/dentistry.js", "src/professions/medicine.js", "src/professions/index.js"],
          backend_functions: [
            "analyzeCompliance", "askMyCareer", "buildResume", "getCeCertificateUrl",
            "getDocumentFileUrl", "importFromCV", "quickCapture", "syncCredentialReminder",
          ],
        },
        notes: [
          "Read-only export. No application data was modified.",
          "Private file signed URLs expire after " + SIGNED_URL_TTL + " seconds.",
          "ComplianceProfile.requirements is preserved verbatim as a JSON string.",
          "Entity schemas are sourced from base44/entities/*.jsonc by the export client.",
        ],
      });
    }

    if (mode === "records") {
      const entity = body?.entity;
      if (!entity || !ENTITIES.includes(entity) && entity !== "User") {
        return Response.json({ error: "entity is required and must be a known entity" }, { status: 400 });
      }
      const limit = Math.min(Math.max(parseInt(body?.limit, 10) || 200, 1), 500);
      const skip = Math.max(parseInt(body?.skip, 10) || 0, 0);

      let records;
      if (entity === "User") {
        if (exportAll) {
          records = await svc.entities.User.list("-created_date", limit, skip);
        } else {
          records = skip === 0 ? [{
            id: user.id, email: user.email, full_name: user.full_name, role: user.role,
            created_date: user.created_date, updated_date: user.updated_date,
          }] : [];
        }
      } else {
        records = await listPage(readClient, entity, "-created_date", limit, skip);
      }
      records = records || [];
      const has_more = records.length === limit;
      return Response.json({
        mode: "records",
        scope: exportAll ? "export_all" : "self",
        entity,
        skip,
        limit,
        has_more,
        records,
      });
    }

    return Response.json({ error: "mode must be 'manifest' or 'records'" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}