import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, BookMarked, GraduationCap, FileText } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";

function fmt(d) { if (!d) return "—"; try { const p = parseISO(d); return isValid(p) ? format(p, "MMM d, yyyy") : d; } catch { return d; } }

export default function ContinuingEducation() {
  const { professionModule } = useProfession();
  const ce = professionModule.ce;
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const recs = await base44.entities.ContinuingEducation.list("-completion_date", 200);
      setItems(recs.filter((c) => !professionModule.key || c.profession === professionModule.key));
    }
    catch { setItems([]); }
  };
  useEffect(() => { load(); }, [professionModule.key]);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", provider: "", category: "", ce_type: "", credits: 0, completion_date: "", status: "completed", profession: professionModule.key, certificate_url: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { ...form, credits: Number(form.credits) || 0 };
      if (editing) { await base44.entities.ContinuingEducation.update(editing.id, payload); toast({ title: "Course updated" }); }
      else { await base44.entities.ContinuingEducation.create(payload); toast({ title: "Course added" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => { await base44.entities.ContinuingEducation.delete(it.id); await load(); toast({ title: "Course deleted" }); };

  const totals = useMemo(() => {
    if (!items) return null;
    const completed = items.filter((i) => i.status === "completed");
    const hours = completed.reduce((s, i) => s + (Number(i.credits) || 0), 0);
    const byCategory = {};
    completed.forEach((i) => {
      const k = i.category || "Uncategorized";
      byCategory[k] = (byCategory[k] || 0) + (Number(i.credits) || 0);
    });
    return { hours, count: completed.length, byCategory };
  }, [items]);

  const cycleTarget = ce.typicalAnnualHours * ce.typicalCycleYears;
  const progressPct = totals ? Math.min(100, Math.round((totals.hours / cycleTarget) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={ce.recordLabelPlural} description={`Track ${ce.unitLabel.toLowerCase()} and compliance for ${professionModule.label.toLowerCase()}.`}>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add {ce.recordLabel}</Button>
      </PageHeader>

      {/* Progress toward cycle */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center"><GraduationCap className="h-4 w-4 text-accent" /></div>
            <h2 className="font-heading font-semibold text-[20px]">Renewal Cycle Progress</h2>
          </div>
          <div className="text-sm tabular-nums">
            <span className="font-semibold">{totals?.hours ?? 0}</span>
            <span className="text-muted-foreground"> / {cycleTarget} {ce.unitLabel.toLowerCase()}</span>
          </div>
        </div>
        <Progress value={progressPct} className="h-2.5" />
        <div className="text-xs text-muted-foreground mt-2">
          Typical {professionModule.label.toLowerCase()} cycle: {ce.typicalAnnualHours} {ce.unitLabel.toLowerCase()}/year × {ce.typicalCycleYears} years. Actual requirements vary by state board.
        </div>
      </Card>

      {totals && Object.keys(totals.byCategory).length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, hrs]) => (
            <Card key={cat} className="p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{cat}</div>
                <div className="text-xs text-muted-foreground">{ce.unitLabel}</div>
              </div>
              <div className="text-xl font-heading font-semibold tabular-nums">{hrs}</div>
            </Card>
          ))}
        </div>
      )}

      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No {ce.recordLabelPlural.toLowerCase()} logged yet. Add a completed course to track your {ce.unitLabel.toLowerCase()}.
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => (
            <Card key={it.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{it.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{it.provider}{it.category ? ` · ${it.category}` : ""}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Completed {fmt(it.completion_date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="tabular-nums">{it.credits} {ce.creditLabel.toLowerCase()}</Badge>
                  {it.certificate_url
                    ? <FileText className="h-4 w-4 text-success" title="Certificate attached" />
                    : <FileText className="h-4 w-4 text-muted-foreground/30" title="No certificate" />}
                  <Badge variant={it.status === "completed" ? "success" : it.status === "in_progress" ? "warning" : "info"}>{it.status}</Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Edit ${ce.recordLabel}` : `Add ${ce.recordLabel}`}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Course Title *</Label>
              <Input value={form.title ?? ""} onChange={(e) => setField("title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Input value={form.provider ?? ""} onChange={(e) => setField("provider", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{ce.creditLabel} *</Label>
              <Input type="number" min="0" step="0.5" value={form.credits ?? 0} onChange={(e) => setField("credits", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category ?? ""} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {ce.categories.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={form.ce_type ?? ""} onValueChange={(v) => setField("ce_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {ce.types.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Completion Date</Label>
              <Input type="date" value={form.completion_date ?? ""} onChange={(e) => setField("completion_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "completed"} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["completed","in_progress","planned"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Certificate</Label>
              {form.certificate_url && (
                <div className="text-xs text-success flex items-center gap-1"><FileText className="h-3 w-3" /> Certificate attached</div>
              )}
              <Input type="file" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  setField("certificate_url", file_url);
                  toast({ title: "Certificate uploaded" });
                } catch (err) {
                  toast({ title: "Upload failed", variant: "destructive" });
                }
              }} />
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