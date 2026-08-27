import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import ResumePreview from "@/components/resume/ResumePreview";
import {
  Link2, Sparkles, FileText, Upload, Loader2, Download,
  Plus, ArrowLeft, CheckCircle2, Wand2, Layout, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const TEMPLATES = [
  { key: "Clinical/Academic", label: "Clinical / Academic", desc: "Education, research, publications, training", icon: Layout },
  { key: "Private Practice", label: "Private Practice", desc: "Clinical skills, patient care, procedures", icon: FileCheck },
  { key: "Modern Minimal", label: "Modern Minimal", desc: "Clean, concise, impact-focused", icon: Sparkles },
  { key: "Comprehensive CV", label: "Comprehensive CV", desc: "Full chronological detail", icon: FileText },
];

export default function ResumeBuilder() {
  const { toast } = useToast();
  const [stage, setStage] = useState("input"); // input | building | result
  const [jobLink, setJobLink] = useState("");
  const [template, setTemplate] = useState("Clinical/Academic");
  const [sampleUrl, setSampleUrl] = useState(null);
  const [sampleName, setSampleName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [resume, setResume] = useState(null);
  const [excluded, setExcluded] = useState([]);

  const handleSampleUpload = useCallback(async (file) => {
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setSampleUrl(file_url);
      setSampleName(file.name);
      toast({ title: "Sample resume uploaded", description: "We'll match its format." });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const handleGenerate = async () => {
    setStage("building");
    try {
      const res = await base44.functions.invoke("buildResume", {
        job_link: jobLink || null,
        template_style: template,
        sample_resume_url: sampleUrl || null,
      });
      const data = res.data?.result;
      if (!data?.resume) throw new Error("No resume generated.");
      setResume(data.resume);
      setExcluded(data.excluded || []);
      setStage("result");
    } catch (e) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
      setStage("input");
    }
  };

  const handleAddExcluded = (idx) => {
    const item = excluded[idx];
    if (!item) return;
    // Add to resume
    setResume(prev => {
      const next = { ...prev, sections: [...prev.sections] };
      let sectionIdx = next.sections.findIndex(s => s.title === item.suggested_section);
      if (sectionIdx === -1) {
        next.sections.push({ title: item.suggested_section, bullets: [] });
        sectionIdx = next.sections.length - 1;
      }
      next.sections[sectionIdx] = {
        ...next.sections[sectionIdx],
        bullets: [...next.sections[sectionIdx].bullets, {
          text: item.formatted_bullet,
          source_type: item.source_type,
          source_id: item.source_id,
        }],
      };
      return next;
    });
    // Remove from excluded
    setExcluded(prev => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveBullet = (secIdx, bulIdx) => {
    setResume(prev => {
      const next = { ...prev, sections: [...prev.sections] };
      const bullet = next.sections[secIdx].bullets[bulIdx];
      // Add back to excluded
      setExcluded(prevEx => [...prevEx, {
        source_type: bullet.source_type,
        source_id: bullet.source_id,
        label: bullet.text.slice(0, 60) + (bullet.text.length > 60 ? "…" : ""),
        reason: "Removed by you — add it back anytime.",
        suggested_section: next.sections[secIdx].title,
        formatted_bullet: bullet.text,
      }]);
      // Remove from resume
      next.sections[secIdx] = {
        ...next.sections[secIdx],
        bullets: next.sections[secIdx].bullets.filter((_, j) => j !== bulIdx),
      };
      // Remove empty section
      if (next.sections[secIdx].bullets.length === 0) {
        next.sections = next.sections.filter((_, i) => i !== secIdx);
      }
      return next;
    });
  };

  const handleDownload = async () => {
    const element = document.getElementById("resume-document");
    if (!element) return;
    try {
      toast({ title: "Generating PDF…" });
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      const name = (resume?.header?.name || "resume").replace(/\s+/g, '_');
      pdf.save(`${name}_Resume.pdf`);
    } catch (e) {
      toast({ title: "PDF failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <PageHeader
        title="Resume Builder"
        description="Paste a job link and we'll curate a tailored resume from your Passport — then let you add back anything we left out."
      />

      {stage === "input" && (
        <div className="space-y-6">
          {/* Job link */}
          <Card className="p-6">
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
              <Link2 className="h-4 w-4 text-accent" /> Job posting link
            </label>
            <Input
              type="url"
              placeholder="https://practice.com/careers/associate-dentist"
              value={jobLink}
              onChange={(e) => setJobLink(e.target.value)}
              className="h-11 text-base"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Optional — leave blank for a general-purpose resume. We'll analyze the posting and tailor your resume to match.
            </p>
          </Card>

          {/* Template style */}
          <Card className="p-6">
            <label className="flex items-center gap-2 text-sm font-medium mb-4">
              <Layout className="h-4 w-4 text-accent" /> Choose a template style
            </label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  className={cn(
                    "text-left rounded-xl border-2 p-4 transition-all",
                    template === t.key
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border hover:border-accent/40 hover:bg-muted/30"
                  )}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center mb-3",
                    template === t.key ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <t.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Sample resume upload */}
          <Card className="p-6">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Upload className="h-4 w-4 text-accent" /> Sample resume format <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-4">
              Upload a resume whose layout you admire and we'll match its style.
            </p>
            {sampleUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
                <FileText className="h-5 w-5 text-accent" />
                <span className="text-sm font-medium flex-1 truncate">{sampleName}</span>
                <Badge variant="success" className="text-[11px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Uploaded</Badge>
                <Button variant="ghost" size="sm" onClick={() => { setSampleUrl(null); setSampleName(""); }}>Remove</Button>
              </div>
            ) : (
              <label
                className={cn(
                  "flex items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-all",
                  dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/40 hover:bg-muted/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleSampleUpload(e.dataTransfer.files[0]); }}
              >
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => handleSampleUpload(e.target.files[0])} />
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Drop a resume here or click to browse</span>
              </label>
            )}
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={handleGenerate} className="min-w-[180px]">
              <Wand2 className="h-4 w-4" /> Generate Resume
            </Button>
          </div>
        </div>
      )}

      {stage === "building" && (
        <Card className="p-16 flex flex-col items-center gap-5 text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
          </div>
          <div>
            <p className="font-heading font-semibold text-[20px]">Curating your resume…</p>
            <p className="text-sm text-muted-foreground mt-1.5">
              {jobLink ? "Analyzing the job posting and matching your experience." : "Selecting your strongest entries."} This takes 20–40 seconds.
            </p>
          </div>
        </Card>
      )}

      {stage === "result" && resume && (
        <>
          <div className="flex items-center justify-between no-print">
            <Button variant="outline" onClick={() => { setStage("input"); setResume(null); setExcluded([]); }}>
              <ArrowLeft className="h-4 w-4" /> Start over
            </Button>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>

          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            {/* Resume preview */}
            <div className="space-y-3">
              <div className="no-print flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Hover any bullet to remove it. Items you add appear instantly.
              </div>
              <ResumePreview resume={resume} onRemoveBullet={handleRemoveBullet} />
            </div>

            {/* Excluded panel */}
            <div className="no-print lg:sticky lg:top-4 space-y-3">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-heading font-semibold text-[15px]">Not included</h3>
                  <Badge variant="warning" className="text-[11px]">{excluded.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We left these out to keep your resume focused. Click <span className="font-medium text-accent">Add</span> to include any of them.
                </p>
              </div>

              {excluded.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-6 text-center">
                  <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Everything is included. Your resume is complete.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
                  {excluded.map((item, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3.5 hover:border-accent/30 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="text-sm font-medium leading-snug">{item.label}</div>
                        <Button size="sm" variant="outline" className="shrink-0 h-7 px-2.5 text-xs" onClick={() => handleAddExcluded(i)}>
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{item.reason}</p>
                      {item.suggested_section && (
                        <Badge variant="outline" className="text-[10px]">{item.suggested_section}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}