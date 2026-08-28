import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const credentialId = body?.credential_id;

    if (!credentialId || typeof credentialId !== "string") {
      return Response.json({ error: "credential_id is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Fetch the credential (service role bypasses RLS). May be null if deleted.
    let credential = null;
    try {
      credential = await svc.entities.Credential.get(credentialId);
    } catch (_e) {
      credential = null;
    }

    // Credential gone → remove any linked reminder and stop.
    if (!credential) {
      await svc.entities.Reminder.deleteMany({ source_credential_id: credentialId });
      return Response.json({ ok: true, action: "deleted_orphan_reminder" });
    }

    const ownerId = credential.created_by_id;
    const expirationDate = credential.expiration_date;

    // No expiration date → no reminder should exist for this credential.
    if (!expirationDate) {
      await svc.entities.Reminder.deleteMany({ source_credential_id: credentialId });
      return Response.json({ ok: true, action: "removed_no_expiration" });
    }

    const title = `${credential.name || "Credential"} — expiration`;
    const relatedName = credential.name || "";

    // Find the single reminder linked to this credential.
    const existing = await svc.entities.Reminder.filter({ source_credential_id: credentialId });

    if (!existing || existing.length === 0) {
      // Create exactly one reminder, owned by the credential owner.
      await svc.entities.Reminder.create({
        title,
        related_type: "Credential",
        related_name: relatedName,
        due_date: expirationDate,
        frequency: "one_time",
        status: "upcoming",
        source_credential_id: credentialId,
        owner_id: ownerId,
      });
      return Response.json({ ok: true, action: "created", owner_id: ownerId });
    }

    // Update the first match only; preserve status and owner_id.
    const reminder = existing[0];
    await svc.entities.Reminder.update(reminder.id, {
      title,
      related_name: relatedName,
      due_date: expirationDate,
    });

    // Clean up any stray duplicates (defensive — keep exactly one).
    if (existing.length > 1) {
      const extraIds = existing.slice(1).map((r) => r.id);
      for (const id of extraIds) {
        await svc.entities.Reminder.delete(id);
      }
    }

    return Response.json({ ok: true, action: "updated", owner_id: ownerId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}