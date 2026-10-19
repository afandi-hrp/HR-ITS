import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, type AuthProfile } from "../auth";
import { getSupabaseAdmin } from "../supabase";
import { getAccessibleExternalUids, getAssignedCandidateIds, isHrAdmin, sanitizeRawData } from "../access";
import {
  collectStorageRefs,
  FORM_DOCUMENT_FIELDS,
  LEGACY_BUCKET,
  PRIVATE_BUCKET,
  SALARY_FORM_FIELDS,
} from "../../src/lib/documentPaths";

const SIGNABLE_BUCKETS = [PRIVATE_BUCKET, LEGACY_BUCKET];

// Storage objects a non-HR user may open: documents of the forms linked to
// their assigned candidates (minus remuneration files for USER_MANAGER) and
// those candidates' CV / psikotes result. Cached briefly because every
// avatar in a list triggers its own signed-url request.
const CACHE_TTL_MS = 60_000;
const allowedCache = new Map<string, { expires: number; keys: Set<string> }>();

// Call after anything that changes which forms a candidate is linked to.
export function invalidateDocumentAccessCache() {
  allowedCache.clear();
}

async function getAllowedObjectKeys(profile: AuthProfile): Promise<Set<string>> {
  const cached = allowedCache.get(profile.id);
  if (cached && cached.expires > Date.now()) return cached.keys;

  const admin = getSupabaseAdmin();
  const values: Array<string | null | undefined> = [];

  const candidateIds = await getAssignedCandidateIds(admin, profile.id);
  if (candidateIds.length > 0) {
    const { data, error } = await admin
      .from("candidates")
      .select("resume_url, psikotes_result_url")
      .in("id", candidateIds);
    if (error) throw error;
    (data || []).forEach((c) => values.push(c.resume_url, c.psikotes_result_url));
  }

  const uids = await getAccessibleExternalUids(admin, profile);
  if (uids !== "all" && uids.size > 0) {
    const { data, error } = await admin
      .from("external_data")
      .select("raw_data")
      .in("uid_sheet", Array.from(uids));
    if (error) throw error;
    for (const row of data || []) {
      const raw = sanitizeRawData((row.raw_data || {}) as Record<string, any>, profile);
      for (const field of FORM_DOCUMENT_FIELDS) values.push(raw[field]);
    }
  }

  const keys = new Set(collectStorageRefs(values).map((r) => `${r.bucket}/${r.path}`));
  allowedCache.set(profile.id, { expires: Date.now() + CACHE_TTL_MS, keys });
  return keys;
}

// Storage keys of remuneration documents in any form (hidden from READ_ONLY).
let salaryCache: { expires: number; keys: Set<string> } | null = null;
async function getSalaryObjectKeys(): Promise<Set<string>> {
  if (salaryCache && salaryCache.expires > Date.now()) return salaryCache.keys;
  const fields = SALARY_FORM_FIELDS.filter((f) => (FORM_DOCUMENT_FIELDS as readonly string[]).includes(f));
  const { data, error } = await getSupabaseAdmin()
    .from("external_data")
    .select(fields.map((f) => `${f}:raw_data->>${f}`).join(", "));
  if (error) throw error;
  const values = (data || []).flatMap((row: any) => fields.map((f) => row[f]));
  const keys = new Set(collectStorageRefs(values).map((r) => `${r.bucket}/${r.path}`));
  salaryCache = { expires: Date.now() + CACHE_TTL_MS, keys };
  return keys;
}

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerDocumentRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // Resolve a storage path into a short-lived signed URL (private bucket or
  // the legacy one). Used to be open to any logged-in user for any path.
  app.get(
    "/api/documents/signed-url",
    requireAuth,
    handle(async (req, res) => {
      const path = req.query?.path;
      const bucket = String(req.query?.bucket || PRIVATE_BUCKET);
      if (!path || typeof path !== "string") throw new HttpError(400, "Parameter path wajib diisi.");
      if (!SIGNABLE_BUCKETS.includes(bucket)) throw new HttpError(400, "Bucket tidak valid.");

      if (req.profile.role === "READ_ONLY") {
        // Every document except remuneration files (payslip, signature).
        const salaryKeys = await getSalaryObjectKeys();
        if (salaryKeys.has(`${bucket}/${path}`)) {
          auditLog(req, "documents.denied", { bucket, path });
          throw new HttpError(403, "Anda tidak memiliki akses ke dokumen ini.");
        }
      } else if (!isHrAdmin(req.profile)) {
        const allowed = await getAllowedObjectKeys(req.profile);
        if (!allowed.has(`${bucket}/${path}`)) {
          auditLog(req, "documents.denied", { bucket, path });
          throw new HttpError(403, "Anda tidak memiliki akses ke dokumen ini.");
        }
      }

      const { data, error } = await getSupabaseAdmin().storage.from(bucket).createSignedUrl(path, 600);
      if (error || !data) throw new HttpError(404, "Dokumen tidak ditemukan.");
      res.json({ url: data.signedUrl });
    }),
  );
}
