import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrAdmin } from "../auth";
import { getSupabaseAdmin } from "../supabase";
import { attachBlacklist, findExternalIdsStillInUse } from "../access";
import { collectStorageRefs, FORM_DOCUMENT_FIELDS } from "../../src/lib/documentPaths";

// Log Kandidat / Arsip Kandidat (candidate_logs) — HR only, same as the
// live RLS ("HR Admin Full Access Logs").

const toInt = (v: unknown, def: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function buildLogsQuery(admin: ReturnType<typeof getSupabaseAdmin>, q: any, withCount: boolean) {
  let query = admin
    .from("candidate_logs")
    .select("*, external_data(raw_data)", withCount ? { count: "exact" } : undefined);

  const search = String(q.search || "").trim();
  if (search) {
    // PostgREST .or() syntax: strip characters that would break the filter.
    const s = search.replace(/[,()*%\\]/g, " ").trim();
    if (s) query = query.or(`full_name.ilike.%${s}%,position.ilike.%${s}%`);
  }
  if (isDate(q.startDate)) query = query.gte("date", `${q.startDate}T00:00:00`);
  if (isDate(q.endDate)) query = query.lte("date", `${q.endDate}T23:59:59`);
  if (q.status && q.status !== "all") query = query.eq("status_screening", String(q.status));
  return query.order("archived_at", { ascending: false });
}

// The embed may come back as an array (one-to-many shape).
const flattenEmbed = (rows: any[]) =>
  rows.map((d) =>
    Array.isArray(d.external_data) ? { ...d, external_data: d.external_data[0] ?? null } : d,
  );

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerLogRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // ?page&pageSize&search&startDate&endDate&status
  app.get(
    "/api/logs",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const page = toInt(req.query.page, 1, 100000);
      const pageSize = toInt(req.query.pageSize, 10, 500);
      const from = (page - 1) * pageSize;
      const { data, error, count } = await buildLogsQuery(admin, req.query, true).range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = await attachBlacklist(admin, flattenEmbed(data || []));
      res.json({ rows, total: count ?? 0 });
    }),
  );

  // Excel export: same filters, no pagination, only the exported columns.
  app.get(
    "/api/logs/export",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const { data, error } = await buildLogsQuery(admin, req.query, false);
      if (error) throw error;
      auditLog(req, "logs.export", { rows: data?.length ?? 0 });
      res.json({
        rows: (data || []).map((c: any) => ({
          full_name: c.full_name,
          position: c.position,
          email: c.email,
          phone: c.phone,
          psikotes_status: c.psikotes_status,
          interview_status: c.interview_status,
          status_screening: c.status_screening,
          ai_screening_score: c.ai_screening_score,
          source_info: c.source_info,
        })),
      });
    }),
  );

  // Delete archived applications + their files. A linked form (and its
  // documents) is only deleted when no other application still uses it.
  app.post(
    "/api/logs/delete",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const ids: string[] = Array.isArray(req.body?.ids)
        ? Array.from(new Set(req.body.ids.filter((v: unknown) => typeof v === "string")))
        : [];
      if (ids.length === 0) throw new HttpError(400, "Tidak ada kandidat yang dipilih.");
      if (ids.length > 500) throw new HttpError(400, "Maksimal 500 kandidat per penghapusan.");

      const admin = getSupabaseAdmin();
      const { data: logs, error: fetchError } = await admin
        .from("candidate_logs")
        .select("id, resume_url, psikotes_result_url, linked_external_id")
        .in("id", ids);
      if (fetchError) throw fetchError;
      if (!logs || logs.length === 0) throw new HttpError(404, "Kandidat tidak ditemukan.");

      const linkedIds = Array.from(
        new Set(logs.map((c) => c.linked_external_id).filter((u): u is string => !!u)),
      );
      const stillInUse = await findExternalIdsStillInUse(admin, linkedIds, ids);
      const externalIdsToDelete = linkedIds.filter((uid) => !stillInUse.has(uid));

      const fileValues: Array<string | null> = logs.flatMap((c) => [c.resume_url, c.psikotes_result_url]);
      if (externalIdsToDelete.length > 0) {
        const { data: forms, error } = await admin
          .from("external_data")
          .select("raw_data")
          .in("uid_sheet", externalIdsToDelete);
        if (error) throw error;
        for (const f of forms || []) {
          const raw = (f.raw_data || {}) as Record<string, any>;
          for (const field of FORM_DOCUMENT_FIELDS) fileValues.push(raw[field]);
        }
      }

      // Rows first, files last: a failed file removal then only leaves an
      // orphaned file, never a row pointing at a deleted file.
      if (externalIdsToDelete.length > 0) {
        const { error } = await admin.from("external_data").delete().in("uid_sheet", externalIdsToDelete);
        if (error) throw error;
      }
      const deletedIds = logs.map((c) => c.id);
      const { error: deleteError } = await admin.from("candidate_logs").delete().in("id", deletedIds);
      if (deleteError) throw deleteError;

      const refs = collectStorageRefs(fileValues);
      let filesFailed = 0;
      const byBucket = new Map<string, string[]>();
      refs.forEach((r) => byBucket.set(r.bucket, [...(byBucket.get(r.bucket) || []), r.path]));
      for (const [bucket, paths] of byBucket) {
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
          if (error) {
            filesFailed += Math.min(100, paths.length - i);
            console.error(`Error removing files from ${bucket}:`, error);
          }
        }
      }

      auditLog(req, "logs.delete", {
        ids: deletedIds,
        externalDeleted: externalIdsToDelete.length,
        externalKept: linkedIds.length - externalIdsToDelete.length,
        files: refs.length,
        filesFailed,
      });
      res.json({
        deleted: deletedIds.length,
        externalDeleted: externalIdsToDelete.length,
        externalKept: linkedIds.length - externalIdsToDelete.length,
        filesRemoved: refs.length - filesFailed,
        filesFailed,
      });
    }),
  );
}
