import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

function JsonBlock({ data }) {
  return (
    <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-96 font-mono whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function DropList({ drops }) {
  if (!drops.length) {
    return <p className="text-xs text-muted-foreground">No items dropped at this stage.</p>;
  }
  return (
    <div className="space-y-2">
      {drops.map((d, i) => (
        <div key={i} className="text-xs border border-border rounded p-2.5 bg-card">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Badge variant="outline" className="text-[10px]">{d.stage}</Badge>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground mb-1.5 break-words">
            {JSON.stringify(d.item)}
          </div>
          <div className="text-danger font-medium text-xs">↳ {d.reason}</div>
        </div>
      ))}
    </div>
  );
}

export default function DiagnosticPanel({ diagnostic }) {
  if (!diagnostic) return null;
  const { drops = [], raw_llm_output, post_grounding_pre_gate, post_gate } = diagnostic;
  const groundingDrops = drops.filter(d => d.stage === "grounding");
  const credGateDrops = drops.filter(d => d.stage === "credential_gate");
  const ceGateDrops = drops.filter(d => d.stage === "ce_gate");

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">Diagnostic — Pipeline Trace</CardTitle>
          <Badge variant="warning">temporary</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Shows each pipeline stage and the exact reason any Credential or CE item was dropped. Not persisted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Grounding drops</span>
              <Badge variant={groundingDrops.length ? "danger" : "success"}>{groundingDrops.length}</Badge>
            </div>
            <DropList drops={groundingDrops} />
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Credential gate drops</span>
              <Badge variant={credGateDrops.length ? "danger" : "success"}>{credGateDrops.length}</Badge>
            </div>
            <DropList drops={credGateDrops} />
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">CE gate drops</span>
              <Badge variant={ceGateDrops.length ? "danger" : "success"}>{ceGateDrops.length}</Badge>
            </div>
            <DropList drops={ceGateDrops} />
          </div>
        </div>

        <CollapsibleSection title="Raw LLM output (structured)">
          <JsonBlock data={raw_llm_output} />
        </CollapsibleSection>
        <CollapsibleSection title="Post-grounding, pre-gate">
          <JsonBlock data={post_grounding_pre_gate} />
        </CollapsibleSection>
        <CollapsibleSection title="Post-gate (final)">
          <JsonBlock data={post_gate} />
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}