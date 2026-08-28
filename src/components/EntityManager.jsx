import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import EntityFormDialog from "@/components/EntityFormDialog";
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

export default function EntityManager({ config }) {
  const { entityName, title, singularTitle, description, fields, columns } = config;
  const { professionModule } = useProfession();
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
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

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (item) => { setEditing(item); setOpen(true); };

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
                            try {
                              if (entityName === "Document") {
                                const res = await base44.functions.invoke("getDocumentFileUrl", { document_id: item.id });
                                if (res.data?.url) window.open(res.data.url, "_blank", "noopener,noreferrer");
                              } else {
                                await openFile(item[f.name]);
                              }
                            } catch (e) { toast({ title: "Could not open file", description: e.message, variant: "destructive" }); }
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

      <EntityFormDialog
        open={open}
        onOpenChange={setOpen}
        entityName={entityName}
        singularTitle={singularTitle}
        fields={fields}
        editing={editing}
        professionModule={professionModule}
        onSaved={load}
      />

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