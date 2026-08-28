import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

function resolveOptions(field, professionModule) {
  if (field.options) return field.options;
  if (field.optionsFromProfession && professionModule) {
    return professionModule[field.optionsFromProfession] || [];
  }
  return [];
}

// Reusable Add/Edit dialog extracted from EntityManager. `extraFields` lets a
// caller preset fixed fields (e.g. linking) on new records without exposing
// them in the form.
export default function EntityFormDialog({
  open, onOpenChange, entityName, singularTitle, fields, editing, professionModule, extraFields, onSaved,
}) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    if (editing) { setForm({ ...editing }); return; }
    const init = {};
    fields.forEach((f) => {
      if (f.type === "boolean") init[f.name] = false;
      else if (f.type === "number") init[f.name] = 0;
      else init[f.name] = "";
    });
    setForm({ ...init, ...(extraFields || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

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
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}