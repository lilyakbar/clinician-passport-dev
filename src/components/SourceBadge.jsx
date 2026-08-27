import React from "react";
import { cn } from "@/lib/utils";
import { FileText, Globe, Link2 } from "lucide-react";

const STYLES = {
  "MY PASSPORT": "bg-primary/8 text-primary border-primary/15",
  "LIVE SOURCE": "bg-accent/10 text-accent border-accent/25",
  BOTH: "bg-accent/10 text-accent border-accent/25",
};

const ICONS = { "MY PASSPORT": FileText, "LIVE SOURCE": Globe, BOTH: Link2 };
const LABELS = { "MY PASSPORT": "My Passport", "LIVE SOURCE": "Live Source", BOTH: "Passport + Live" };

export function SourceBadge({ environment, className, size = "sm" }) {
  const env = environment || "MY PASSPORT";
  const Icon = ICONS[env] || FileText;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        STYLES[env],
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {LABELS[env]}
    </span>
  );
}

export default SourceBadge;