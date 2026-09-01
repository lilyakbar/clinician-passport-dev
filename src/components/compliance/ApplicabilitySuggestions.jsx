import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Check, X } from "lucide-react";

function titleCase(slug) {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function requirementLabel(key, requirementKeys) {
  if (!key) return "Unknown";
  if (key === "overall") return "Overall CE";
  if (key.startsWith("category:")) {
    const k = key.substring(9);
    const cat = (requirementKeys?.categories || []).find((c) => c.key === k);
    if (cat) return cat.label;
    return titleCase(k.replace("unmapped_", ""));
  }
  if (key.startsWith("topic:")) {
    const k = key.substring(6);
    const t = (requirementKeys?.topics || []).find((tp) => tp.key === k);
    if (t) return `${t.label} (topic)`;
    return `${titleCase(k.replace("unmapped_", ""))} (topic)`;
  }
  return key;
}

export default function ApplicabilitySuggestions({
  credentialId,
  requirementKeys,
  onRefresh,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [ceMap, setCeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    if (!credentialId) {
      setLoading(false);
      return;
    }
    try {
      const [links, ceRecords] = await Promise.all([
        base44.entities.CeApplicability.filter({
          credential_id: credentialId,
          status: "ai_suggested",
        }),
        base44.entities.ContinuingEducation.list("-completion_date", 200),
      ]);
      const map = {};
      (ceRecords || []).forEach((ce) => {
        map[ce.id] = ce;
      });
      setCeMap(map);
      setSuggestions(links || []);
    } catch {
      setSuggestions([]);
    }
    setLoading(false);
  }, [credentialId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (link, status) => {
    setActing(link.id);
    try {
      await base44.entities.CeApplicability.update(link.id, { status });
      await load();
      onRefresh?.();
    } catch {
      /* non-fatal */
    }
    setActing(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading suggestions…
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-accent/20 bg-accent-soft/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">AI-Suggested CE Applicability</span>
        <Badge variant="secondary" className="text-[10px]">
          {suggestions.length} pending
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        These suggested links are{" "}
        <span className="font-medium text-foreground">not yet counted</span> in
        your compliance totals. Confirm or reject each to apply it.
      </p>
      <div className="space-y-2">
        {suggestions.map((link) => {
          const ce = ceMap[link.ce_id];
          const label = requirementLabel(link.requirement_key, requirementKeys);
          const isTopic = (link.requirement_key || "").startsWith("topic:");
          return (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md bg-card border border-border/50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {ce?.title || "(CE record unavailable)"}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  {ce ? <span>{ce.credits} credits</span> : null}
                  <span>→</span>
                  <span className="text-accent font-medium">{label}</span>
                  {isTopic && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      presence only
                    </Badge>
                  )}
                  {!isTopic && link.credits_applied > 0 && (
                    <span className="tabular-nums">
                      ({link.credits_applied} hrs proposed)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="compact"
                  variant="default"
                  onClick={() => handleAction(link, "confirmed")}
                  disabled={acting === link.id}
                >
                  <Check className="h-3.5 w-3.5" /> Confirm
                </Button>
                <Button
                  size="compact"
                  variant="outline"
                  onClick={() => handleAction(link, "rejected")}
                  disabled={acting === link.id}
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}