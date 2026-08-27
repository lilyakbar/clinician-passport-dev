import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function FieldInput({ field, value, onChange }) {
  const colSpan = field.colSpan === 2 ? "sm:col-span-2" : "";
  return (
    <div className={`space-y-1 ${colSpan}`}>
      <Label className="text-xs text-muted-foreground">{field.label}</Label>
      {field.type === "text" && (
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "textarea" && (
        <Textarea rows={2} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "date" && (
        <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "number" && (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      )}
      {field.type === "boolean" && (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(v)} />
          <span className="text-xs text-muted-foreground">Yes</span>
        </div>
      )}
      {field.type === "select" && (
        <Select value={value ?? ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}