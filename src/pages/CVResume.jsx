import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";
import ResumeBuilder from "@/pages/ResumeBuilder";

export default function CVResume() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-heading font-semibold tracking-tight text-foreground">
            CV / Resume
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            Build a tailored CV or resume from your Passport, or import an existing one.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link to="/import-cv"><UploadCloud className="h-4 w-4" /> Import CV / Resume</Link>
          </Button>
        </div>
      </div>

      <ResumeBuilder />
    </div>
  );
}