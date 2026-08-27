import React, { useState } from "react";
import { Plus } from "lucide-react";
import QuickCaptureDialog from "./QuickCaptureDialog";

export default function QuickCaptureButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-1.5 rounded-full bg-accent text-white shadow-md px-4 py-2.5 text-[13px] font-medium hover:bg-accent/90 hover:shadow-lg transition-all duration-200"
      >
        <Plus className="h-4 w-4" /> Add to My Passport
      </button>
      <QuickCaptureDialog open={open} onOpenChange={setOpen} />
    </>
  );
}