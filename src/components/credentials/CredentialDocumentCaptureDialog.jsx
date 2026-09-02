import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileUp, X } from "lucide-react";

// Drag-and-drop-only capture dialog (no native Browse button — avoids the
// Radix Dialog focus-trap / file-picker conflict). Uploads the file to private
// storage, invokes captureCredentialFromDocument to propose one credential
// (no DB writes), then hands the proposal + capture metadata back to the
// Credentials page, which opens the standard Credential form prefilled.
export default function CredentialDocumentCaptureDialog({ open, onOpenChange, professionModule, onCaptured }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const reset = () => { setError(""); setDragOver(false); };

  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name || "";
    const ext = name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") {
      setError("Please drop a PDF or DOCX file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // 1. Upload to private storage (sensitive credential document).
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      if (!file_uri) throw new Error("Upload failed — no file reference returned.");

      // 2. Derive the profession config inputs the backend needs.
      const jurisdictionRequiredTypes = Object.entries(professionModule.credentialTemplates || {})
        .filter(([, t]) => t.requiresJurisdiction === true)
        .map(([k]) => k);

      // 3. Invoke the capture backend (proposes one credential; no DB writes).
      const res = await base44.functions.invoke("captureCredentialFromDocument", {
        file_uri,
        file_name: name,
        profession: professionModule.key,
        credential_types: professionModule.credentialTypes,
        jurisdiction_required_types: jurisdictionRequiredTypes,
        state_names: professionModule.stateNames,
        credential_type_aliases: professionModule.credentialTypeAliases,
      });

      if (!res || !res.credential) {
        throw new Error(res?.error || "No supported credential could be extracted from this document.");
      }

      // 4. Hand the proposed credential + capture metadata to the Credentials
      //    page, which opens the standard Credential form prefilled for review.
      onCaptured?.(res.credential, {
        file_uri,
        file_name: name,
        source_quote: res.source_quote || "",
      });
      reset();
    } catch (e) {
      setError(e?.message || "Something went wrong while reading the document.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    handleFile(e.dataTransfer?.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange?.(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add credential from document</DialogTitle>
        </DialogHeader>
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragOver ? "border-accent bg-accent-soft" : "border-border bg-muted/40"}`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
              {busy ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : <FileUp className="h-6 w-6 text-accent" />}
            </div>
            <div className="text-sm font-medium">
              {busy ? "Reading document…" : "Drop a PDF or DOCX here"}
            </div>
            <div className="text-xs text-muted-foreground">
              {busy ? "Extracting and validating a credential proposal." : "We'll privately read the file and pre-fill a credential for your review."}
            </div>
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-danger">
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={busy}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}