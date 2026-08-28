import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns an openable URL for a ContinuingEducation record's certificate.
// The frontend passes a CE record id only — never a file URI — so the
// backend always signs the value stored on the record it owns, not an
// arbitrary URI supplied by the caller.

function isPublicFileUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const recordId = body?.record_id;
    if (!recordId || typeof recordId !== "string") {
      return Response.json({ error: "record_id is required" }, { status: 400 });
    }

    // User-scoped get enforces RLS (owner/admin only). A record the caller
    // doesn't own comes back as not-found, so we don't leak its existence.
    let rec;
    try {
      rec = await base44.entities.ContinuingEducation.get(recordId);
    } catch {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }
    if (!rec) return Response.json({ error: "Record not found" }, { status: 404 });
    if (rec.created_by_id !== user.id && user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const fileUrl = rec.certificate_url;
    if (!fileUrl) return Response.json({ error: "No certificate attached" }, { status: 404 });

    // Legacy public URLs open directly — no signing needed.
    if (isPublicFileUrl(fileUrl)) {
      return Response.json({ url: fileUrl });
    }

    // Private file URI — generate a temporary signed URL server-side.
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUrl,
      expires_in: 300,
    });

    return Response.json({ url: signed_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}