import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import SourceBadge from "@/components/SourceBadge";
import { entityRoute, entityLabel } from "@/lib/passportRoutes";
import { ExternalLink, FileText, AlertTriangle, BookOpen, Globe, ShieldCheck, Link2, Sparkles, Save, Telescope } from "lucide-react";
import ReactMarkdown from "react-markdown";

function RecordChip({ record }) {
  const route = entityRoute[record.entity] || "/";
  return (
    <Link
      to={route}
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{entityLabel[record.entity] || record.entity}</span>
      </div>
      <div className="text-sm font-medium mt-0.5 truncate">{record.title}</div>
      {record.subtitle && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{record.subtitle}</div>}
      {record.reason && <div className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2">{record.reason}</div>}
    </Link>
  );
}

export default function ResultView({ result, onSaveLens, savingLens }) {
  if (!result) return null;

  return (
    <div className="space-y-6">
      {/* Environment banner */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <SourceBadge environment={result.environment} />
          <span className="text-xs text-muted-foreground">Answer sourced from {(result.environment || "MY PASSPORT").toLowerCase()}</span>
        </div>
        {result.lens && (
          <button
            onClick={onSaveLens}
            disabled={savingLens}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {savingLens ? "Saving…" : "Save as workspace"}
          </button>
        )}
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-li:leading-relaxed prose-headings:font-heading text-foreground">
          <ReactMarkdown>{result.summary}</ReactMarkdown>
        </div>
      )}

      {/* Disclaimer */}
      {result.disclaimer && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {result.disclaimer}
        </div>
      )}

      {/* Career Lens */}
      {result.lens && (
        <div className="space-y-4">
          {result.lens.categories?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Telescope className="h-4 w-4 text-muted-foreground" /> Organized for your goal</h3>
              <div className="space-y-4">
                {result.lens.categories.map((cat, i) => (
                  <div key={i}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{cat.name}</div>
                    {cat.records.length > 0 ? (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {cat.records.map((r) => <RecordChip key={r.id} record={r} />)}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No records found in this category.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(result.lens.missing?.length > 0 || result.lens.documentsToLocate?.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {result.lens.missing?.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Missing information</div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {result.lens.missing.map((m, i) => <li key={i} className="flex gap-2"><span className="text-amber-500">•</span>{m}</li>)}
                  </ul>
                </div>
              )}
              {result.lens.documentsToLocate?.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Documents to locate</div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {result.lens.documentsToLocate.map((d, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">•</span>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Matched records */}
      {result.matchedRecords?.length > 0 && !result.lens && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" /> Matching Passport records</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {result.matchedRecords.map((r) => <RecordChip key={r.id} record={r} />)}
          </div>
        </div>
      )}

      {/* Gaps */}
      {result.gaps?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Record-quality observations</h3>
          <div className="space-y-2">
            {result.gaps.map((g, i) => (
              <Link key={i} to={entityRoute[g.entity] || "/"} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:border-primary/40 transition-colors">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{g.title}</div>
                  <div className="text-xs text-muted-foreground">{g.issue}</div>
                </div>
                <span className="ml-auto text-xs text-primary shrink-0">Fix →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Live opportunities */}
      {result.opportunities?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> Live opportunities</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {result.opportunities.map((o, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{o.name}</div>
                  {o.type && <Badge variant="outline" className="shrink-0 text-[10px]">{o.type}</Badge>}
                </div>
                {o.organization && <div className="text-xs text-muted-foreground mt-0.5">{o.organization}</div>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                  {o.date && <span>{o.date}</span>}
                  {o.deadline && <span>Deadline: {o.deadline}</span>}
                  {o.location && <span>{o.location}</span>}
                </div>
                {o.why && <p className="text-xs text-muted-foreground mt-2 italic">{o.why}</p>}
                {o.url && (
                  <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {result.requirements?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Current requirements</h3>
          <div className="space-y-2">
            {result.requirements.map((r, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.requirement}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{[r.jurisdiction, r.licenseType, r.renewalPeriod].filter(Boolean).join(" · ")}</div>
                    {r.note && <p className="text-xs text-muted-foreground mt-1.5">{r.note}</p>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5">
                        <ExternalLink className="h-3 w-3" />{r.source || r.url}
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={r.official ? "default" : "secondary"} className="text-[10px]">{r.official ? "Official" : "Secondary"}</Badge>
                    <div className="text-[10px] mt-1 max-w-[150px] leading-tight">{r.verified}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Checked {r.lastChecked}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {result.sources?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Sources & verification</h3>
          <div className="space-y-2">
            {result.sources.map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.title || s.organization}</div>
                  <div className="text-xs text-muted-foreground">{s.organization}{s.note ? ` — ${s.note}` : ""}</div>
                  {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"><ExternalLink className="h-3 w-3" />{s.url}</a>}
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={s.official ? "default" : "secondary"} className="text-[10px]">{s.official ? "Official" : "Secondary"}</Badge>
                  <div className="text-[10px] text-muted-foreground mt-1">Checked {s.retrieved}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}