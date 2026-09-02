import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileUp, X, Bug } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Drag-and-drop-only capture dialog (no native Browse button — avoids the
// Radix Dialog focus-trap / file-picker conflict). Uploads the file to private
// storage, invokes captureCredentialFromDocument to propose one credential
// (no DB writes), then hands the proposal + capture metadata back to the
// Credentials page, which opens the standard Credential form prefilled.
export default function CredentialDocumentCaptureDialog({ open, onOpenChange, professionModule, onCaptured }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [debug, setDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  const reset = () => { setError(""); setDragOver(false); setDebugInfo(null); };

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
        debug,
      });

      if (res?.debug) setDebugInfo(res.debug);

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
        {debugInfo && (
          <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2">
            <div className="flex items-center gap-1 font-medium text-foreground">
              <Bug className="h-3.5 w-3.5" /> Debug — {debugInfo.candidateCount ?? 0} candidate(s), text {debugInfo.textLength ?? 0} chars
            </div>
            {(debugInfo.candidates || []).map((c, i) => (
              <div key={i} className="space-y-0.5 border-t border-border pt-1.5">
                <div><span className="font-medium">#{i + 1} stage:</span> <span className="text-foreground">{c.stage}</span></div>
                <div className="text-muted-foreground">{c.reason}</div>
                {c.source_quote && <div className="text-muted-foreground italic truncate">quote: &ldquo;{c.source_quote}&rdquo;</div>}
                {c.dateNotes?.map((n, j) => <div key={j} className="text-warning">{n}</div>)}
                {c.licenseNote && <div className="text-warning">{c.licenseNote}</div>}
              </div>
            ))}
            {debugInfo.rawResult && (
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words border-t border-border pt-1.5">{JSON.stringify(debugInfo.rawResult, null, 1)}</pre>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
            <Checkbox checked={debug} onCheckedChange={(v) => setDebug(!!v)} disabled={busy} />
            Debug mode
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={busy}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}