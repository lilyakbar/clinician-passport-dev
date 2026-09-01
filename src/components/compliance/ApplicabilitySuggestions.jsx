import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Sparkles, Link2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ApplicabilitySuggestions({ suggestions, orphanedLinks, onConfirm, onReject }) {
  const [pending, setPending] = useState(new Set());

  const act = async (id, action) => {
    setPending((prev) => new Set(prev).add(id));
    try {
      await action(id);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const hasSuggestions = suggestions.length > 0;
  const hasOrphans = orphanedLinks.length > 0;

  if (!hasSuggestions && !hasOrphans) return null;

  return (
    <div className="space-y-3">
      {hasSuggestions && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested CE Applicability ({suggestions.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-accent/15 bg-accent/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.ce_title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {s.requirement_label}
                      {s.credits_applied > 0 && ` · ${s.credits_applied} hrs`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="compact"
                    variant="outline"
                    disabled={pending.has(s.id)}
                    onClick={() => act(s.id, onReject)}
                    className="h-7 w-7 p-0"
                    title="Reject"
                  >
                    {pending.has(s.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="compact"
                    disabled={pending.has(s.id)}
                    onClick={() => act(s.id, onConfirm)}
                    className="h-7 px-2.5"
                    title="Confirm"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOrphans && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-semibold text-warning">
              Orphaned Links ({orphanedLinks.length})
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            These confirmed links reference requirements no longer in the current set. They are excluded from compliance until re-mapped.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {orphanedLinks.map((o) => (
              <Badge key={o.id} variant="warning" className="text-[11px]">
                {o.ce_title} → {o.requirement_key}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}