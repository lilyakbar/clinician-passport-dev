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
import { Plus, Pencil, Trash2, Loader2, Send, FileText, Calendar } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

function fmt(d) { if (!d) return "—"; try { const p = parseISO(d); return isValid(p) ? format(p, "MMM d, yyyy") : d; } catch { return d; } }
const statusVariant = { drafting: "secondary", submitted: "info", interviewing: "warning", offered: "success", rejected: "danger", withdrawn: "outline" };
const statuses = ["drafting","submitted","interviewing","offered","rejected","withdrawn"];

export default function Applications() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => { try { setItems(await base44.entities.Application.list("-created_date", 200)); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));
  const openNew = () => { setEditing(null); setForm({ target_title: "", organization: "", position: "", status: "drafting", applied_date: "", deadline: "", cv_version: "", documents: "", notes: "" }); setOpen(true); };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.target_title) { toast({ title: "Target title is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editing) { await base44.entities.Application.update(editing.id, form); toast({ title: "Application updated" }); }
      else { await base44.entities.Application.create(form); toast({ title: "Application added" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => { await base44.entities.Application.delete(it.id); await load(); toast({ title: "Application deleted" }); };

  return (
    <div className="space-y-6">
      <PageHeader title="Applications" description="Track applications and prepare your CV for each role.">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Application</Button>
      </PageHeader>

      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No applications yet. Start one from the Opportunities page or add one manually.</Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Send className="h-[18px] w-[18px] text-primary" /></div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.target_title}</div>
                    <div className="text-sm text-muted-foreground truncate">{a.organization}{a.position ? ` · ${a.position}` : ""}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      {a.applied_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Applied {fmt(a.applied_date)}</span>}
                      {a.deadline && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Deadline {fmt(a.deadline)}</span>}
                      {a.cv_version && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{a.cv_version}</span>}
                    </div>
                  </div>
                </div>
                <Badge variant={statusVariant[a.status] || "outline"} className="shrink-0">{a.status}</Badge>
              </div>
              {a.notes && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{a.notes}</p>}
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t">
                <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Application" : "Add Application"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>Target Role / Title *</Label><Input value={form.target_title ?? ""} onChange={(e) => setField("target_title", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Organization</Label><Input value={form.organization ?? ""} onChange={(e) => setField("organization", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Position</Label><Input value={form.position ?? ""} onChange={(e) => setField("position", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "drafting"} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>CV Version</Label><Input value={form.cv_version ?? ""} onChange={(e) => setField("cv_version", e.target.value)} placeholder="e.g. CV v3 — Pediatric" /></div>
            <div className="space-y-1.5"><Label>Applied Date</Label><Input type="date" value={form.applied_date ?? ""} onChange={(e) => setField("applied_date", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" value={form.deadline ?? ""} onChange={(e) => setField("deadline", e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Documents</Label><Input value={form.documents ?? ""} onChange={(e) => setField("documents", e.target.value)} placeholder="List attached documents…" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} /></div>
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