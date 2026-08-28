import { base44 } from "@/api/base44Client";

// Legacy uploads used UploadFile and stored a directly-accessible public URL.
// New uploads use UploadPrivateFile and store a private file_uri that requires
// a signed URL to open. This helper lets the UI treat both shapes uniformly.

export function isPublicFileUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

// Resolve a stored file value to an openable URL.
// - Legacy public URLs are returned as-is.
// - Private file_uris are converted to a temporary signed URL.
export async function resolveFileUrl(value, expiresIn = 300) {
  if (!value) return null;
  if (isPublicFileUrl(value)) return value;
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
    file_uri: value,
    expires_in: expiresIn,
  });
  return signed_url;
}

// Resolve and open the file in a new tab.
export async function openFile(value, expiresIn) {
  const url = await resolveFileUrl(value, expiresIn);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}