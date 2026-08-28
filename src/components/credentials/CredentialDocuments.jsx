import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, ExternalLink, Paperclip } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Uploads and views Documents linked to a single Credential record.
// Reuses the existing private upload (UploadPrivateFile) and the
// backend-signed view flow (getDocumentFileUrl by Document id).
export default function CredentialDocuments({ credentialId }) {
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
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

  const addDoc = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await base44.entities.Document.create({
        title: file.name.replace(/\.[^.]+$/, ""),
        file_url: file_uri,
        date_uploaded: new Date().toISOString().slice(0, 10),
        linked_entity_type: "Credential",
        linked_entity_id: credentialId,
      });
      toast({ title: "Document linked" });
      await load();
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

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
        <label className="cursor-pointer">
          <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <FileText className="h-3 w-3" /> Add document
          </span>
          <Input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => addDoc(e.target.files?.[0])}
          />
        </label>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </div>
      )}

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

      {docs && docs.length === 0 && !uploading && (
        <div className="text-xs text-muted-foreground">No documents linked.</div>
      )}
    </div>
  );
}