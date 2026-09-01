import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import JurisdictionCard from "@/components/compliance/JurisdictionCard";
import CredentialFormDialog from "@/components/credentials/CredentialFormDialog";
import {
  Loader2, RefreshCw, ShieldCheck, AlertTriangle, Award, Info,
} from "lucide-react";
import { useProfession } from "@/professions/ProfessionContext";

export default function ComplianceIntelligence() {
  const { professionModule } = useProfession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Preselect the profession's primary license type when opening Add a License.
  const licenseType = professionModule.credentialTypes.find((t) => /license/i.test(t)) || professionModule.credentialTypes[0];

  const load = async (force = false) => {
    setLoading(!data);
    setRefreshing(true);
    try {
      const res = await base44.functions.invoke("analyzeCompliance", {
        force_refresh: force,
        profession: professionModule.key,
      });
      setData(res.data);
    } catch (e) {
      setData({ error: e.message });
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [professionModule.key]);

  const handleConfirmSuggestion = async (id) => {
    await base44.entities.CeApplicability.update(id, { status: "confirmed" });
    load(false);
  };

  const handleRejectSuggestion = async (id) => {
    await base44.entities.CeApplicability.update(id, { status: "rejected" });
    load(false);
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
          <p className="text-sm text-muted-foreground">Researching current regulatory requirements…</p>
        </div>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Intelligence" description="Jurisdiction-specific CE and licensure requirements, compared against your documented CE." />
        <Card className="p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-danger mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{data.error}</p>
          <Button onClick={() => load()} variant="outline" className="mt-4">Try again</Button>
        </Card>
      </div>
    );
  }

  if (data?.no_licenses) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Intelligence" description="Jurisdiction-specific CE and licensure requirements, compared against your documented CE." />
        <Card className="p-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Award className="h-7 w-7 text-accent" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1.5">No active licenses found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            Add a state dental license with a jurisdiction in Credentials to unlock jurisdiction-specific compliance intelligence.
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Award className="h-4 w-4" /> Add a License
          </Button>
        </Card>
        <CredentialFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          editing={null}
          professionModule={professionModule}
          defaultType={licenseType}
          onSaved={() => load(true)}
        />
      </div>
    );
  }

  const jurisdictions = data?.jurisdictions || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Intelligence"
        description="Current CE and licensure requirements for each active license, compared against your documented CE."
      >
        <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </PageHeader>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-4 py-3">
        <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Informational only — not legal compliance verification.</span>{" "}
          Requirements are retrieved from public regulatory sources and may change. Always confirm current requirements directly with your licensing board.
        </p>
      </div>

      {/* Jurisdiction cards */}
      <div className="grid lg:grid-cols-2 gap-5">
        {jurisdictions.map((j) => (
          <JurisdictionCard
            key={j.jurisdiction}
            data={j}
            onConfirmSuggestion={handleConfirmSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
          />
        ))}
      </div>

      {/* Multi-state optimization CTA */}
      {jurisdictions.length > 1 && (
        <Card className="p-6 bg-gradient-to-br from-accent-soft/40 to-card border-accent/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-heading font-semibold text-[18px] mb-1">Multi-State CE Optimization</h3>
              <p className="text-sm text-muted-foreground">
                You hold licenses in {jurisdictions.length} states. Ask My Career can find CE courses that satisfy overlapping requirements across all of them.
              </p>
            </div>
            <Button asChild>
              <Link to={`/ask-my-career?mode=optimize_ce&q=I hold dental licenses in ${jurisdictions.map(j => j.jurisdiction).join(" and ")}. What CE do I still need, and which courses could count toward multiple states?`}>
                <ShieldCheck className="h-4 w-4" /> Optimize Across States
              </Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}