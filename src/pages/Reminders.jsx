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
import { Plus, Pencil, Trash2, Loader2, Bell, CheckCircle2 } from "lucide-react";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

function fmt(d) { if (!d) return "—"; try { const p = parseISO(d); return isValid(p) ? format(p, "MMM d, yyyy") : d; } catch { return d; } }
function daysUntil(d) { if (!d) return null; try { const p = parseISO(d); return isValid(p) ? differenceInDays(p, new Date()) : null; } catch { return null; } }

export default function Reminders() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try { setItems(await base44.entities.Reminder.list("-due_date", 200)); }
    catch { setItems([]); }
  };
  useEffect(() => { load(); }, []);

  const setField = (n, v) => setForm((f) => ({ ...f, [n]: v }));
  const openNew = () => { setEditing(null); setForm({ title: "", related_type: "", related_name: "", due_date: "", frequency: "one_time", status: "upcoming", notes: "" }); setOpen(true); };
  const openEdit = (it) => { setEditing(it); setForm({ ...it }); setOpen(true); };

  const save = async () => {
    if (!form.title || !form.due_date) { toast({ title: "Title and due date are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const days = daysUntil(form.due_date);
      const status = form.status || (days === null ? "upcoming" : days < 0 ? "due" : "upcoming");
      const payload = { ...form, status };
      if (editing) { await base44.entities.Reminder.update(editing.id, payload); toast({ title: "Reminder updated" }); }
      else { await base44.entities.Reminder.create(payload); toast({ title: "Reminder added" }); }
      setOpen(false); await load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (it) => { await base44.entities.Reminder.delete(it.id); await load(); toast({ title: "Reminder deleted" }); };
  const toggleDone = async (it) => { await base44.entities.Reminder.update(it.id, { status: it.status === "done" ? "upcoming" : "done" }); await load(); };

  const sorted = items ? [...items].sort((a, b) => (daysUntil(a.due_date) ?? 9999) - (daysUntil(b.due_date) ?? 9999)) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Reminders" description="License renewals, CE deadlines, and compliance tasks.">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Reminder</Button>
      </PageHeader>

      {sorted === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No reminders yet. Add one to stay ahead of deadlines.</Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map((r) => {
            const days = daysUntil(r.due_date);
            const done = r.status === "done";
            return (
              <Card key={r.id} className={`p-4 ${done ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleDone(r)} className="mt-0.5 shrink-0">
                    <CheckCircle2 className={`h-5 w-5 ${done ? "text-success fill-success/20" : "text-muted-foreground/40 hover:text-accent"}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${done ? "line-through" : ""}`}>{r.title}</div>
                    {r.related_name && <div className="text-xs text-muted-foreground mt-0.5">{r.related_name}</div>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant={done ? "success" : days === null ? "outline" : days < 0 ? "danger" : days <= 7 ? "warning" : "info"}>
                        {done ? "Done" : days === null ? "No date" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `in ${days}d`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Due {fmt(r.due_date)}</span>
                      {r.frequency && r.frequency !== "one_time" && <span className="text-xs text-muted-foreground">· {r.frequency}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Reminder" : "Add Reminder"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title ?? ""} onChange={(e) => setField("title", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Related Type</Label><Input value={form.related_type ?? ""} onChange={(e) => setField("related_type", e.target.value)} placeholder="e.g. License, CE" /></div>
              <div className="space-y-1.5"><Label>Related Name</Label><Input value={form.related_name ?? ""} onChange={(e) => setField("related_name", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Due Date *</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => setField("due_date", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={form.frequency ?? "one_time"} onValueChange={(v) => setField("frequency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["one_time","annual","biennial","triennial","custom"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
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