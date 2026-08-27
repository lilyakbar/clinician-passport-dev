import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { MatchItem } from "./MatchItem";
import { ProfileReview } from "./ProfileReview";
import { useProfession } from "@/professions/ProfessionContext";

export function MatchSectionReview({ meta, data, sectionMatches, decisions, onDecision }) {
  const [expanded, setExpanded] = useState(true);
  const isProfile = meta.key === "profile";
  const { profile } = useProfession();
  const items = isProfile ? (data ? [data] : []) : (Array.isArray(data) ? data : []);
  if (!items.length) return null;

  const counts = { new: 0, duplicate: 0, possible: 0 };
  items.forEach((_, i) => {
    const s = isProfile ? "new" : (sectionMatches?.[i]?.state || "new");
    counts[s] = (counts[s] || 0) + 1;
  });

  const profileState = isProfile ? (profile?.id ? "update" : "create") : null;

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", meta.color)}>
            <meta.icon className="h-4 w-4" />
          </div>
          <div>
            <span className="font-heading font-semibold text-[15px]">{meta.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProfile ? (
            profileState === "update"
              ? <Badge variant="secondary" className="text-[11px]">Profile Update</Badge>
              : <Badge variant="default" className="text-[11px]">Create Profile</Badge>
          ) : (
            <>
              {counts.new > 0 && <Badge variant="default" className="text-[11px]">{counts.new} new</Badge>}
              {counts.duplicate > 0 && <Badge variant="secondary" className="text-[11px]">{counts.duplicate} existing</Badge>}
              {counts.possible > 0 && <Badge variant="warning" className="text-[11px]">{counts.possible} possible</Badge>}
            </>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((item, i) => (
            isProfile ? (
              <ProfileReview
                key={i}
                extractedProfile={item}
                decision={decisions[`${meta.key}.${i}`]}
                onChange={(val) => onDecision(meta.key, i, val)}
              />
            ) : (
              <MatchItem
                key={i}
                section={meta.key}
                item={item}
                match={sectionMatches?.[i]}
                decision={decisions[`${meta.key}.${i}`]}
                onChange={(val) => onDecision(meta.key, i, val)}
              />
            )
          ))}
        </div>
      )}
    </Card>
  );
}