// Pure helpers shared by the browser (documentStorage.ts) and the backend
// (server/*) for interpreting a stored document reference. No imports on
// purpose — server code must be able to load this without pulling in the
// browser Supabase client.

export const PRIVATE_BUCKET = "candidate-documents-private";
export const LEGACY_BUCKET = "candidate-documents";
const PRIVATE_BUCKET_MARKER = `/${PRIVATE_BUCKET}/`;
const LEGACY_BUCKET_MARKER = `/${LEGACY_BUCKET}/`;

// Document fields inside external_data.raw_data (application form).
export const FORM_DOCUMENT_FIELDS = [
  "photo_url",
  "ktp_url",
  "ijazah_url",
  "transcript_url",
  "other_doc_url",
  "payslip_url",
  "portfolio_url",
  "signature_url",
  "remuneration_signature_url",
] as const;

// Remuneration data hidden from USER_MANAGER (see usePermissions.hideSalary).
export const SALARY_FORM_FIELDS = [
  "current_salary",
  "expected_salary",
  "payslip_url",
  "remuneration_signature_url",
  "remuneration_signature_name",
  "remuneration_signature_date",
] as const;

export type DocumentRef =
  | { kind: "storage"; bucket: string; path: string }
  | { kind: "external"; url: string } // Google Drive, job boards, ...
  | { kind: "inline"; value: string }; // data: URL (signatures)

// Legacy rows hold a full URL into one of our buckets (sometimes malformed,
// e.g. missing /storage/v1/), newer ones a bare path into the private
// bucket. Either way, extract bucket + path instead of trusting the URL.
export function parseDocumentRef(pathOrUrl: string): DocumentRef | null {
  const value = pathOrUrl.trim();
  if (!value) return null;
  if (value.startsWith("data:")) return { kind: "inline", value };
  if (value.includes(PRIVATE_BUCKET_MARKER)) {
    const path = value.split(PRIVATE_BUCKET_MARKER)[1]?.split("?")[0];
    return path ? { kind: "storage", bucket: PRIVATE_BUCKET, path } : null;
  }
  if (value.includes(LEGACY_BUCKET_MARKER)) {
    const path = value.split(LEGACY_BUCKET_MARKER)[1]?.split("?")[0];
    return path ? { kind: "storage", bucket: LEGACY_BUCKET, path } : null;
  }
  if (value.startsWith("http")) return { kind: "external", url: value };
  return { kind: "storage", bucket: PRIVATE_BUCKET, path: value };
}

// other_doc_url / payslip_url / portfolio_url may hold several
// comma-separated files. data: URLs contain a comma themselves ("base64,")
// and must never be split.
export function splitDocumentList(pathOrUrl: string | null | undefined): string[] {
  if (!pathOrUrl) return [];
  if (pathOrUrl.startsWith("data:")) return [pathOrUrl];
  return pathOrUrl
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Every storage object referenced by the given values, de-duplicated.
export function collectStorageRefs(
  values: Array<string | null | undefined>,
): Array<{ bucket: string; path: string }> {
  const seen = new Set<string>();
  const out: Array<{ bucket: string; path: string }> = [];
  for (const v of values) {
    for (const part of splitDocumentList(v)) {
      const ref = parseDocumentRef(part);
      if (ref?.kind !== "storage") continue;
      const key = `${ref.bucket}/${ref.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ bucket: ref.bucket, path: ref.path });
    }
  }
  return out;
}
