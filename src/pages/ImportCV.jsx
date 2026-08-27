import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, User, Briefcase, GraduationCap,
  FlaskConical, Presentation, HeartHandshake, Users, CalendarDays, Trophy
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTION_META = [
  { key: "profile",       label: "Profile",         icon: User,           color: "bg-accent/10 text-accent" },
  { key: "education",     label: "Education",        icon: GraduationCap,  color: "bg-primary/10 text-primary" },
  { key: "career_history",label: "Career History",   icon: Briefcase,      color: "bg-warning/10 text-warning" },
  { key: "memberships",   label: "Memberships",      icon: Users,          color: "bg-info/10 text-info" },
  { key: "leadership",    label: "Leadership",       icon: Trophy,         color: "bg-accent/10 text-accent" },
  { key: "research",      label: "Research",         icon: FlaskConical,   color: "bg-success/10 text-success" },
  { key: "presentations", label: "Presentations",    icon: Presentation,   color: "bg-primary/10 text-primary" },
  { key: "volunteering",  label: "Volunteering",     icon: HeartHandshake, color: "bg-warning/10 text-warning" },
  { key: "conferences",   label: "Conferences",      icon: CalendarDays,   color: "bg-info/10 text-info" },
];

function getEntryLabel(section, item) {
  switch (section) {
    case "profile":       return item.full_name || "Profile";
    case "education":     return `${item.degree || ""} — ${item.institution || ""}`;
    case "career_history":return `${item.position_title || ""} @ ${item.organization || ""}`;
    case "memberships":   return item.organization || "";
    case "leadership":    return `${item.role || ""} — ${item.organization || ""}`;
    case "research":      return item.title || "";
    case "presentations": return item.title || "";
    case "volunteering":  return `${item.role || ""} @ ${item.organization || ""}`;
    case "conferences":   return item.title || "";
    default:              return JSON.stringify(item).slice(0, 60);
  }
}

function getEntrySubtitle(section, item) {
  const dates = [item.start_date, item.end_date].filter(Boolean).map(d => d.slice(0, 7)).join(" – ");
  const current = item.current ? "Present" : "";
  const dateStr = item.start_date ? (item.current ? `${item.start_date.slice(0,7)} – Present` : dates) : "";
  switch (section) {
    case "profile":       return item.specialty || item.location || "";
    case "education":     return `${item.location || ""} ${dateStr ? "· " + dateStr : ""}`.trim();
    default:              return `${item.location || ""} ${dateStr ? "· " + dateStr : ""}`.trim();
  }
}

function SectionReview({ meta, data, checked, onToggle }) {
  const [expanded, setExpanded] = useState(true);
  const isProfile = meta.key === "profile";
  const items = isProfile ? (data ? [data] : []) : (Array.isArray(data) ? data : []);

  if (!items.length) return null;

  const allChecked = items.every((_, i) => checked[i] !== false);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", meta.color)}>
            <meta.icon className="h-4 w-4" />
          </div>
          <div>
            <span className="font-heading font-semibold text-[15px]">{meta.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={allChecked ? "success" : "warning"} className="text-[11px]">
            {items.filter((_, i) => checked[i] !== false).length} / {items.length} selected
          </Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((item, i) => (
            <label
              key={i}
              className={cn(
                "flex items-start gap-3.5 px-5 py-3.5 cursor-pointer transition-colors",
                checked[i] !== false ? "bg-accent/5" : "bg-muted/10"
              )}
            >
              <input
                type="checkbox"
                checked={checked[i] !== false}
                onChange={() => onToggle(i)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{getEntryLabel(meta.key, item)}</div>
                {getEntrySubtitle(meta.key, item) && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{getEntrySubtitle(meta.key, item)}</div>
                )}
                {item.description && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{item.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ImportCV() {
  const { toast } = useToast();
  const [stage, setStage] = useState("upload"); // upload | extracting | review | importing | done
  const [extracted, setExtracted] = useState(null);
  const [checked, setChecked] = useState({});
  const [dragging, setDragging] = useState(false);
  const [importStats, setImportStats] = useState(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStage("extracting");
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke("importFromCV", { file_url });
      const data = res.data?.extracted;
      if (!data) throw new Error("No data extracted from document.");
      setExtracted(data);
      // default all checked
      const initChecked = {};
      SECTION_META.forEach(({ key }) => {
        const items = key === "profile" ? (data[key] ? [data[key]] : []) : (data[key] || []);
        items.forEach((_, i) => { initChecked[`${key}.${i}`] = true; });
      });
      setChecked(initChecked);
      setStage("review");
    } catch (e) {
      toast({ title: "Extraction failed", description: e.message, variant: "destructive" });
      setStage("upload");
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleItem = (section, idx) => {
    const key = `${section}.${idx}`;
    setChecked(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const handleImport = async () => {
    setStage("importing");
    const stats = { profile: 0, education: 0, career_history: 0, memberships: 0, leadership: 0, research: 0, presentations: 0, volunteering: 0, conferences: 0 };

    try {
      for (const { key } of SECTION_META) {
        const isProfile = key === "profile";
        const items = isProfile ? (extracted[key] ? [extracted[key]] : []) : (extracted[key] || []);
        const selected = items.filter((_, i) => checked[`${key}.${i}`] !== false);
        if (!selected.length) continue;

        if (isProfile && selected[0]) {
          // upsert profile — just create (first-time use)
          await base44.entities.Profile.create(selected[0]);
          stats.profile = 1;
        } else {
          const entityMap = {
            education: "Education",
            career_history: "CareerHistory",
            memberships: "Membership",
            leadership: "Leadership",
            research: "Research",
            presentations: "Presentation",
            volunteering: "Volunteering",
            conferences: "Conference",
          };
          const entityName = entityMap[key];
          if (entityName) {
            await base44.entities[entityName].bulkCreate(selected);
            stats[key] = selected.length;
          }
        }
      }
      setImportStats(stats);
      setStage("done");
      toast({ title: "Import complete!", description: "Your Passport has been updated." });
    } catch (e) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
      setStage("review");
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PageHeader
        title="Import from CV / Resume"
        description="Upload any existing CV or resume — the AI will extract and structure your entire career history into your Passport automatically."
      />

      {stage === "upload" && (
        <Card className="p-10">
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-4 min-h-[280px] rounded-xl border-2 border-dashed transition-all cursor-pointer",
              dragging ? "border-accent bg-accent/8" : "border-border hover:border-accent/60 hover:bg-muted/30"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Upload className="h-8 w-8 text-accent" />
            </div>
            <div className="text-center">
              <p className="font-heading font-semibold text-[18px]">Drop your CV or resume here</p>
              <p className="text-sm text-muted-foreground mt-1.5">PDF, DOC, or DOCX — any format, any version</p>
            </div>
            <Button type="button" className="mt-2" onClick={() => {}}>
              <FileText className="h-4 w-4" /> Browse file
            </Button>
          </label>

          <div className="mt-6 grid sm:grid-cols-3 gap-4 text-center">
            {[
              { icon: "🧠", label: "AI-powered extraction", desc: "Reads any CV format and maps it to your Passport" },
              { icon: "✅", label: "You confirm everything", desc: "Review and deselect anything before it's saved" },
              { icon: "🔒", label: "Private info excluded", desc: "Phone, email, and home address are never imported" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-muted/40 p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stage === "extracting" && (
        <Card className="p-16 flex flex-col items-center gap-5 text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
          </div>
          <div>
            <p className="font-heading font-semibold text-[20px]">Extracting your career data…</p>
            <p className="text-sm text-muted-foreground mt-1.5">The AI is reading your document and structuring every section. This takes about 15–30 seconds.</p>
          </div>
        </Card>
      )}

      {stage === "review" && extracted && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Extraction complete — review and confirm what to import
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage("upload")}>Start over</Button>
              <Button onClick={handleImport}>Import selected to Passport</Button>
            </div>
          </div>

          <div className="space-y-3">
            {SECTION_META.map((meta) => {
              const isProfile = meta.key === "profile";
              const items = isProfile ? (extracted[meta.key] ? [extracted[meta.key]] : []) : (extracted[meta.key] || []);
              if (!items.length) return null;
              const sectionChecked = {};
              items.forEach((_, i) => { sectionChecked[i] = checked[`${meta.key}.${i}`] !== false; });
              return (
                <SectionReview
                  key={meta.key}
                  meta={meta}
                  data={extracted[meta.key]}
                  checked={sectionChecked}
                  onToggle={(i) => toggleItem(meta.key, i)}
                />
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStage("upload")}>Start over</Button>
            <Button onClick={handleImport}>Import selected to Passport</Button>
          </div>
        </>
      )}

      {stage === "importing" && (
        <Card className="p-16 flex flex-col items-center gap-5 text-center">
          <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
          </div>
          <div>
            <p className="font-heading font-semibold text-[20px]">Saving to your Passport…</p>
            <p className="text-sm text-muted-foreground mt-1.5">Writing your confirmed entries to the database.</p>
          </div>
        </Card>
      )}

      {stage === "done" && importStats && (
        <Card className="p-10 flex flex-col items-center gap-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <div>
            <p className="font-heading font-semibold text-[24px]">Your Passport is updated!</p>
            <p className="text-sm text-muted-foreground mt-1.5">The following sections were imported:</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
            {SECTION_META.filter(m => importStats[m.key] > 0).map((m) => (
              <div key={m.key} className="rounded-xl bg-muted/40 px-4 py-3 flex items-center gap-2.5">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", m.color)}>
                  <m.icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{importStats[m.key]} added</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStage("upload"); setExtracted(null); setImportStats(null); }}>
              Import another CV
            </Button>
            <Button onClick={() => window.location.href = "/"}>
              Go to Dashboard
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}