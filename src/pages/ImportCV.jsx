import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useProfession } from "@/professions/ProfessionContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { MatchSectionReview } from "@/components/importcv/MatchSectionReview";
import {
  Upload, FileText, CheckCircle2, Loader2,
  User, Briefcase, GraduationCap,
  FlaskConical, Presentation, HeartHandshake, Users, CalendarDays, Trophy
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTION_META = [
  { key: "profile",        label: "Profile",         icon: User,           color: "bg-accent/10 text-accent",        entity: null },
  { key: "education",      label: "Education",       icon: GraduationCap,  color: "bg-primary/10 text-primary",     entity: "Education" },
  { key: "career_history", label: "Career History",   icon: Briefcase,      color: "bg-warning/10 text-warning",      entity: "CareerHistory" },
  { key: "memberships",    label: "Memberships",      icon: Users,          color: "bg-info/10 text-info",            entity: "Membership" },
  { key: "leadership",     label: "Leadership",       icon: Trophy,         color: "bg-accent/10 text-accent",        entity: "Leadership" },
  { key: "research",       label: "Research",         icon: FlaskConical,   color: "bg-success/10 text-success",      entity: "Research" },
  { key: "presentations",  label: "Presentations",    icon: Presentation,   color: "bg-primary/10 text-primary",     entity: "Presentation" },
  { key: "volunteering",   label: "Volunteering",     icon: HeartHandshake, color: "bg-warning/10 text-warning",      entity: "Volunteering" },
  { key: "conferences",    label: "Conferences",      icon: CalendarDays,   color: "bg-info/10 text-info",            entity: "Conference" },
];

const DECISION_DEFAULT = { new: "import", duplicate: "skip", possible: "skip" };

const PROFILE_FIELDS = ["full_name", "credentials_string", "specialty", "bio", "location"];

export default function ImportCV() {
  const { profile, reload } = useProfession();
  const { toast } = useToast();
  const [stage, setStage] = useState("upload"); // upload | extracting | review | importing | done
  const [extracted, setExtracted] = useState(null);
  const [matches, setMatches] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [importBatchId, setImportBatchId] = useState(null);
  const [sourceDocName, setSourceDocName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importStats, setImportStats] = useState(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStage("extracting");
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const res = await base44.functions.invoke("importFromCV", { file_uri, file_name: file.name });
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      if (!data?.extracted) throw new Error("No data extracted from document.");
      setExtracted(data.extracted);
      setMatches(data.matches || {});
      setImportBatchId(data.import_batch_id);
      setSourceDocName(data.source_document_name || file.name);

      const init = {};
      SECTION_META.forEach(({ key }) => {
        const isProfile = key === "profile";
        const items = isProfile ? (data.extracted[key] ? [data.extracted[key]] : []) : (data.extracted[key] || []);
        items.forEach((_, i) => {
          if (isProfile) {
            init[`${key}.${i}`] = { action: profile?.id ? "update" : "create" };
          } else {
            const state = data.matches?.[key]?.[i]?.state || "new";
            init[`${key}.${i}`] = DECISION_DEFAULT[state] || "import";
          }
        });
      });
      setDecisions(init);
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

  const setDecision = (section, idx, val) =>
    setDecisions(prev => ({ ...prev, [`${section}.${idx}`]: val }));

  // Merge incoming extracted fields into an existing record.
  // Never overwrites a non-empty existing value with an empty imported value.
  const mergeUpdate = (existing, incoming) => {
    const merged = { ...existing };
    for (const [k, v] of Object.entries(incoming || {})) {
      if (v !== undefined && v !== null && v !== "") merged[k] = v;
    }
    delete merged.id;
    delete merged.created_date;
    delete merged.updated_date;
    delete merged.created_by_id;
    return merged;
  };

  const handleImport = async () => {
    setStage("importing");
    const stats = {};
    SECTION_META.forEach((m) => { stats[m.key] = 0; });
    const provenance = {
      source: "cv_import",
      import_batch_id: importBatchId,
      source_document_name: sourceDocName,
    };

    try {
      // Profile: one canonical Profile per user. Apply only selected changed fields;
      // never overwrite a non-empty existing value with an empty extracted value.
      const profDecision = decisions["profile.0"];
      if (profDecision && profDecision.action !== "skip" && profDecision.action !== "keep" && extracted.profile) {
        const p = extracted.profile;
        const hasVal = (v) => v !== undefined && v !== null && v !== "" && String(v).trim().toLowerCase() !== "not provided";
        if (profile?.id) {
          const merged = {};
          PROFILE_FIELDS.forEach((f) => {
            const cvVal = p[f];
            if (!hasVal(cvVal)) return;
            if (profDecision.fields && f in profDecision.fields && !profDecision.fields[f]) return;
            merged[f] = cvVal;
          });
          if (Object.keys(merged).length > 0) {
            await base44.entities.Profile.update(profile.id, merged);
            stats.profile = 1;
            await reload();
          }
        } else {
          const merged = {};
          PROFILE_FIELDS.forEach((f) => {
            const cvVal = p[f];
            if (hasVal(cvVal)) merged[f] = cvVal;
          });
          await base44.entities.Profile.create({ profession: "dentistry", ...merged });
          stats.profile = 1;
          await reload();
        }
      }

      for (const meta of SECTION_META) {
        if (meta.key === "profile" || !meta.entity) continue;
        const items = extracted[meta.key] || [];
        for (let i = 0; i < items.length; i++) {
          const decision = decisions[`${meta.key}.${i}`];
          if (!decision || decision === "skip") continue;
          const item = items[i];
          const match = matches?.[meta.key]?.[i];

          if (decision === "import" || decision === "import_separately") {
            await base44.entities[meta.entity].create({ ...item, ...provenance });
            stats[meta.key] = (stats[meta.key] || 0) + 1;
          } else if (decision === "update_existing" && match?.matchId) {
            const merged = mergeUpdate(match.matchRecord, item);
            await base44.entities[meta.entity].update(match.matchId, { ...merged, ...provenance });
            stats[meta.key] = (stats[meta.key] || 0) + 1;
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

  const reset = () => {
    setStage("upload");
    setExtracted(null);
    setMatches(null);
    setDecisions({});
    setImportStats(null);
    setImportBatchId(null);
    setSourceDocName("");
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
              { icon: "✅", label: "You confirm everything", desc: "Review matches and choose what to import, update, or skip" },
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
            <p className="text-sm text-muted-foreground mt-1.5">The AI is reading your document and checking it against your Passport. This takes about 15–30 seconds.</p>
          </div>
        </Card>
      )}

      {stage === "review" && extracted && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Extraction complete — review matches and choose an action for each item
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Start over</Button>
              <Button onClick={handleImport}>Apply to Passport</Button>
            </div>
          </div>

          <div className="space-y-3">
            {SECTION_META.map((meta) => {
              const isProfile = meta.key === "profile";
              const items = isProfile ? (extracted[meta.key] ? [extracted[meta.key]] : []) : (extracted[meta.key] || []);
              if (!items.length) return null;
              return (
                <MatchSectionReview
                  key={meta.key}
                  meta={meta}
                  data={extracted[meta.key]}
                  sectionMatches={matches?.[meta.key]}
                  decisions={decisions}
                  onDecision={setDecision}
                />
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={reset}>Start over</Button>
            <Button onClick={handleImport}>Apply to Passport</Button>
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
            <p className="text-sm text-muted-foreground mt-1.5">The following sections were imported or updated:</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
            {SECTION_META.filter((m) => importStats[m.key] > 0).map((m) => (
              <div key={m.key} className="rounded-xl bg-muted/40 px-4 py-3 flex items-center gap-2.5">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", m.color)}>
                  <m.icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{importStats[m.key]} imported</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Import another CV</Button>
            <Button onClick={() => window.location.href = "/"}>Go to Dashboard</Button>
          </div>
        </Card>
      )}
    </div>
  );
}