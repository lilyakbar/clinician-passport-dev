import React from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase, Award, ShieldCheck, BookMarked, FileText, Target,
  CheckCircle2, UploadCloud, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SetupGuide({ creds, positions, ce, goals, docs }) {
  const hasLicense = (creds || []).some(c => (c.credential_type || "").toLowerCase().includes("license"));
  const sections = [
    { key: "career", label: "Career History", icon: Briefcase, done: (positions || []).length > 0, to: "/career-history" },
    { key: "licenses", label: "Licenses", icon: Award, done: hasLicense, to: "/credentials" },
    { key: "credentials", label: "Credentials", icon: ShieldCheck, done: (creds || []).length > 0, to: "/credentials" },
    { key: "ce", label: "CE / CME", icon: BookMarked, done: (ce || []).length > 0, to: "/continuing-education" },
    { key: "documents", label: "Documents", icon: FileText, done: (docs || []).length > 0, to: "/documents" },
    { key: "goals", label: "Goals", icon: Target, done: (goals || []).length > 0, to: "/goals" },
  ];

  const completed = sections.filter(s => s.done).length;
  const pct = Math.round((completed / sections.length) * 100);

  if (completed === sections.length) return null;

  return (
    <Card className="p-6 border-accent/20 bg-gradient-to-br from-accent-soft/40 to-card">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-heading font-semibold text-[22px] tracking-tight">Set up your Passport</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your profile to unlock compliance intelligence, resume building, and AI career insights.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-heading font-semibold tabular-nums">{pct}%</div>
          <div className="text-[11px] text-muted-foreground">{completed} of {sections.length} done</div>
        </div>
      </div>

      <Progress value={pct} className="h-2 mb-5" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
        {sections.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-all",
              s.done
                ? "border-success/20 bg-success/5"
                : "border-border bg-card hover:border-accent/30 hover:shadow-sm"
            )}
          >
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              s.done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            )}>
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {s.done ? "Started" : "Not started"}
              </div>
            </div>
            {!s.done && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t">
        <Button asChild size="sm" variant="default">
          <Link to="/import-cv"><UploadCloud className="h-3.5 w-3.5" /> Import CV (fastest)</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/credentials"><Award className="h-3.5 w-3.5" /> Add License</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/credentials"><ShieldCheck className="h-3.5 w-3.5" /> Add Credential</Link>
        </Button>
      </div>
    </Card>
  );
}