import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useProfession } from "@/professions/ProfessionContext";
import { RefreshCw, FilePlus2, ArrowRight } from "lucide-react";

const PROFILE_FIELDS = [
  { key: "full_name", label: "Full Name" },
  { key: "credentials_string", label: "Credentials" },
  { key: "specialty", label: "Specialty" },
  { key: "bio", label: "Bio" },
  { key: "location", label: "Location" },
];

function hasValue(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return s !== "" && s.toLowerCase() !== "not provided" && s.toLowerCase() !== "n/a";
}

const pillBase = "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors";
const pillOn = "bg-accent text-white border-accent";
const pillOff = "bg-card text-muted-foreground border-border hover:bg-muted/50";

export function ProfileReview({ extractedProfile, decision, onChange }) {
  const { profile } = useProfession();
  const hasExisting = !!profile?.id;
  const action = decision?.action || (hasExisting ? "update" : "create");

  const changed = [];
  const unchanged = [];
  PROFILE_FIELDS.forEach(({ key, label }) => {
    const cvVal = extractedProfile?.[key];
    const curVal = profile?.[key];
    if (!hasValue(cvVal)) return; // nothing from CV for this field
    if (hasValue(curVal) && String(cvVal).trim() === String(curVal).trim()) {
      unchanged.push({ key, label, value: cvVal });
    } else {
      changed.push({ key, label, current: curVal || "", cv: cvVal });
    }
  });

  const isSelected = (key) =>
    decision?.fields && key in decision.fields ? !!decision.fields[key] : true;

  const setAction = (a) => onChange({ action: a, fields: decision?.fields || {} });
  const toggleField = (key) =>
    onChange({ action, fields: { ...(decision?.fields || {}), [key]: !isSelected(key) } });

  if (!hasExisting) {
    return (
      <div className="px-5 py-4 bg-accent/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Badge variant="default" className="gap-1 mb-2">
              <FilePlus2 className="h-3 w-3" /> Create Profile
            </Badge>
            <div className="text-sm font-medium truncate">
              {extractedProfile?.full_name || "New Profile"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              No existing Profile — this will create your canonical Profile.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button type="button" onClick={() => onChange({ action: "create" })} className={cn(pillBase, action === "create" ? pillOn : pillOff)}>Create Profile</button>
            <button type="button" onClick={() => onChange({ action: "skip" })} className={cn(pillBase, action === "skip" ? pillOn : pillOff)}>Skip</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-accent/5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex-1 min-w-0">
          <Badge variant="secondary" className="gap-1 mb-2">
            <RefreshCw className="h-3 w-3" /> Profile Update
          </Badge>
          <div className="text-sm font-medium truncate">{profile.full_name || "Your Profile"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Review changes from your CV before applying.
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <button type="button" onClick={() => setAction("update")} className={cn(pillBase, action === "update" ? pillOn : pillOff)}>Update Profile</button>
          <button type="button" onClick={() => setAction("keep")} className={cn(pillBase, action === "keep" ? pillOn : pillOff)}>Keep Existing</button>
        </div>
      </div>

      {changed.length > 0 ? (
        <div className="mt-3 space-y-2">
          {action === "update" && (
            <div className="text-xs text-muted-foreground">Select which changes to apply:</div>
          )}
          {changed.map((f) => (
            <div
              key={f.key}
              className={cn(
                "rounded-md border px-3 py-2 flex items-start gap-3",
                action === "update" ? "bg-card border-border" : "bg-muted/30 border-border opacity-70"
              )}
            >
              {action === "update" ? (
                <Checkbox
                  checked={isSelected(f.key)}
                  onCheckedChange={() => toggleField(f.key)}
                  className="mt-0.5"
                />
              ) : (
                <div className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground mb-1">{f.label}</div>
                <div className="flex items-center gap-2 text-sm flex-wrap break-words">
                  <span className="text-muted-foreground line-through">{f.current || "(empty)"}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{f.cv}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          No differences found between your CV and existing Profile.
        </div>
      )}
    </div>
  );
}