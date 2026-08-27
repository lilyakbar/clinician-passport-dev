import React from "react";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, AlertTriangle } from "lucide-react";

export function MatchBadge({ state }) {
  if (state === "duplicate") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="h-3 w-3" /> Already in Passport
      </Badge>
    );
  }
  if (state === "possible") {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> Possible Match
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1">
      <Plus className="h-3 w-3" /> New
    </Badge>
  );
}