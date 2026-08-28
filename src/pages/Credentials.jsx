import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Award, AlertTriangle, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";
import CredentialDocuments from "@/components/credentials/CredentialDocuments";

function fmt(d) {
  if (!d) return "—";
  try { const p = parseISO(d); return isValid(p) ? format(p, "MMM d, yyyy") : d; } catch { return d; }
}
function daysUntil(d) {
  if (!d) return null;
  try { const p = parseISO(d); return isValid(p) ? differenceInDays(p, new Date()) : null; } catch { return null; }
}

export default function Credentials() {
  const { professionModule } = useProfession();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const recs = await base44.entities.Credential.list("-expiration_date", 200);
      setItems(recs.filter((c) => !professionModule.key || c.profession === professionModule.key));
    }
    catch { setItems([]); }
  };
  useEffect(() => { load(); }, [professionModule.key]);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", credential_type: "", issuing_body: "", license_number: "", issue_date: "", expiration_date: "", status: "active", jurisdiction: "", profession: professionModule.key, notes: "" });
    setOpen(true);
  };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.credential_type) { toast({ title: "Name and type are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const days = daysUntil(form.expiration_date);
      const status = form.status || (days === null ? "active" : days < 0 ? "expired" : days <= 60 ? "expiring" : "active");
      const payload = { ...form, status };
      if (editing) { await base44.entities.Credential.update(editing.id, payload); toast({ title: "Credential updated" }); }
      else { await base44.entities.Credential.create(payload); toast({ title: "Credential added" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => {
    await base44.entities.Credential.delete(it.id);
    // Keep linked Documents but clear their link so they become standalone.
    try {
      await base44.entities.Document.updateMany(
        { linked_entity_type: "Credential", linked_entity_id: it.id },
        { $unset: { linked_entity_type: "", linked_entity_id: "" } }
      );
    } catch { /* unlink is best-effort */ }
    await load();
    toast({ title: "Credential deleted" });
  };

  const enriched = useMemo(() => {
    if (!items) return null;
    return items.map((c) => ({ ...c, _days: daysUntil(c.expiration_date) }));
  }, [items]);

  const summary = useMemo(() => {
    if (!enriched) return null;
    return {
      total: enriched.length,
      active: enriched.filter((c) => c.status === "active" && (c._days === null || c._days > 60)).length,
      expiring: enriched.filter((c) => c._days !== null && c._days >= 0 && c._days <= 60).length,
      expired: enriched.filter((c) => c._days !== null && c._days < 0).length,
    };
  }, [enriched]);

  return (
    <div className="space-y-6">
      <PageHeader title="Licenses & Credentials" description={`Track licenses, certifications, and registrations for ${professionModule.label.toLowerCase()}.`}>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Credential</Button>
      </PageHeader>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Award className="h-5 w-5 text-primary" /></div>
            <div><div className="text-2xl font-heading font-semibold tabular-nums leading-none">{summary.total}</div><div className="text-xs text-muted-foreground mt-1.5">Total</div></div>
          </Card>
          <Card className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-success" /></div>
            <div><div className="text-2xl font-heading font-semibold tabular-nums leading-none">{summary.active}</div><div className="text-xs text-muted-foreground mt-1.5">Active</div></div>
          </Card>
          <Card className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-warning" /></div>
            <div><div className="text-2xl font-heading font-semibold tabular-nums leading-none">{summary.expiring}</div><div className="text-xs text-muted-foreground mt-1.5">Expiring ≤60d</div></div>
          </Card>
          <Card className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-danger/10 flex items-center justify-center"><XCircle className="h-5 w-5 text-danger" /></div>
            <div><div className="text-2xl font-heading font-semibold tabular-nums leading-none">{summary.expired}</div><div className="text-xs text-muted-foreground mt-1.5">Expired</div></div>
          </Card>
        </div>
      )}

      {enriched === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : enriched.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No credentials yet. Add your first {professionModule.label.toLowerCase()} credential to start tracking.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {enriched.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    {professionModule.credentialTemplates?.[c.credential_type]?.critical && (
                      <ShieldCheck className="h-3 w-3 text-accent" />
                    )}
                    {c.credential_type}
                  </div>
                </div>
                <Badge variant={c._days !== null && c._days < 0 ? "danger" : c._days !== null && c._days <= 60 ? "warning" : "success"}>
                  {c._days === null ? "No expiry" : c._days < 0 ? "Expired" : c._days <= 60 ? `${c._days}d left` : "Active"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 text-sm">
                {c.issuing_body && <div><span className="text-muted-foreground text-xs">Issuer: </span>{c.issuing_body}</div>}
                {c.jurisdiction && <div><span className="text-muted-foreground text-xs">Jurisdiction: </span>{c.jurisdiction}</div>}
                {c.license_number && <div><span className="text-muted-foreground text-xs">Number: </span>{c.license_number}</div>}
                <div><span className="text-muted-foreground text-xs">Issued: </span>{fmt(c.issue_date)}</div>
                <div><span className="text-muted-foreground text-xs">Expires: </span>{fmt(c.expiration_date)}</div>
              </div>
              <CredentialDocuments credentialId={c.id} />
              <div className="flex justify-end gap-1 mt-4 pt-3 border-t">
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
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
                const tpl = professionModule.credentialTemplates?.[v];
                if (tpl && !form.issuing_body) setField("issuing_body", tpl.issuingBody);
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
              {(() => {
                const tpl = professionModule.credentialTemplates?.[form.credential_type];
                return tpl?.description ? (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-accent shrink-0 mt-0.5" /> {tpl.description}
                  </p>
                ) : null;
              })()}
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
            <div className="space-y-1.5">
              <Label>Jurisdiction</Label>
              <Select value={form.jurisdiction ?? ""} onValueChange={(v) => setField("jurisdiction", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {professionModule.jurisdictions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}