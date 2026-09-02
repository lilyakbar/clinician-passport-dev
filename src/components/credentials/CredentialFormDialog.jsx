import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { parseISO, isValid, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

function daysUntil(d) {
  if (!d) return null;
  try { const p = parseISO(d); return isValid(p) ? differenceInDays(p, new Date()) : null; } catch { return null; }
}

const EMPTY = {
  name: "", credential_type: "", issuing_body: "", license_number: "",
  issue_date: "", expiration_date: "", status: "active", jurisdiction: "",
  profession: "", notes: "",
};

// Reusable Add/Edit Credential dialog. Extracted verbatim from the Credentials
// page so both Credentials and Compliance share one form. `defaultType`
// preselects a credential type when opening for a new record (no-op when editing).
export default function CredentialFormDialog({ open, onOpenChange, editing, professionModule, onSaved, defaultType, prefill, captureMeta }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const tpl = professionModule.credentialTemplates?.[form.credential_type];
  const professionUsesJurisdictionFlag = Object.values(professionModule.credentialTemplates || {}).some((t) => t.requiresJurisdiction === true);
  const showJurisdiction = !professionUsesJurisdictionFlag || tpl?.requiresJurisdiction === true;
  const jurisdictionRequired = tpl?.requiresJurisdiction === true;
  const jurisdictionLabel = professionModule.jurisdictionLabel || "Jurisdiction";

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({ ...editing });
    } else if (prefill) {
      setForm({ ...EMPTY, profession: professionModule.key, ...prefill });
    } else {
      setForm({ ...EMPTY, profession: professionModule.key, credential_type: defaultType || "" });
    }
  }, [open, editing, professionModule.key, defaultType, prefill]);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));

  const save = async () => {
    if (!form.name || !form.credential_type) { toast({ title: "Name and type are required", variant: "destructive" }); return; }
    if (jurisdictionRequired && !form.jurisdiction) { toast({ title: `${jurisdictionLabel} is required for this credential type`, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const days = daysUntil(form.expiration_date);
      const status = form.status || (days === null ? "active" : days < 0 ? "expired" : days <= 60 ? "expiring" : "active");
      const payload = { ...form, status };
      if (captureMeta && !editing) {
        payload.source = "document_capture";
        if (captureMeta.file_name) payload.source_document_name = captureMeta.file_name;
      }
      if (editing) {
        await base44.entities.Credential.update(editing.id, payload);
        toast({ title: "Credential updated" });
      } else {
        const created = await base44.entities.Credential.create(payload);
        if (captureMeta?.file_uri && created?.id) {
          try {
            await base44.entities.Document.create({
              title: captureMeta.file_name || "Uploaded document",
              category: "Credential",
              file_url: captureMeta.file_uri,
              linked_entity_type: "Credential",
              linked_entity_id: created.id,
            });
          } catch { /* document link is best-effort */ }
        }
        toast({ title: "Credential added" });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Credential" : "Add Credential"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label>Credential Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. California Dental License" />
          </div>
          <div className="space-y-1.5">
            <Label>Credential Type *</Label>
            <Select value={form.credential_type ?? ""} onValueChange={(v) => {
              setField("credential_type", v);
              const newTpl = professionModule.credentialTemplates?.[v];
              if (newTpl && !form.issuing_body) setField("issuing_body", newTpl.issuingBody);
              if (newTpl?.nameTemplate && !form.name && form.jurisdiction) {
                const stateName = professionModule.stateNames?.[form.jurisdiction];
                if (stateName) setField("name", newTpl.nameTemplate.replace("{state}", stateName));
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {professionModule.credentialTypes.map((o) => (
                  <SelectItem key={o} value={o}>
                    {professionModule.credentialTemplates?.[o]?.critical ? "★ " : ""}{o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tpl?.description && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <ShieldCheck className="h-3 w-3 text-accent shrink-0 mt-0.5" /> {tpl.description}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Body</Label>
            <Select value={form.issuing_body ?? ""} onValueChange={(v) => setField("issuing_body", v)}>
              <SelectTrigger><SelectValue placeholder="Select body…" /></SelectTrigger>
              <SelectContent>
                {professionModule.issuingBodies.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{professionModule.credentialTemplates?.[form.credential_type]?.numberLabel || "License / ID Number"}</Label>
            <Input value={form.license_number ?? ""} onChange={(e) => setField("license_number", e.target.value)} />
          </div>
          {showJurisdiction && (
            <div className="space-y-1.5">
              <Label>{jurisdictionLabel}{jurisdictionRequired ? " *" : ""}</Label>
              <Select value={form.jurisdiction ?? ""} onValueChange={(v) => {
                setField("jurisdiction", v);
                if (tpl?.nameTemplate && !form.name) {
                  const stateName = professionModule.stateNames?.[v];
                  if (stateName) setField("name", tpl.nameTemplate.replace("{state}", stateName));
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {professionModule.jurisdictions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issue_date ?? ""} onChange={(e) => setField("issue_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiration Date</Label>
            <Input type="date" value={form.expiration_date ?? ""} onChange={(e) => setField("expiration_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setField("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["active","expiring","expired","pending","inactive"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}