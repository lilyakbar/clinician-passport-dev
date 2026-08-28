import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { Plus, Pencil, Trash2, Loader2, Search, FileText, ExternalLink } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";
import { openFile } from "@/lib/fileAccess";

function fmtDate(d) {
  if (!d) return "—";
  try {
    const p = typeof d === "string" ? parseISO(d) : d;
    return isValid(p) ? format(p, "MMM yyyy") : String(d);
  } catch {
    return String(d);
  }
}

function displayValue(field, value) {
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "date") return fmtDate(value);
  if (field.type === "file") return value ? "File attached" : "—";
  return value || "—";
}

function resolveOptions(field, professionModule) {
  if (field.options) return field.options;
  if (field.optionsFromProfession && professionModule) {
    return professionModule[field.optionsFromProfession] || [];
  }
  return [];
}

export default function EntityManager({ config }) {
  const { entityName, title, singularTitle, description, fields, columns } = config;
  const { professionModule } = useProfession();
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await base44.entities[entityName].list("-created_date", 200);
      setItems(data);
    } catch (e) {
      setItems([]);
    }
  };

  useEffect(() => {
    setItems(null);
    load();
  }, [entityName]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) =>
      fields.some((f) => String(it[f.name] ?? "").toLowerCase().includes(q))
    );
  }, [items, query, fields]);

  const openNew = () => {
    setEditing(null);
    const init = {};
    fields.forEach((f) => {
      if (f.type === "boolean") init[f.name] = false;
      else if (f.type === "number") init[f.name] = 0;
      else init[f.name] = "";
    });
    setForm(init);
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...item });
    setOpen(true);
  };

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleFile = async (name, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setField(name, file_uri);
      if (!form.title && file.name) setField("title", file.name.replace(/\.[^.]+$/, ""));
      toast({ title: "File uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.name] && form[f.name] !== 0) {
        toast({ title: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await base44.entities[entityName].update(editing.id, payload);
        toast({ title: `${singularTitle} updated` });
      } else {
        await base44.entities[entityName].create(payload);
        toast({ title: `${singularTitle} added` });
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await base44.entities[entityName].delete(toDelete.id);
      await load();
      toast({ title: `${singularTitle} deleted` });
    } catch (e) {
      toast({ title: "Error deleting", description: e.message, variant: "destructive" });
    }
    setToDelete(null);
  };

  const colFields = columns.map((c) => fields.find((f) => f.name === c)).filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${title.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add {singularTitle}
        </Button>
      </div>

      {filtered === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} yet. Click “Add {singularTitle}” to get started.
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <Card key={item.id} className="p-4 hover:shadow-card-hover hover:border-accent/30 transition-all duration-150">
              <div className="flex items-start justify-between gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 flex-1 min-w-0">
                  {colFields.map((f) => (
                    <div key={f.name} className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
                      {f.type === "file" && item[f.name] ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try { await openFile(item[f.name]); }
                            catch (e) { toast({ title: "Could not open file", description: e.message, variant: "destructive" }); }
                          }}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline truncate"
                        >
                          <ExternalLink className="h-3 w-3" /> View file
                        </button>
                      ) : (
                        <div className="text-sm font-medium truncate">{displayValue(f, item[f.name])}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(item)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${singularTitle}` : `Add ${singularTitle}`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {fields.map((f) => {
              const opts = resolveOptions(f, professionModule);
              const colSpan = f.colSpan === 2 ? "col-span-2" : "col-span-1";
              return (
                <div key={f.name} className={`space-y-1.5 ${colSpan}`}>
                  <Label htmlFor={f.name} className="text-sm">
                    {f.label}{f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {f.type === "text" && (
                    <Input id={f.name} value={form[f.name] ?? ""} onChange={(e) => setField(f.name, e.target.value)} />
                  )}
                  {f.type === "textarea" && (
                    <Textarea id={f.name} value={form[f.name] ?? ""} rows={3} onChange={(e) => setField(f.name, e.target.value)} />
                  )}
                  {f.type === "date" && (
                    <Input id={f.name} type="date" value={form[f.name] ?? ""} onChange={(e) => setField(f.name, e.target.value)} />
                  )}
                  {f.type === "number" && (
                    <Input id={f.name} type="number" value={form[f.name] ?? 0} onChange={(e) => setField(f.name, Number(e.target.value))} />
                  )}
                  {f.type === "boolean" && (
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox id={f.name} checked={!!form[f.name]} onCheckedChange={(v) => setField(f.name, v)} />
                      <span className="text-sm text-muted-foreground">Yes</span>
                    </div>
                  )}
                  {f.type === "select" && (
                    <Select value={form[f.name] ?? ""} onValueChange={(v) => setField(f.name, v)}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {opts.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {f.type === "file" && (
                    <div className="space-y-2">
                      {form[f.name] && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4" /> File attached
                        </div>
                      )}
                      <Input type="file" disabled={uploading} onChange={(e) => handleFile(f.name, e.target.files?.[0])} />
                      {uploading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {singularTitle.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}