import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useProfession } from "@/professions/ProfessionContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { UserCircle, Mail, Save, Loader2 } from "lucide-react";

export default function ProfileSettings() {
  const { profile, professionModule, professions, setProfession, updateProfile, loading } = useProfession();
  const { toast } = useToast();

  const [form, setForm] = useState({
    full_name: "",
    specialty: "",
    location: "",
    bio: "",
    career_stage: "",
  });
  const [authEmail, setAuthEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        specialty: profile.specialty || "",
        location: profile.location || "",
        bio: profile.bio || "",
        career_stage: profile.career_stage || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    base44.auth.me().then((me) => setAuthEmail(me?.email || "")).catch(() => {});
  }, []);

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleProfessionChange = async (key) => {
    await setProfession(key);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        full_name: form.full_name,
        specialty: form.specialty,
        location: form.location,
        bio: form.bio,
        career_stage: form.career_stage,
      });
      toast({ title: "Profile saved", description: "Your changes have been persisted." });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save", description: "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const careerStages = professionModule?.careerStages || [];
  const specialtyOptions = professionModule?.specialties || [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center">
          <UserCircle className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="text-[28px] font-heading font-semibold tracking-tight text-foreground">Profile & Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your professional identity and preferences.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Authentication email — read only */}
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Sign-in email</div>
              <div className="text-sm font-medium truncate mt-0.5">{authEmail || profile?.email || "—"}</div>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground/70 border border-border rounded-full px-2.5 py-0.5">Read-only</span>
          </div>
        </Card>

        {/* Editable profile */}
        <Card className="p-6 sm:p-7 space-y-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => handleChange("full_name", e.target.value)}
                placeholder="Dr. Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <Label>Profession track</Label>
              <Select
                value={professionModule?.key}
                onValueChange={handleProfessionChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {professions.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Career stage</Label>
              <Select
                value={form.career_stage}
                onValueChange={(v) => handleChange("career_stage", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a stage" />
                </SelectTrigger>
                <SelectContent>
                  {careerStages.map((stage) => (
                    <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty">Specialty / area of interest</Label>
              <Input
                id="specialty"
                list="specialty-options"
                value={form.specialty}
                onChange={(e) => handleChange("specialty", e.target.value)}
                placeholder="e.g. Orthodontics"
              />
              <datalist id="specialty-options">
                {specialtyOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => handleChange("location", e.target.value)}
                placeholder="City, State"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                rows={5}
                value={form.bio}
                onChange={(e) => handleChange("bio", e.target.value)}
                placeholder="A short professional summary..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}