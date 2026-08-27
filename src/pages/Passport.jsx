import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Briefcase, GraduationCap, FlaskConical, FileText, Presentation,
  CalendarDays, HeartHandshake, Trophy, Users, UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import EntityManager from "@/components/EntityManager";
import {
  careerHistoryConfig, educationConfig, researchConfig, publicationsConfig,
  presentationsConfig, conferenceConfig, volunteeringConfig, leadershipConfig,
  membershipConfig,
} from "@/coreConfigs";

const SECTIONS = [
  { key: "career-history", label: "Career History / Training", icon: Briefcase, config: careerHistoryConfig },
  { key: "education", label: "Education", icon: GraduationCap, config: educationConfig },
  { key: "research", label: "Research", icon: FlaskConical, config: researchConfig },
  { key: "publications", label: "Publications", icon: FileText, config: publicationsConfig },
  { key: "presentations", label: "Presentations", icon: Presentation, config: presentationsConfig },
  { key: "conferences", label: "Conferences", icon: CalendarDays, config: conferenceConfig },
  { key: "volunteering", label: "Volunteering / Service", icon: HeartHandshake, config: volunteeringConfig },
  { key: "leadership", label: "Leadership", icon: Trophy, config: leadershipConfig },
  { key: "memberships", label: "Memberships", icon: Users, config: membershipConfig },
];

export default function Passport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = searchParams.get("section");
  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((s) => s.key === paramKey)
  );
  const active = SECTIONS[activeIndex] || SECTIONS[0];

  const [counts, setCounts] = useState({});

  useEffect(() => {
    // Lightweight counts for the sub-nav badges (best-effort, non-blocking).
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        SECTIONS.map(async (s) => {
          try {
            const recs = await base44.entities[s.config.entityName].list("-created_date", 200);
            return [s.key, recs.length];
          } catch {
            return [s.key, null];
          }
        })
      );
      if (!cancelled) setCounts(Object.fromEntries(results));
    })();
    return () => { cancelled = true; };
  }, []);

  const selectSection = (key) => {
    setSearchParams(key === "career-history" ? {} : { section: key }, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Passport header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-heading font-semibold tracking-tight text-foreground">Passport</h1>
          <p className="text-[14px] text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            Your longitudinal professional record — every position, degree, publication, and service entry in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link to="/import-cv"><UploadCloud className="h-4 w-4" /> Import CV / Resume</Link>
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* Compact in-page vertical section navigation */}
        <nav className="lg:sticky lg:top-6 self-start">
          <Card className="p-2">
            <ul className="space-y-0.5">
              {SECTIONS.map((s) => {
                const isActive = s.key === active.key;
                const count = counts[s.key];
                return (
                  <li key={s.key}>
                    <button
                      onClick={() => selectSection(s.key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <s.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "text-muted-foreground")} />
                      <span className="flex-1 truncate">{s.label}</span>
                      {count != null && (
                        <span className={cn(
                          "text-[11px] tabular-nums rounded-full px-1.5 py-0.5",
                          isActive ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </nav>

        {/* Active section content — reuses the existing EntityManager via its config */}
        <div className="min-w-0">
          <EntityManager key={active.key} config={active.config} />
        </div>
      </div>
    </div>
  );
}