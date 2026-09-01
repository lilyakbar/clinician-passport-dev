import React from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertCircle, XCircle, ExternalLink, ShieldCheck,
  Calendar, BookMarked, Clock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

export default function JurisdictionCard({ data }) {
  const { jurisdiction, licenses, requirements, source, last_checked, verification_status, analysis } = data;
  const total = analysis.total_hours;
  const totalPct = total.required > 0 ? Math.min(100, Math.round((total.documented / total.required) * 100)) : 0;

  const gapCategories = analysis.categories.filter(c => c.mandatory && !c.met);
  const unmetTopics = analysis.mandatory_topics.filter(t => !t.met);

  return (
    <Card className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-[20px]">{jurisdiction}</h3>
            <Badge variant={verification_status === "verified" ? "success" : "warning"} className="text-[11px]">
              {verification_status === "verified" ? (
                <><ShieldCheck className="h-3 w-3 mr-1" /> Verified source</>
              ) : (
                <><AlertCircle className="h-3 w-3 mr-1" /> Unverified source</>
              )}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {licenses.map(l => l.name).join(", ")}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="flex items-center gap-1 justify-end">
            <Calendar className="h-3 w-3" /> Checked {fmt(last_checked)}
          </div>
          {source?.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline mt-1">
              {source.name || "Source"} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Total hours */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">Total CE {requirements.cycle_years ? `(${requirements.cycle_years}-yr cycle)` : ""}</span>
          </div>
          <div className="text-sm tabular-nums">
            <span className={cn("font-semibold", total.met ? "text-success" : "text-warning")}>{total.documented}</span>
            <span className="text-muted-foreground"> / {total.required} hrs</span>
          </div>
        </div>
        <Progress value={totalPct} className="h-2" />
        {total.gap > 0 && (
          <div className="text-xs text-warning mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {total.gap} hours still needed
          </div>
        )}
      </div>

      {/* Category requirements */}
      {analysis.categories.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Mandatory Categories</div>
          <div className="space-y-2">
            {analysis.categories.map((cat, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {cat.met
                    ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    : <XCircle className="h-4 w-4 text-danger shrink-0" />}
                  <span className="text-sm truncate">{cat.name}</span>
                </div>
                <div className="text-xs tabular-nums shrink-0">
                  <span className={cat.met ? "text-success font-medium" : "text-muted-foreground"}>{cat.documented}</span>
                  <span className="text-muted-foreground"> / {cat.required} hrs</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandatory topics */}
      {unmetTopics.length > 0 && (
        <div className="rounded-lg bg-warning/5 border border-warning/20 p-3">
          <div className="text-xs font-semibold text-warning mb-1.5">Mandatory topics not yet documented</div>
          <div className="flex flex-wrap gap-1.5">
            {unmetTopics.map((t, i) => (
              <Badge key={i} variant="warning" className="text-[11px]">{t.topic}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Modality restrictions */}
      {analysis.modality.max_online_hours != null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Max online/self-study hours</span>
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums">{analysis.modality.documented_online} / {analysis.modality.max_online_hours}</span>
            {analysis.modality.online_met
              ? <CheckCircle2 className="h-4 w-4 text-success" />
              : <AlertTriangle className="h-4 w-4 text-warning" />}
          </div>
        </div>
      )}
      {analysis.modality.note && (
        <div className="text-xs text-muted-foreground italic">{analysis.modality.note}</div>
      )}

      {/* Additional requirements */}
      {requirements.additional_requirements?.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Other Renewal Requirements</div>
          <ul className="space-y-1">
            {requirements.additional_requirements.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optimize CE link */}
      <div className="pt-2 border-t">
        <Button asChild variant="outline" size="sm">
          <Link to={`/ask-my-career?mode=optimize_ce&q=What CE do I still need for my ${jurisdiction} dental license renewal, and which courses could count toward multiple states?`}>
            <BookMarked className="h-3.5 w-3.5" /> Optimize My CE for {jurisdiction}
          </Link>
        </Button>
      </div>
    </Card>
  );
}