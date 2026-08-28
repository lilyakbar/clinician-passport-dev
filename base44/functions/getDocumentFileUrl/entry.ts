import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns an openable URL for a Document's attached file.
// The frontend passes a document_id only — never a file URI — so the
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
    const documentId = body?.document_id;
    if (!documentId || typeof documentId !== "string") {
      return Response.json({ error: "document_id is required" }, { status: 400 });
    }

    // User-scoped get enforces RLS (owner/admin only). A record the caller
    // doesn't own comes back as not-found, so we don't leak its existence.
    let doc;
    try {
      doc = await base44.entities.Document.get(documentId);
    } catch {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }
    if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });
    if (doc.created_by_id !== user.id && user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const fileUrl = doc.file_url;
    if (!fileUrl) return Response.json({ error: "No file attached" }, { status: 404 });

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