import { supabase } from "./supabase";
import { fetchWithRetry } from "./utils";

const LEGACY_BUCKET_MARKER = "/candidate-documents/";
const PRIVATE_BUCKET = "candidate-documents-private";
const PRIVATE_BUCKET_MARKER = "/candidate-documents-private/";

// Documents uploaded before the private-bucket migration are stored as full
// public URLs (https://.../candidate-documents/...) and keep working as-is.
// Signatures are stored as inline base64 data: URLs (canvas.toDataURL()),
// never uploaded to Storage at all, and also pass through unchanged.
// Documents uploaded after the migration are stored as bare storage paths
// (e.g. "candidates/photo-123.jpg") into candidate-documents-private, and
// must be resolved into a short-lived signed URL before use.
export async function resolveDocumentUrl(
  pathOrUrl: string | null | undefined,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;

  let path: string;
  let bucket = PRIVATE_BUCKET;
  if (pathOrUrl.includes(PRIVATE_BUCKET_MARKER)) {
    // Some sources (e.g. n8n's own CV upload, using its own service_role
    // credentials) store a full URL into our private bucket instead of a
    // bare path — and that URL is sometimes malformed (missing
    // /storage/v1/, which Kong needs to route it, resulting in a
    // "Kong Error: Unauthorized" page instead of the file). Extract the
    // path and always mint our own fresh, correctly-formed signed URL
    // rather than trusting the stored URL's shape.
    const extracted = pathOrUrl.split(PRIVATE_BUCKET_MARKER)[1]?.split("?")[0];
    if (!extracted) return null;
    path = extracted;
  } else if (pathOrUrl.includes(LEGACY_BUCKET_MARKER)) {
    // Legacy bucket, now also private — same treatment.
    const extracted = pathOrUrl.split(LEGACY_BUCKET_MARKER)[1]?.split("?")[0];
    if (!extracted) return null;
    path = extracted;
    bucket = "candidate-documents";
  } else if (pathOrUrl.startsWith("http")) {
    return pathOrUrl; // external source (Drive, job boards, etc.) — use as-is
  } else {
    path = pathOrUrl; // bare path, already private-bucket-relative
  }

  try {
    const response = await fetchWithRetry(
      `/api/documents/signed-url?path=${encodeURIComponent(path)}&bucket=${encodeURIComponent(bucket)}`,
      { method: "GET" },
      1,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return (data.url as string) || null;
  } catch {
    return null;
  }
}

// Some fields (other_doc_url, payslip_url) can hold multiple comma-separated
// files, each of which may independently be a legacy URL or a new bare path.
export async function removeDocumentFile(
  pathOrUrl: string | null | undefined,
): Promise<void> {
  if (!pathOrUrl) return;

  // data: URLs (signatures) always contain a comma themselves (the
  // "base64," marker) and must never be split like a multi-file list.
  const parts = pathOrUrl.startsWith("data:")
    ? [pathOrUrl]
    : pathOrUrl.includes(",")
      ? pathOrUrl.split(",").map((s) => s.trim()).filter(Boolean)
      : [pathOrUrl];

  await Promise.all(parts.map((part) => removeSingleDocumentFile(part)));
}

async function removeSingleDocumentFile(pathOrUrl: string): Promise<void> {
  if (pathOrUrl.startsWith("data:")) return; // inline signature, nothing to remove from Storage

  let bucket = PRIVATE_BUCKET;
  let path = pathOrUrl;

  if (pathOrUrl.includes(LEGACY_BUCKET_MARKER)) {
    const extracted = pathOrUrl.split(LEGACY_BUCKET_MARKER)[1];
    if (!extracted) return;
    bucket = "candidate-documents";
    path = extracted.split("?")[0];
  } else if (pathOrUrl.includes(PRIVATE_BUCKET_MARKER)) {
    // Some sources (e.g. n8n's own CV upload, which writes directly to our
    // private bucket with its own service_role credentials) store the full
    // signed/public URL in resume_url instead of a bare path — this still
    // needs its path extracted for deletion just like a bare path would.
    const extracted = pathOrUrl.split(PRIVATE_BUCKET_MARKER)[1];
    if (!extracted) return;
    bucket = PRIVATE_BUCKET;
    path = extracted.split("?")[0];
  } else if (pathOrUrl.startsWith("http")) {
    return; // unrecognized external URL (Google Drive, job boards, etc.), nothing safe to remove
  }

  // Routed through the server (service_role, bypasses RLS) instead of a
  // direct client-side .remove() call — the client-side DELETE RLS policy
  // was observed to return 200 OK while matching zero rows on this
  // self-hosted storage-api instance, silently leaving files in place, for
  // both the private bucket and the legacy public one.
  const response = await fetchWithRetry(
    "/api/documents/remove",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, bucket }),
    },
    1,
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Gagal menghapus dokumen.");
  }
}
