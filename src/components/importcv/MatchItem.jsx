import React from "react";
import { cn } from "@/lib/utils";
import { MatchBadge } from "./MatchBadge";
import { getEntryLabel, getEntrySubtitle } from "./entryLabels";

const DECISIONS = {
  new: [
    { value: "import", label: "Import" },
    { value: "skip", label: "Skip" },
  ],
  duplicate: [
    { value: "skip", label: "Skip" },
    { value: "import_separately", label: "Import Separately" },
  ],
  possible: [
    { value: "skip", label: "Skip" },
    { value: "update_existing", label: "Update Existing" },
    { value: "import_separately", label: "Import Separately" },
  ],
};

function DecisionPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
            value === opt.value
              ? "bg-accent text-white border-accent"
              : "bg-card text-muted-foreground border-border hover:bg-muted/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MatchItem({ section, item, match, decision, onChange }) {
  const state = match?.state || "new";
  const options = DECISIONS[state] || DECISIONS.new;
  const showExisting = (state === "possible" || state === "duplicate") && match?.matchRecord;

  return (
    <div
      className={cn(
        "px-5 py-3.5",
        state === "duplicate" ? "bg-muted/10" : state === "possible" ? "bg-warning/5" : "bg-accent/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <MatchBadge state={state} />
          </div>
          <div className="text-sm font-medium truncate">{getEntryLabel(section, item)}</div>
          {getEntrySubtitle(section, item) && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{getEntrySubtitle(section, item)}</div>
          )}
          {item.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{item.description}</div>
          )}
          {showExisting && (
            <div className="mt-2 rounded-md bg-card border border-border px-3 py-2 text-xs">
              <span className="text-muted-foreground">Existing in Passport: </span>
              <span className="font-medium">{getEntryLabel(section, match.matchRecord)}</span>
              {getEntrySubtitle(section, match.matchRecord) && (
                <span className="text-muted-foreground"> · {getEntrySubtitle(section, match.matchRecord)}</span>
              )}
            </div>
          )}
        </div>
        <DecisionPills options={options} value={decision} onChange={onChange} />
      </div>
    </div>
  );
}