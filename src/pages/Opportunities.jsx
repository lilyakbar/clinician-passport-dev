import React, { useState, useEffect } from "react";
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
import { Plus, Pencil, Trash2, Loader2, ExternalLink, MapPin, Calendar, Send } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";

function fmt(d) { if (!d) return "—"; try { const p = parseISO(d); return isValid(p) ? format(p, "MMM d, yyyy") : d; } catch { return d; } }
const statusVariant = { saved: "secondary", interested: "info", applied: "default", archived: "outline" };

export default function Opportunities() {
  const { professionModule } = useProfession();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => { try { setItems(await base44.entities.Opportunity.list("-created_date", 200)); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));
  const openNew = () => { setEditing(null); setForm({ title: "", organization: "", type: "", location: "", posted_date: "", deadline: "", link: "", description: "", status: "saved" }); setOpen(true); };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editing) { await base44.entities.Opportunity.update(editing.id, form); toast({ title: "Opportunity updated" }); }
      else { await base44.entities.Opportunity.create(form); toast({ title: "Opportunity saved" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => { await base44.entities.Opportunity.delete(it.id); await load(); toast({ title: "Opportunity deleted" }); };

  const moveToApplications = async (it) => {
    await base44.entities.Application.create({
      target_title: it.title,
      organization: it.organization,
      position: it.type,
      status: "drafting",
      deadline: it.deadline,
      notes: it.link || "",
    });
    await base44.entities.Opportunity.update(it.id, { status: "applied" });
    await load();
    toast({ title: "Moved to Applications", description: "Started a draft application." });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Opportunities" description={`Discover and track ${professionModule.label.toLowerCase()} career opportunities.`}>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Opportunity</Button>
      </PageHeader>

      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No opportunities saved yet. Add a role you're exploring.</Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((it) => (
            <Card key={it.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.title}</div>
                  {it.organization && <div className="text-sm text-muted-foreground mt-0.5 truncate">{it.organization}</div>}
                </div>
                <Badge variant={statusVariant[it.status] || "outline"}>{it.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                {it.type && <span>{it.type}</span>}
                {it.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{it.location}</span>}
                {it.deadline && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due {fmt(it.deadline)}</span>}
              </div>
              {it.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{it.description}</p>}
              <div className="flex items-center gap-1 mt-4 pt-3 border-t">
                {it.link && (
                  <Button variant="ghost" size="sm" asChild><a href={it.link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Open</a></Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => moveToApplications(it)}><Send className="h-4 w-4 mr-1" />Apply</Button>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Opportunity" : "Add Opportunity"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>Title *</Label><Input value={form.title ?? ""} onChange={(e) => setField("title", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Organization</Label><Input value={form.organization ?? ""} onChange={(e) => setField("organization", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type ?? ""} onValueChange={(v) => setField("type", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{professionModule.opportunityTypes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={form.location ?? ""} onChange={(e) => setField("location", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "saved"} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["saved","interested","applied","archived"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Posted Date</Label><Input type="date" value={form.posted_date ?? ""} onChange={(e) => setField("posted_date", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" value={form.deadline ?? ""} onChange={(e) => setField("deadline", e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Link</Label><Input value={form.link ?? ""} onChange={(e) => setField("link", e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setField("description", e.target.value)} /></div>
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