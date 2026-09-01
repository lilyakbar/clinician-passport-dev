import { base44 } from "@/api/base44Client";
import JSZip from "jszip";

// Read-only migration export orchestration. Runs entirely in the browser.
// Fetches structured records + file binaries via the exportPassport backend
// function and packages them into portable ZIP archives. Never mutates app data.

const RECORD_LIMIT = 200;
const FILE_SIZE_BATCH_LIMIT = 200 * 1024 * 1024; // 200MB per file archive
const FILE_COUNT_BATCH_LIMIT = 200;

export async function fetchManifest(exportAll) {
  const { data } = await base44.functions.invoke("exportPassport", {
    mode: "manifest",
    export_all: exportAll === true,
  });
  return data;
}

// Paginate records mode until a short batch is returned.
export async function fetchAllRecords(entity, exportAll) {
  const all = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await base44.functions.invoke("exportPassport", {
      mode: "records",
      entity,
      skip,
      limit: RECORD_LIMIT,
      export_all: exportAll === true,
    });
    all.push(...(data.records || []));
    hasMore = data.has_more;
    skip += RECORD_LIMIT;
    if (skip > 100000) break; // hard safety ceiling
  }
  return all;
}

// Download every file binary referenced in the manifest. Returns a map of
// file id -> { blob, content_type, error } and calls onProgress(index, total).
export async function downloadFiles(fileManifest, onProgress) {
  const results = {};
  const total = fileManifest.length;
  for (let i = 0; i < fileManifest.length; i++) {
    const entry = fileManifest[i];
    const url = entry.is_public ? entry.file_value : entry.signed_url;
    if (!url) {
      results[entry.id] = { error: "No downloadable URL (signing failed or missing)" };
    } else {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          results[entry.id] = { error: `HTTP ${res.status} ${res.statusText}` };
        } else {
          const blob = await res.blob();
          const ct = res.headers.get("content-type") || entry.content_type_guess || null;
          results[entry.id] = { blob, content_type: ct };
        }
      } catch (e) {
        results[entry.id] = { error: e?.message || "Fetch failed" };
      }
    }
    if (onProgress) onProgress(i + 1, total);
  }
  return results;
}

function fileZipPath(entry) {
  return `files/${entry.entity}/${entry.record_id}/${entry.field}/${entry.suggested_filename}`;
}

// Build the small data-only archive (always safe): structured records, manifest,
// errors, README. Returns a Blob.
export async function buildDataZip(manifest, recordsByEntity, errors) {
  const zip = new JSZip();
  const dataFolder = zip.folder("data");
  for (const [entity, records] of Object.entries(recordsByEntity)) {
    dataFolder.file(`${entity}.json`, JSON.stringify(records, null, 2));
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("export-errors.json", JSON.stringify(errors, null, 2));
  zip.file(
    "README.json",
    JSON.stringify(
      {
        tool: "Clinician Passport — Migration Export",
        exported_at: manifest.exported_at,
        scope: manifest.scope,
        structure: {
          "data/<Entity>.json": "Complete records for each entity, paginated from the backend.",
          "files/<entity>/<record_id>/<field>/<filename>": "Downloaded file binaries (in file archives).",
          "manifest.json": "Users, schema inventory, file manifest mapping, references.",
          "export-errors.json": "Any file download or signing failures.",
        },
        notes: manifest.notes,
      },
      null,
      2
    )
  );
  return await zip.generateAsync({ type: "blob" });
}

// Build one or more file archives, batched by size/count to bound memory.
// Returns an array of { name, blob, file_count }.
export async function buildFileZips(fileManifest, downloadResults, onBatch) {
  const archives = [];
  let zip = new JSZip();
  let runningSize = 0;
  let count = 0;
  let part = 1;

  const flush = async () => {
    if (count === 0) return;
    const blob = await zip.generateAsync({ type: "blob" });
    archives.push({ name: `passport-export-files-part-${part}.zip`, blob, file_count: count });
    if (onBatch) onBatch(archives.length);
    part++;
    zip = new JSZip();
    runningSize = 0;
    count = 0;
  };

  for (const entry of fileManifest) {
    const res = downloadResults[entry.id];
    if (!res || res.error || !res.blob) continue; // errors recorded separately
    const size = res.blob.size || 0;
    if (count > 0 && (runningSize + size > FILE_SIZE_BATCH_LIMIT || count + 1 > FILE_COUNT_BATCH_LIMIT)) {
      await flush();
    }
    zip.file(fileZipPath(entry), res.blob);
    // Attach content type as a sidecar so the manifest records it.
    runningSize += size;
    count++;
  }
  await flush();
  return archives;
}

// Enrich the manifest's file entries with download results (exported filename,
// resolved content type, download status) for the final manifest.json.
export function enrichManifest(manifest, downloadResults) {
  return {
    ...manifest,
    files: (manifest.files || []).map((entry) => {
      const res = downloadResults[entry.id] || {};
      return {
        ...entry,
        exported_filename: entry.suggested_filename,
        exported_path: fileZipPath(entry),
        content_type: res.content_type || entry.content_type_guess || null,
        download_status: res.error ? "failed" : "ok",
        download_error: res.error || null,
      };
    }),
  };
}