import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Award, Bell, Target, BookMarked, AlertTriangle, CheckCircle2,
  Clock, ArrowRight, TrendingUp, Sparkles,
} from "lucide-react";
import { parseISO, isValid, differenceInDays } from "date-fns";
import { useProfession } from "@/professions/ProfessionContext";
import SetupGuide from "@/components/SetupGuide";
import { cn } from "@/lib/utils";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return null;
    return differenceInDays(d, new Date());
  } catch {
    return null;
  }
}

function statusBadge(days) {
  if (days < 0) return "bg-danger/10 text-danger border-danger/20";
  if (days < 30) return "bg-warning/10 text-warning border-warning/20";
  return "bg-info/10 text-info border-info/20";
}

export default function Dashboard() {
  const { profile, professionModule } = useProfession();
  const [creds, setCreds] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [goals, setGoals] = useState(null);
  const [ce, setCe] = useState(null);
  const [positions, setPositions] = useState(null);
  const [docs, setDocs] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Credential.list("-expiration_date", 100).catch(() => []),
      base44.entities.Reminder.list("-due_date", 100).catch(() => []),
      base44.entities.CareerGoal.list("-created_date", 100).catch(() => []),
      base44.entities.ContinuingEducation.list("-completion_date", 100).catch(() => []),
      base44.entities.CareerHistory.list("-start_date", 100).catch(() => []),
      base44.entities.Document.list("-created_date", 100).catch(() => []),
    ]).then(([c, r, g, ceRecs, ch, d]) => {
      setCreds(c); setReminders(r); setGoals(g); setCe(ceRecs); setPositions(ch); setDocs(d);
    });
  }, []);

  const expiringCreds = useMemo(() => {
    if (!creds) return [];
    return creds
      .map((c) => ({ ...c, _days: daysUntil(c.expiration_date) }))
      .filter((c) => c._days !== null && c._days <= 90)
      .sort((a, b) => a._days - b._days);
  }, [creds]);

  const upcomingReminders = useMemo(() => {
    if (!reminders) return [];
    return reminders
      .filter((r) => r.status !== "done")
      .map((r) => ({ ...r, _days: daysUntil(r.due_date) }))
      .filter((r) => r._days !== null && r._days <= 60)
      .sort((a, b) => a._days - b._days)
      .slice(0, 5);
  }, [reminders]);

  const ceHours = useMemo(() => {
    if (!ce) return 0;
    return ce.filter((c) => c.status === "completed").reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [ce]);

  const goalsProgress = useMemo(() => {
    if (!goals) return { total: 0, completed: 0, inProgress: 0 };
    return {
      total: goals.length,
      completed: goals.filter((g) => g.status === "completed").length,
      inProgress: goals.filter((g) => g.status === "in_progress").length,
    };
  }, [goals]);

  const currentRole = useMemo(() => {
    if (!positions) return null;
    return positions.find((p) => p.current) || positions[0] || null;
  }, [positions]);

  const loading = creds === null || reminders === null || goals === null || ce === null || docs === null;

  if (loading) {
    return <div className="flex justify-center py-24"><div className="h-8 w-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" /></div>;
  }

  const stats = [
    { label: "Active Credentials", value: creds.filter((c) => c.status === "active").length, icon: Award, tint: "bg-accent/10 text-accent", to: "/credentials" },
    { label: professionModule.ce.unitLabel + " (completed)", value: ceHours, icon: BookMarked, tint: "bg-primary/10 text-primary", to: "/continuing-education" },
    { label: "Active Goals", value: goalsProgress.total, icon: Target, tint: "bg-warning/10 text-warning", to: "/goals" },
    { label: "Open Reminders", value: reminders.filter((r) => r.status !== "done").length, icon: Bell, tint: "bg-info/10 text-info", to: "/reminders" },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-soft to-accent-soft/25 p-7 sm:p-9 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {professionModule.tagline}
            </div>
            <h1 className="text-[32px] font-heading font-semibold tracking-tight mt-2 text-foreground">
              Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.
            </h1>
            {currentRole && (
              <div className="mt-2 text-sm text-muted-foreground">
                {currentRole.position_title} · {currentRole.organization}
              </div>
            )}
          </div>
          <Button asChild className="self-start sm:self-auto">
            <Link to="/ask-my-career"><Sparkles className="h-4 w-4" /> Ask My Career</Link>
          </Button>
        </div>
      </div>

      <SetupGuide creds={creds} positions={positions} ce={ce} goals={goals} docs={docs} />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="group">
            <Card className="p-5 hover:shadow-card-hover hover:border-accent/30 transition-all duration-150 h-full">
              <div className="flex items-center justify-between">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", s.tint)}>
                  <s.icon className="h-[18px] w-[18px]" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition-colors" />
              </div>
              <div className="mt-3.5 text-[28px] font-heading font-semibold tabular-nums leading-none">{s.value}</div>
              <div className="text-[13px] text-muted-foreground mt-1.5">{s.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Expiring credentials */}
        <Card className="p-6 hover:shadow-card-hover hover:border-accent/25 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-warning" />
              </div>
              <h2 className="font-heading font-semibold text-[20px]">Needs Attention</h2>
            </div>
            <Link to="/credentials" className="text-xs text-muted-foreground hover:text-accent transition-colors">View all</Link>
          </div>
          {expiringCreds.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <CheckCircle2 className="h-4 w-4 text-success" /> No credentials expiring in the next 90 days.
            </div>
          ) : (
            <div className="space-y-2.5">
              {expiringCreds.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.credential_type}</div>
                  </div>
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0", statusBadge(c._days))}>
                    {c._days < 0 ? `${Math.abs(c._days)}d overdue` : `${c._days}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming reminders */}
        <Card className="p-6 hover:shadow-card-hover hover:border-accent/25 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-info/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-info" />
              </div>
              <h2 className="font-heading font-semibold text-[20px]">Upcoming Reminders</h2>
            </div>
            <Link to="/reminders" className="text-xs text-muted-foreground hover:text-accent transition-colors">View all</Link>
          </div>
          {upcomingReminders.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <CheckCircle2 className="h-4 w-4 text-success" /> No reminders due soon.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingReminders.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    {r.related_name && <div className="text-xs text-muted-foreground truncate">{r.related_name}</div>}
                  </div>
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0", statusBadge(r._days))}>
                    {r._days < 0 ? "Overdue" : r._days === 0 ? "Today" : `${r._days}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Goals progress */}
      <Card className="p-6 hover:shadow-card-hover hover:border-accent/25 transition-all duration-200">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            <h2 className="font-heading font-semibold text-[20px]">Career Goals</h2>
          </div>
          <Link to="/goals" className="text-xs text-muted-foreground hover:text-accent transition-colors">Manage</Link>
        </div>
        {goalsProgress.total === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No goals set yet. Define your career objectives to track progress.</div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[26px] font-heading font-semibold tabular-nums leading-none">{goalsProgress.total}</div>
              <div className="text-[13px] text-muted-foreground mt-1.5">Total Goals</div>
            </div>
            <div>
              <div className="text-[26px] font-heading font-semibold tabular-nums leading-none text-warning">{goalsProgress.inProgress}</div>
              <div className="text-[13px] text-muted-foreground mt-1.5">In Progress</div>
            </div>
            <div>
              <div className="text-[26px] font-heading font-semibold tabular-nums leading-none text-success">{goalsProgress.completed}</div>
              <div className="text-[13px] text-muted-foreground mt-1.5">Completed</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}