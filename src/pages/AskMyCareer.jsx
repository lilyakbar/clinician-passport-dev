import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Sparkles, Trash2, Clock, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams } from "react-router-dom";
import { MODES } from "@/components/askmycareer/modes";
import ResultView from "@/components/askmycareer/ResultView";
import SourceBadge from "@/components/SourceBadge";
import { useProfession } from "@/professions/ProfessionContext";
import { cn } from "@/lib/utils";

const TINTS = {
  history: "bg-accent/10 text-accent",
  credentials: "bg-primary/10 text-primary",
  career_lens: "bg-warning/10 text-warning",
  live_opportunities: "bg-accent/10 text-accent",
  connect: "bg-success/10 text-success",
  gap_detection: "bg-info/10 text-info",
  optimize_ce: "bg-primary/10 text-primary",
};

export default function AskMyCareer() {
  const { professionModule } = useProfession();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") || "history");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savingLens, setSavingLens] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const { toast } = useToast();

  const activeMode = MODES.find((m) => m.key === mode);

  const loadWorkspaces = async () => {
    try { setWorkspaces(await base44.entities.CareerLensWorkspace.list("-created_date", 20)); }
    catch { setWorkspaces([]); }
  };
  useEffect(() => { loadWorkspaces(); }, []);

  useEffect(() => {
    const m = searchParams.get("mode");
    const q = searchParams.get("q");
    if (m && m !== mode) setMode(m);
    if (q && q !== query) setQuery(q);
  }, [searchParams]);

  const ask = async (q) => {
    const question = (q ?? query).trim();
    if (!question) return;
    setQuery(question);
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("askMyCareer", { mode, query: question, profession: professionModule.key, professionLabel: professionModule.label });
      if (res.data?.error) {
        toast({ title: "Error", description: res.data.error, variant: "destructive" });
      } else {
        setResult(res.data);
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const saveLens = async () => {
    if (!result?.lens) return;
    setSavingLens(true);
    try {
      await base44.entities.CareerLensWorkspace.create({
        title: query.slice(0, 80) || "Career Lens",
        lens_type: activeMode.label,
        query,
        summary: result.summary || "",
        result_data: JSON.stringify({ lens: result.lens, matchedRecords: result.matchedRecords }),
      });
      await loadWorkspaces();
      toast({ title: "Career Lens saved to your workspaces" });
    } catch (e) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
    setSavingLens(false);
  };

  const deleteWorkspace = async (id) => {
    await base44.entities.CareerLensWorkspace.delete(id);
    await loadWorkspaces();
  };

  const visiblePrompts = showAllPrompts ? activeMode.prompts : activeMode.prompts.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          AI Career Intelligence
        </div>
        <h1 className="text-[32px] sm:text-[34px] font-heading font-semibold tracking-tight mt-1.5">
          Ask My Career
        </h1>
        <p className="text-[15px] text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Your AI command center for {professionModule.label.toLowerCase()}. Search your stored Passport, check current
          regulatory requirements, prepare for goals, and discover live opportunities — every answer clearly labeled
          as <span className="font-medium text-foreground">My Passport</span> or <span className="font-medium text-foreground">Live Source</span>.
        </p>
      </div>

      {/* Mode picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = m.key === mode;
          const tint = TINTS[m.key] || "bg-muted text-muted-foreground";
          return (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setResult(null); setQuery(""); setShowAllPrompts(false); }}
              className={cn(
                "text-left rounded-xl border p-4 transition-all duration-150 group",
                active
                  ? "border-accent/40 bg-accent-soft/50 shadow-card-hover"
                  : "border-border bg-card hover:border-accent/30 hover:shadow-card-hover"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                  active ? "bg-accent/15 text-accent" : tint
                )}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className={cn("text-[14px] font-medium", active ? "text-foreground" : "text-foreground")}>
                  {m.label}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-2.5 leading-snug">{m.description}</p>
              <div className="mt-3">
                <SourceBadge environment={m.environment} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Command input */}
      <div className="rounded-2xl border border-border bg-card shadow-card-hover p-2 pl-4 flex items-center gap-2.5 focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10 transition-all">
        <Sparkles className="h-5 w-5 text-accent shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask anything about your career, credentials, goals or opportunities…"
          className="flex-1 bg-transparent outline-none text-[15px] py-2.5 placeholder:text-muted-foreground"
        />
        <kbd className="hidden sm:inline-flex items-center rounded-md border border-border bg-muted/60 px-1.5 h-6 text-[11px] font-medium text-muted-foreground">
          ⏎
        </kbd>
        <Button
          onClick={() => ask()}
          disabled={loading || !query.trim()}
          className="h-10 px-4 rounded-xl gap-1.5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Ask</span>
        </Button>
      </div>

      {/* Suggested prompts */}
      {!result && !loading && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Try asking</div>
          <div className="flex flex-wrap gap-2">
            {visiblePrompts.map((p) => (
              <button
                key={p}
                onClick={() => ask(p)}
                className="text-left text-[13px] rounded-lg border border-border bg-card px-3 py-1.5 text-foreground/80 hover:border-accent/40 hover:bg-accent-soft/40 hover:text-foreground transition-all duration-150"
              >
                {p}
              </button>
            ))}
            {!showAllPrompts && activeMode.prompts.length > 4 && (
              <button
                onClick={() => setShowAllPrompts(true)}
                className="inline-flex items-center gap-1 text-[13px] rounded-lg px-3 py-1.5 text-accent hover:bg-accent-soft/40 transition-colors font-medium"
              >
                View more examples <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card className="p-10 flex flex-col items-center gap-3 border-dashed">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <div className="text-sm text-muted-foreground">
            {activeMode.environment === "LIVE SOURCE"
              ? "Searching live web sources…"
              : activeMode.environment === "BOTH"
              ? "Searching your Passport and live sources…"
              : "Searching your Passport…"}
          </div>
        </Card>
      )}

      {/* Result */}
      {result && !loading && (
        <Card className="p-5 sm:p-7">
          <ResultView result={result} onSaveLens={saveLens} savingLens={savingLens} />
        </Card>
      )}

      {/* Saved workspaces */}
      {workspaces.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> Saved Career Lenses</h2>
          <div className="space-y-2">
            {workspaces.map((w) => (
              <Card key={w.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{w.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{w.lens_type}</div>
                  {w.summary && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{w.summary.replace(/[#*]/g, "")}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteWorkspace(w.id)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}