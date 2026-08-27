import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useProfession } from "@/professions/ProfessionContext";
import { getQuickCaptureFields } from "./entityFields";
import FieldInput from "./FieldInput";
import { entityLabel } from "@/lib/passportRoutes";

export default function QuickCaptureDialog({ open, onOpenChange }) {
  const { professionModule } = useProfession();
  const fieldMap = getQuickCaptureFields(professionModule);
  const [text, setText] = useState("");
  const [step, setStep] = useState("input");
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const reset = () => { setText(""); setCandidates([]); setStep("input"); };

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("quickCapture", { text });
      if (res.data?.error) {
        toast({ title: "Error", description: res.data.error, variant: "destructive" });
      } else {
        const cands = (res.data.candidates || []).map((c, i) => ({
          ...c, _id: i, fields: { ...c.fields },
        }));
        setCandidates(cands);
        setStep(cands.length ? "review" : "input");
        if (!cands.length) toast({ title: "No records detected", description: "Try adding more detail." });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const updateField = (idx, name, value) => {
    setCandidates((cs) => cs.map((c, i) => (i === idx ? { ...c, fields: { ...c.fields, [name]: value } } : c)));
  };
  const removeCandidate = (idx) => setCandidates((cs) => cs.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    let saved = 0;
    const errors = [];
    for (const c of candidates) {
      try {
        await base44.entities[c.entity].create({ ...c.fields });
        saved++;
      } catch (e) {
        errors.push(c.entity);
      }
    }
    setSaving(false);
    if (saved) toast({ title: `${saved} record${saved === 1 ? "" : "s"} added to your Passport` });
    if (errors.length) toast({ title: `${errors.length} record(s) could not be saved`, variant: "destructive" });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Add to My Passport
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Describe what happened naturally. The AI will detect possible career records for you to review before saving — it never invents missing details.
            </p>
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. I attended the AAE Annual Meeting in Boston, presented a poster, completed 6 hours of CE, volunteered at an oral cancer screening, and became chief resident."
            />
            <div className="flex justify-end">
              <Button onClick={analyze} disabled={loading || !text.trim()}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Analyze
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                I found {candidates.length} possible career record{candidates.length === 1 ? "" : "s"}. Review before saving.
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep("input")}>Edit text</Button>
            </div>

            {candidates.map((c, idx) => {
              const fields = (fieldMap[c.entity] || []).filter((f) => f.type !== "file");
              return (
                <Card key={idx} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="gap-1.5">
                      <CheckCircle2 className="h-3 w-3" /> {entityLabel[c.entity] || c.entity}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => removeCandidate(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {c.summary && <p className="text-xs text-muted-foreground mb-3">{c.summary}</p>}
                  {c.missing?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {c.missing.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-300 bg-amber-50">
                          <AlertTriangle className="h-3 w-3" /> Missing: {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map((f) => (
                      <FieldInput
                        key={f.name}
                        field={f}
                        value={c.fields[f.name]}
                        onChange={(v) => updateField(idx, f.name, v)}
                      />
                    ))}
                  </div>
                </Card>
              );
            })}

            {candidates.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No candidates left to save.</div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !candidates.length}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save {candidates.length} record{candidates.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}