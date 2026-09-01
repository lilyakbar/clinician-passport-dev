import React, { useState } from "react";
import { ShieldAlert, Download, FileArchive, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchManifest, fetchAllRecords, downloadFiles, buildDataZip, buildFileZips, enrichManifest,
} from "@/lib/exportRunner";

const EXPORT_ENTITIES = [
  "User", "Profile", "Credential", "ContinuingEducation", "Document", "Reminder",
  "ComplianceProfile", "CareerHistory", "Education", "Research", "Publication",
  "Presentation", "Conference", "Volunteering", "Leadership", "Membership",
  "CareerGoal", "Opportunity", "Application", "CareerLensWorkspace",
];

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function Export() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(null);
  const [archives, setArchives] = useState([]);
  const [errors, setErrors] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [recordCounts, setRecordCounts] = useState({});
  const [done, setDone] = useState(false);

  if (!user) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (user.role !== "admin") {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-danger mt-0.5" />
            <div>
              <div className="font-semibold">Admin access required</div>
              <div className="text-sm text-muted-foreground mt-1">
                The migration export tool is restricted to administrators.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const runExport = async () => {
    setRunning(true);
    setDone(false);
    setArchives([]);
    setErrors([]);
    setErrorCount(0);
    setRecordCounts({});
    try {
      setPhase("Fetching manifest…");
      const manifest = await fetchManifest(true);
      const fileManifest = manifest.files || [];

      setPhase("Fetching records…");
      const recordsByEntity = {};
      for (const entity of EXPORT_ENTITIES) {
        const records = await fetchAllRecords(entity, true);
        recordsByEntity[entity] = records;
        setRecordCounts((c) => ({ ...c, [entity]: records.length }));
      }

      setPhase("Downloading file binaries…");
      const downloadResults = await downloadFiles(fileManifest, (i, total) => {
        setProgress({ i, total });
      });
      const fileErrors = [];
      for (const entry of fileManifest) {
        const res = downloadResults[entry.id];
        if (!res || res.error) {
          fileErrors.push({
            entity: entry.entity,
            record_id: entry.record_id,
            field: entry.field,
            file_value: entry.file_value,
            error: res?.error || "No result",
          });
        }
      }

      setPhase("Packaging archives…");
      const enriched = enrichManifest(manifest, downloadResults);
      const allErrors = [...fileErrors];
      setErrors(allErrors);
      setErrorCount(allErrors.length);

      const dataZip = await buildDataZip(enriched, recordsByEntity, allErrors);
      const dataArchive = { name: "passport-export-data.zip", blob: dataZip, file_count: 0 };
      setArchives([{ ...dataArchive, kind: "data" }]);

      const fileArchives = await buildFileZips(fileManifest, downloadResults, (n) => {
        setPhase(`Packaging file archives… (${n} done)`);
      });
      setArchives((prev) => [...prev, ...fileArchives.map((a) => ({ ...a, kind: "files" }))]);

      setPhase("Complete");
      setDone(true);
    } catch (e) {
      setErrors((prev) => [...prev, { error: e?.message || "Export failed", fatal: true }]);
      setErrorCount((c) => c + 1);
      setPhase("Export failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <h1 className="text-[26px] font-heading font-semibold tracking-tight">Migration Export</h1>
          <Badge variant="warning" className="ml-1">Admin tool</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Read-only export of every Clinician Passport record and referenced file for migration off Base44.
          No application data is created, updated, or deleted. Structured records and downloaded files
          are packaged into portable ZIP archives.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export scope</CardTitle>
          <CardDescription>
            This run exports <strong>all users</strong> (admin mode). Records include original IDs,
            ownership fields, relationship IDs, provenance fields, and verbatim ComplianceProfile
            requirements. Private files are downloaded via signed URLs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runExport} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {running ? "Exporting…" : "Start full export"}
          </Button>
          {running && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="text-muted-foreground">{phase}</div>
              {progress && (
                <div className="text-muted-foreground">
                  Files: {progress.i} / {progress.total}
                </div>
              )}
              {Object.keys(recordCounts).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {EXPORT_ENTITIES.filter((e) => recordCounts[e] > 0).map((e) => (
                    <Badge key={e} variant="outline" className="text-[10px]">
                      {e}: {recordCounts[e]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {done && errorCount > 0 && (
        <Card className="border-warning/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-warning">
                Export is incomplete — {errorCount} file error{errorCount !== 1 ? "s" : ""}.
              </div>
              <div className="text-muted-foreground mt-1">
                The data archive and all successfully downloaded files are available below. Failures are
                recorded in <code className="text-xs">export-errors.json</code> inside the data archive.
                Re-run the export to retry failed files (signed URLs are re-minted each run).
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {archives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileArchive className="h-4 w-4" /> Download archives
            </CardTitle>
            <CardDescription>
              {archives.length} archive{archives.length !== 1 ? "s" : ""}. The data archive contains all
              structured records, <code className="text-xs">manifest.json</code>, and{" "}
              <code className="text-xs">export-errors.json</code>. File archives contain downloaded binaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {archives.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.kind === "data" ? "Structured data + manifest + errors" : `${a.file_count} file${a.file_count !== 1 ? "s" : ""}`}
                    {" · "}~{(a.blob.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => triggerDownload(a.blob, a.name)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {done && errorCount === 0 && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Export complete — all records and files packaged.
        </div>
      )}
    </div>
  );
}