import { supabase } from "./supabase";
import { fetchWithRetry } from "./utils";

const LEGACY_BUCKET_MARKER = "/candidate-documents/";
const PRIVATE_BUCKET = "candidate-documents-private";

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
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) return pathOrUrl;

  try {
    const response = await fetchWithRetry(
      `/api/documents/signed-url?path=${encodeURIComponent(pathOrUrl)}`,
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

  const parts = pathOrUrl.includes(",")
    ? pathOrUrl.split(",").map((s) => s.trim()).filter(Boolean)
    : [pathOrUrl];

  await Promise.all(parts.map((part) => removeSingleDocumentFile(part)));
}

async function removeSingleDocumentFile(pathOrUrl: string): Promise<void> {
  if (pathOrUrl.includes(LEGACY_BUCKET_MARKER)) {
    const path = pathOrUrl.split(LEGACY_BUCKET_MARKER)[1];
    if (path) {
      const { error } = await supabase.storage.from("candidate-documents").remove([path]);
      if (error) throw error;
    }
    return;
  }

  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) return; // legacy URL / inline signature, nothing to remove from Storage

  // Routed through the server (service_role, bypasses RLS) instead of a
  // direct client-side .remove() call — the client-side DELETE RLS policy
  // on this bucket was observed to return 200 OK while matching zero rows
  // on this self-hosted storage-api instance, silently leaving files in
  // place.
  const response = await fetchWithRetry(
    "/api/documents/remove",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathOrUrl }),
    },
    1,
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Gagal menghapus dokumen.");
  }
}
