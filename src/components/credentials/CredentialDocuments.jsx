import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, ExternalLink, Paperclip } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";
import { documentConfig } from "@/coreConfigs";
import EntityFormDialog from "@/components/EntityFormDialog";

// Uploads and views Documents linked to a single Credential record.
// Reuses the same Add Document dialog as the main Documents page, pre-linking
// each new Document to this Credential via linked_entity_type / linked_entity_id.
export default function CredentialDocuments({ credentialId }) {
  const { professionModule } = useProfession();
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const all = await base44.entities.Document.list("-created_date", 200);
      setDocs(all.filter(
        (d) => d.linked_entity_type === "Credential" && d.linked_entity_id === credentialId
      ));
    } catch {
      setDocs([]);
    }
  };

  useEffect(() => { load(); }, [credentialId]);

  const viewDoc = async (docId) => {
    try {
      const res = await base44.functions.invoke("getDocumentFileUrl", { document_id: docId });
      if (res.data?.url) window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Could not open file", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-dashed border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" /> Documents
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileText className="h-3 w-3" /> Add document
        </button>
      </div>

      {docs && docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate flex items-center gap-1.5 min-w-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{d.title}</span>
              </span>
              <button
                type="button"
                onClick={() => viewDoc(d.id)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> View
              </button>
            </div>
          ))}
        </div>
      )}

      {docs && docs.length === 0 && (
        <div className="text-xs text-muted-foreground">No documents linked.</div>
      )}

      <EntityFormDialog
        open={open}
        onOpenChange={setOpen}
        entityName="Document"
        singularTitle="Document"
        fields={documentConfig.fields}
        editing={null}
        professionModule={professionModule}
        extraFields={{ linked_entity_type: "Credential", linked_entity_id: credentialId }}
        onSaved={load}
      />
    </div>
  );
}