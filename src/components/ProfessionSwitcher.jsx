import React from "react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Stethoscope, Check, Lock } from "lucide-react";
import { useProfession } from "@/professions/ProfessionContext";
import { cn } from "@/lib/utils";

export default function ProfessionSwitcher() {
  const { professionKey, setProfession, professions, futureProfessions } = useProfession();
  const active = professions.find((p) => p.key === professionKey) || professions[0];

  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5">
      <div className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
        Profession Pack
      </div>
      <Select value={professionKey} onValueChange={(v) => setProfession(v)}>
        <SelectTrigger className="h-auto py-2 text-left bg-transparent border-white/10 text-sidebar-foreground hover:bg-white/5 hover:border-white/20 focus:ring-accent/30">
          <div className="flex items-center gap-2.5 w-full">
            <div className="h-7 w-7 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
              <Stethoscope className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[12.5px] font-semibold text-white truncate">{active?.label || "Select"}</div>
              <div className="text-[10.5px] text-sidebar-foreground/50 truncate">{active?.badge || "Module"}</div>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider">Active modules</SelectLabel>
            {professions.map((p) => (
              <SelectItem key={p.key} value={p.key} className="text-xs">
                <div className="flex items-center justify-between w-full">
                  <span>{p.label}</span>
                  {p.badge && <span className="ml-2 text-[10px] text-muted-foreground">· {p.badge}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider">Future packs</SelectLabel>
            {futureProfessions.map((p) => (
              <SelectItem key={p.key} value={p.key} disabled className="text-xs opacity-50">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3" /> {p.label}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}