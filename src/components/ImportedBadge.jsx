import React from "react";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

// Displays an "Imported from CV" provenance badge for records whose `source`
// field is "cv_import". This is the visible "self-reported / unverified" signal
// for credentials and CE imported via the CV Import pipeline.
export function ImportedBadge({ source, className }) {
  if (!source || source !== "cv_import") return null;
  return (
    <Badge variant="outline" className={`gap-1 text-muted-foreground ${className || ""}`}>
      <FileText className="h-3 w-3" /> Imported from CV
    </Badge>
  );
}

export default ImportedBadge;