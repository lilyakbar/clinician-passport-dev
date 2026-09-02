import React from "react";
import { Bug } from "lucide-react";

// Read-only diagnostic panel for credential document captures. Renders the
// raw candidate, source_quote, post-grounding candidate, date notes, and
// license-number notes returned by captureCredentialFromDocument in debug
// mode. Diagnostic UI only — does not affect extraction, validation, or the
// prefilled form values.
export default function CaptureDiagnostics({ debug }) {
  if (!debug) return null;
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2">
      <div className="flex items-center gap-1 font-medium text-foreground">
        <Bug className="h-3.5 w-3.5" /> Capture diagnostics — {debug.candidateCount ?? 0} candidate(s), text {debug.textLength ?? 0} chars
      </div>
      {(debug.candidates || []).map((c, i) => (
        <div key={i} className="space-y-0.5 border-t border-border pt-1.5">
          <div><span className="font-medium">#{i + 1} stage:</span> <span className="text-foreground">{c.stage}</span></div>
          <div className="text-muted-foreground">{c.reason}</div>
          {c.source_quote && <div className="text-muted-foreground italic truncate">quote: &ldquo;{c.source_quote}&rdquo;</div>}
          {c.raw && (
            <div className="text-muted-foreground break-all">
              <span className="font-medium">raw:</span> {JSON.stringify(c.raw)}
            </div>
          )}
          {c.postGrounding && (
            <div className="text-muted-foreground break-all">
              <span className="font-medium">post-grounding:</span> {JSON.stringify(c.postGrounding)}
            </div>
          )}
          {c.validated && (
            <div className="text-foreground break-all">
              <span className="font-medium">validated:</span> {JSON.stringify(c.validated)}
            </div>
          )}
          {c.dateNotes?.length > 0 && (
            <div className="space-y-0.5">
              {c.dateNotes.map((n, j) => <div key={j} className="text-warning">{n}</div>)}
            </div>
          )}
          {c.licenseNote && <div className="text-warning">{c.licenseNote}</div>}
        </div>
      ))}
      {debug.rawResult && (
        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words border-t border-border pt-1.5">{JSON.stringify(debug.rawResult, null, 1)}</pre>
      )}
    </div>
  );
}