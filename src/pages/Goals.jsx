import React, { useState, useEffect } from "react";
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
import { Plus, Pencil, Trash2, Loader2, Target } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";

function fmt(d) { if (!d) return "—"; try { const p = parseISO(d); return isValid(p) ? format(p, "MMM yyyy") : d; } catch { return d; } }
const statusVariant = { not_started: "info", in_progress: "warning", completed: "success" };

export default function Goals() {
  const { professionModule } = useProfession();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const categories = ["Clinical Skills", "Specialty Training", "Practice Ownership", "Leadership", "Academic", "Work-Life Balance", "Financial", "Networking", "Other"];

  const load = async () => { try { setItems(await base44.entities.CareerGoal.list("-created_date", 200)); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));
  const openNew = () => { setEditing(null); setForm({ title: "", category: "", target_date: "", status: "not_started", progress: 0, milestones: "", notes: "" }); setOpen(true); };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { ...form, progress: Number(form.progress) || 0 };
      if (editing) { await base44.entities.CareerGoal.update(editing.id, payload); toast({ title: "Goal updated" }); }
      else { await base44.entities.CareerGoal.create(payload); toast({ title: "Goal added" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => { await base44.entities.CareerGoal.delete(it.id); await load(); toast({ title: "Goal deleted" }); };

  return (
    <div className="space-y-6">
      <PageHeader title="Career Goals" description={`Define and track your professional objectives in ${professionModule.label.toLowerCase()}.`}>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Goal</Button>
      </PageHeader>

      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No goals yet. Set your first career objective to start tracking progress.</Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((g) => (
            <Card key={g.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Target className="h-[18px] w-[18px] text-accent" /></div>
                  <div className="min-w-0">
                    <div className="font-medium">{g.title}</div>
                    {g.category && <div className="text-xs text-muted-foreground mt-0.5">{g.category}</div>}
                  </div>
                </div>
                <Badge variant={statusVariant[g.status] || "outline"}>{g.status.replace("_", " ")}</Badge>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Progress</span><span className="tabular-nums">{g.progress || 0}%</span>
                </div>
                <Progress value={g.progress || 0} className="h-2" />
              </div>
              {g.target_date && <div className="text-xs text-muted-foreground mt-3">Target: {fmt(g.target_date)}</div>}
              {g.milestones && <div className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{g.milestones}</div>}
              <div className="flex justify-end gap-1 mt-4 pt-3 border-t">
                <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(g)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Goal" : "Add Goal"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title ?? ""} onChange={(e) => setField("title", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category ?? ""} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{categories.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Target Date</Label><Input type="date" value={form.target_date ?? ""} onChange={(e) => setField("target_date", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status ?? "not_started"} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Progress (%)</Label><Input type="number" min="0" max="100" value={form.progress ?? 0} onChange={(e) => setField("progress", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Milestones</Label><Textarea rows={3} value={form.milestones ?? ""} onChange={(e) => setField("milestones", e.target.value)} placeholder="One per line…" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} /></div>
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